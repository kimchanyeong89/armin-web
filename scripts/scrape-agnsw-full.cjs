const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

// CONFIGURATION
const OUTPUT_FILE = path.join(__dirname, '../public/data/agnsw-collection.json');
// We do not rely on the checkpoint file for Resume in this version, 
// instead we trust OUTPUT_FILE as the source of truth for "what we have found".
const TARGETS = [
    {
        name: 'Paintings',
        url: 'https://www.artgallery.nsw.gov.au/collection/search/?images=y&media=painting&sort_by=artist',
        maxPages: 300
    },
    {
        name: 'Drawings',
        url: 'https://www.artgallery.nsw.gov.au/collection/works/?images=y&media=drawing&sort_by=date',
        maxPages: 80 
    },
    {
        name: 'Photographs',
        url: 'https://www.artgallery.nsw.gov.au/collection/works/?images=y&media=photograph&date_from=1980&sort_by=date',
        maxPages: 80
    }
];
const CONCURRENCY = 5;

// Helper to wait
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    console.log('Launching AGNSW Scraper (Multi-Category + OnDisplay Fix)...');
    
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--window-size=1920,1080',
            '--disable-web-security'
        ]
    });

    // LOAD EXISTING DATA
    let allItems = [];
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            allItems = JSON.parse(fs.readFileSync(OUTPUT_FILE));
            console.log(`[Init] Loaded ${allItems.length} existing items.`);
            
            // Fix onDisplay for existing items immediately
            let fixedCount = 0;
            allItems.forEach(item => {
                if (item.location) {
                    const status = !item.location.toLowerCase().includes('not on display');
                    if (item.onDisplay !== status) {
                        item.onDisplay = status;
                        fixedCount++;
                    }
                }
            });
            console.log(`[Init] Updated onDisplay status for ${fixedCount} items.`);
        } catch(e) { console.error("Error reading existing file", e); }
    }

    // Phase 1: Collect Links for ALL Targets
    // To avoid duplicates, use a Set of detailUrls
    const existingUrls = new Set(allItems.map(i => i.detailUrl).filter(Boolean));
    const page = await browser.newPage();
    
    for (const target of TARGETS) {
        console.log(`--- Processing List: ${target.name} ---`);
        
        let targetCount = 0;
        let skippedCount = 0;
        
        for (let p = 1; p <= target.maxPages; p++) {
             const url = `${target.url}&page=${p}`;
             if (p % 5 === 0) console.log(`[List] ${target.name} checking page ${p}...`);
             
             try {
                 await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
                 
                 // Challenge check
                 if ((await page.title()).includes("Client Challenge")) await wait(5000);
                 
                 const items = await page.evaluate((sourceName) => {
                     const els = Array.from(document.querySelectorAll('.artworksList-item'));
                     return els.map(el => {
                         const a = el.querySelector('a');
                         const img = el.querySelector('img');
                         const artistEl = el.querySelector('.card-artwork-artist');
                         const titleEl = el.querySelector('.card-artwork-title');
                         
                         let artist = artistEl ? artistEl.innerText.trim() : "";
                         let title = titleEl ? titleEl.innerText.trim() : "";
                         
                         if (!artist && !title) {
                             const lines = el.innerText.split('\n').filter(s => s.trim().length > 0);
                             if (lines.length >= 2) { artist = lines[0]; title = lines[1]; }
                         }
                         
                         return {
                             id: ('agnsw-' + Math.random().toString(36).substr(2,9)),
                             title: title || 'Untitled',
                             artist: artist || 'Unknown',
                             detailUrl: a ? a.href : null,
                             image: img ? img.src : null,
                             source: 'AGNSW',
                             collectionType: sourceName,
                             category: sourceName.endsWith('s') ? sourceName.slice(0, -1) : sourceName // Default category from target name
                         };
                     });
                 }, target.name); // Pass target name
                 
                 if (items.length === 0) {
                     // Check if it's because no results or error
                     const bodyText = await page.evaluate(() => document.body.innerText);
                     if (bodyText.includes("No artworks found") || bodyText.includes("0 results")) {
                         console.log(`[List] End of results for ${target.name} at page ${p}.`);
                         break;
                     } 
                     // If just empty but not explicitly "no results", might be waiting
                 }
                 
                 // Add new items
                 let newOnPage = 0;
                 for (const item of items) {
                     if (item.detailUrl && !existingUrls.has(item.detailUrl)) {
                         existingUrls.add(item.detailUrl);
                         allItems.push(item);
                         targetCount++;
                         newOnPage++;
                     } else {
                         skippedCount++;
                     }
                 }
                 
                 // Heuristic: If we skipped ALL items on a page, and we have many items, 
                 // we *might* be re-scanning a section we already have. 
                 // AGNSW default sort is by Artist A-Z or Date. 
                 // If sorted by Artist, new items might appear in middle? 
                 // Safest is to scan all. 300 pages is fast enough (15 mins).
                 
                 await wait(200); // polite
                 
             } catch(err) {
                 console.error(`[List] Error ${target.name} p${p}: ${err.message}`);
             }
        }
        console.log(`[List] Finished ${target.name}. Added ${targetCount} new. Skipped/Found ${skippedCount} existing.`);
    }
    
    await page.close();
    
    // Save Link Progress
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));


    // Phase 2: Enrich Details
    console.log(`--- Phase 2: Enriching Metadata ---`);
    
    // Filter for items needing update
    // Needs update if: missing category OR date is suspiciously long (bad scrape) OR category is just 'Artwork'
    const queue = allItems.filter(i => !i.category || (i.date && i.date.length > 50) || i.category === 'Artwork');
    console.log(`[Detail] ${queue.length} items of ${allItems.length} total need detail scraping.`);
    
    // Process Queue
    let processed = 0;
    const total = queue.length;
    
    if (total > 0) {
        for (let i = 0; i < total; i += CONCURRENCY) {
            const batch = queue.slice(i, i + CONCURRENCY);
            
            await Promise.all(batch.map(async (item) => {
                const p = await browser.newPage();
                try {
                    await p.goto(item.detailUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
                    
                    const metadata = await p.evaluate(() => {
                        const data = {};
                        const clean = (s) => s ? s.replace(/\s+/g, ' ').trim() : null;
                        const findValue = (label) => {
                            // Valid AGNSW detail labels are usually in DT tags, or distinct elements.
                            // We prefer DT lookup to avoid matching random text in footer.
                            const xpath = `//dt[contains(text(), '${label}')]`;
                            const res = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                            if (res && res.nextElementSibling) {
                                return clean(res.nextElementSibling.innerText);
                            }
                            // Fallback to broader search if DT fails, but be careful
                            const broadXpath = `//*[contains(text(), '${label}') and not(ancestor::footer) and not(ancestor::nav)]`;
                             const res2 = document.evaluate(broadXpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                            if (!res2) return null;
                            let v = res2.nextElementSibling;
                             // Check for parent sibling logic
                            if (!v && res2.parentElement) {
                                v = res2.parentElement.nextElementSibling;
                            }
                            return v ? clean(v.innerText) : null;
                        };
    
                        data.category = findValue('Media category');
                        data.medium = findValue('Materials used') || findValue('Medium');
                        data.dimensions = findValue('Dimensions');
                        data.date = findValue('Date');
                        data.credit = findValue('Credit');
                        data.location = findValue('Location') || 'Not on display';
                        // Clean 'Not on display' variants
                        if (data.location && data.location.toLowerCase().includes('not on display')) {
                            data.location = 'Not on display';
                        }
                        data.accession = findValue('Accession number');
                        return data;
                    });
                    
                    // Merge metadata. Only overwrite category if found (otherwise keep list-phase default)
                    if (metadata.category) item.category = metadata.category;
                    if (metadata.medium) item.medium = metadata.medium;
                    if (metadata.dimensions) item.dimensions = metadata.dimensions;
                    if (metadata.date) item.date = metadata.date;
                    if (metadata.credit) item.credit = metadata.credit;
                    if (metadata.location) item.location = metadata.location;
                    if (metadata.accession) item.accession = metadata.accession;
                    
                    // Compute onDisplay
                    item.onDisplay = item.location && 
                                     !item.location.toLowerCase().includes('not on display');
                    
                    process.stdout.write('.');
                } catch(e) {
                    console.error(`Err ${item.id}:`, e.message);
                    process.stdout.write('x');
                } finally {
                    await p.close();
                }
            }));
            
            processed += batch.length;
            if (processed % 20 === 0) {
                console.log(` (${processed}/${total})`);
                fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
            }
        }
    }
    
    console.log('[Done] All items processed.');
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2)); // Final save
    await browser.close();
})();
