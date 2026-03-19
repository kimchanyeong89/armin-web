const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const pLimit = require('p-limit');

puppeteer.use(StealthPlugin());

const IN_FILE = path.join(__dirname, '../public/data/agnsw-collection.json');
const OUT_FILE = path.join(__dirname, '../public/data/agnsw-collection.json'); // Overwrite in place

(async () => {
    console.log("Loading AGNSW Data...");
    if (!fs.existsSync(IN_FILE)) {
        console.error("No data file found.");
        return;
    }
    let data = JSON.parse(fs.readFileSync(IN_FILE));
    
    // items needing update (missing medium AND dimensions)
    // Also skip items that failed repeatedly? We'll just try all missing ones.
    const toUpdate = data.filter(d => (!d.medium || !d.dimensions) && d.detailUrl && d.source === 'AGNSW');
    console.log(`Found ${toUpdate.length} items needing enrichment out of ${data.length}.`);

    if (toUpdate.length === 0) return;

    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox'] 
    });

    const limit = pLimit(5); // 5 Concurrent tabs
    let processed = 0;
    
    // Process function
    const processItem = async (item) => {
        let page;
        try {
            page = await browser.newPage();
            // Block images/fonts to speed up
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const r = req.resourceType();
                if (r === 'image' || r === 'font' || r === 'stylesheet') req.abort();
                else req.continue();
            });

            await page.goto(item.detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            
            // Extract metadata from the detail page
            const metadata = await page.evaluate(() => {
                const res = {};
                // Look for labels/values. 
                // Based on screenshot: details section has specific structure.
                // Assuming DL list or similar divs.
                
                // Try text content search for robust finding
                const bodyText = document.body.innerText;
                
                // Helper to find text after label
                const findVal = (label) => {
                   // This is risky with just text. 
                   // Let's try selectors first.
                   // Common in this site: .artwork-details dt/dd or similar
                   return null; 
                };

                // Specific selectors for AGNSW (often used)
                // Need to guess or use generic strategy. 
                // Let's look for "Media category" and "Materials used" in the DOM text nodes/siblings.
                
                const labels = Array.from(document.querySelectorAll('dt, h4, span.label, strong'));
                labels.forEach(el => {
                    const txt = el.innerText.trim().toLowerCase();
                    let val = null;
                    if (el.nextElementSibling) val = el.nextElementSibling.innerText.trim();
                    
                    if (txt.includes('media category')) res.category = val;
                    if (txt.includes('materials used')) res.medium = val;
                    if (txt.includes('dimensions')) res.dimensions = val;
                    if (txt.includes('credit')) res.credit = val;
                    if (txt.includes('accession')) res.accession = val;
                });
                
                // Fallback: iterate all paragraphs?
                if (!res.medium) {
                     // Try to find the line in full text
                }
                
                return res;
            });

            if (metadata.medium) item.medium = metadata.medium;
            if (metadata.dimensions) item.dimensions = metadata.dimensions;
            if (metadata.credit) item.credit = metadata.credit;
            if (metadata.category) item.category = metadata.category;
            
            processed++;
            if (processed % 10 === 0) console.log(`Enriched ${processed}/${toUpdate.length}`);
            
        } catch (e) {
            // console.error(`Failed ${item.id}: ${e.message}`);
        } finally {
            if (page) await page.close();
        }
    };

    // Run batch
    const tasks = toUpdate.map(item => limit(() => processItem(item)));
    await Promise.all(tasks);

    console.log("Saving enriched data...");
    fs.writeFileSync(OUT_FILE, JSON.stringify(data, null, 2));
    
    await browser.close();
})();
