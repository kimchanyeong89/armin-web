const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

// CONFIGURATION
const OUTPUT_FILE = path.join(__dirname, '../public/data/agnsw-collection-fixed.json');
const TARGETS = [
    {
        name: 'Paintings',
        // Filter by media=painting
        url: 'https://www.artgallery.nsw.gov.au/collection/search/?images=y&media=painting&sort_by=artist',
        maxPages: 300
    },
    {
        name: 'Drawings',
        url: 'https://www.artgallery.nsw.gov.au/collection/works/?images=y&media=drawing&sort_by=date',
        maxPages: 100
    },
    {
        name: 'Photographs',
        url: 'https://www.artgallery.nsw.gov.au/collection/works/?images=y&media=photograph&date_from=1980&sort_by=date',
        maxPages: 100
    }
];

const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    console.log('Launching AGNSW Scraper (Fixed Category & Memory)...');
    
    // Resume logic: Read existing IDs
    let existingUrls = new Set();
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            const raw = fs.readFileSync(OUTPUT_FILE, 'utf-8');
            const items = JSON.parse(raw);
            items.forEach(i => {
                if(i.detailUrl) existingUrls.add(i.detailUrl);
            });
            console.log(`[Resume] Loaded ${items.length} existing items.`);
        } catch(e) {
            console.log("[Resume] Creating new file.");
            fs.writeFileSync(OUTPUT_FILE, '[]');
        }
    } else {
        fs.writeFileSync(OUTPUT_FILE, '[]');
    }

    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--window-size=1920,1080',
            '--disable-web-security'
        ]
    });

    const page = await browser.newPage();
    
    // We will append to file by reading, parsing, pushing, writing. 
    // Ideally we'd use NDJSON for crash safety, but let's stick to valid JSON with frequent saves.
    
    for (const target of TARGETS) {
        console.log(`\n--- Processing Category: ${target.name} ---`);
        
        let consecutiveEmpty = 0;
        
        for (let p = 1; p <= target.maxPages; p++) {
             const url = `${target.url}&page=${p}`;
             if (p % 5 === 0) process.stdout.write(` p${p}`);
             
             try {
                 await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
                 
                 // Check if challenged
                 const title = await page.title();
                 if (title.includes("Challenge") || title.includes("Cloudflare")) {
                     console.log("\n[!] Challenge detected. Waiting 10s...");
                     await wait(10000);
                 }

                 const items = await page.evaluate((categoryName) => {
                     const els = Array.from(document.querySelectorAll('.artworksList-item'));
                     return els.map(el => {
                         const a = el.querySelector('a');
                         const img = el.querySelector('img');
                         const artistEl = el.querySelector('.card-artwork-artist');
                         const titleEl = el.querySelector('.card-artwork-title');
                         const displayEl = el.querySelector('.card-artwork-display');
                         
                         let artist = artistEl ? artistEl.innerText.trim() : "";
                         let title = titleEl ? titleEl.innerText.trim() : "";
                         let displayCtx = displayEl ? displayEl.innerText.trim() : "";
                         
                         // Determine onDisplay from list view!
                         const onDisplay = displayCtx.toLowerCase().includes('on display');
                         
                         return {
                             id: ('agnsw-' + Math.random().toString(36).substr(2,9)),
                             title: title || 'Untitled',
                             artist: artist || 'Unknown',
                             detailUrl: a ? a.href : null,
                             image: img ? img.src : null,
                             source: 'AGNSW',
                             collectionType: categoryName,
                             category: categoryName.endsWith('s') ? categoryName.slice(0, -1) : categoryName, // Force Category
                             onDisplay: onDisplay,
                             location: onDisplay ? displayCtx : null
                         };
                     });
                 }, target.name);
                 
                 if (items.length === 0) {
                     // Check for "No Artworks Found" text
                     const body = await page.evaluate(() => document.body.innerText);
                     if (body.includes("No artworks found") || body.includes("0 results")) {
                         console.log(`\n[List] Clean end of results at page ${p}.`);
                         break;
                     }
                     consecutiveEmpty++;
                     if(consecutiveEmpty > 5) break;
                 } else {
                     consecutiveEmpty = 0;
                 }
                 
                 // Filter new items
                 const newItems = items.filter(i => i.detailUrl && !existingUrls.has(i.detailUrl));
                 
                 if (newItems.length > 0) {
                     // Read - Parse - Update - Write
                     const currentData = JSON.parse(fs.readFileSync(OUTPUT_FILE));
                     const combined = currentData.concat(newItems);
                     fs.writeFileSync(OUTPUT_FILE, JSON.stringify(combined, null, 2));
                     
                     newItems.forEach(i => existingUrls.add(i.detailUrl));
                     // console.log(`+${newItems.length}`);
                 }

                 await wait(200); 
                 
             } catch(err) {
                 console.error(`\n[List] Error ${target.name} p${p}: ${err.message}`);
             }
        }
    }
    
    console.log("\n[Done] AGNSW Scraping Completed.");
    await browser.close();
})();
