const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

(async () => {
    console.log("[Trove] Launching Browser (Fixed Headless)...");
    try {
        const browser = await puppeteer.launch({ 
            headless: "new",
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled', // Crucial for hiding puppeteer
                '--window-size=1920,1080',
                '--disable-web-security'
            ] 
        });
        const page = await browser.newPage();
        
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Real Chrome 120 User Agent
        const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        await page.setUserAgent(ua);
        
        // Pass webdriver check
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });
        });
        
        // Strategy: Trove Search API directly?
        // Or search page.
        const searchUrl = "https://trove.nla.gov.au/search/category/images?keyword=%22Art%20Gallery%20of%20New%20South%20Wales%22%20painting";
        console.log(`[Trove] Navigating to: ${searchUrl}`);
        
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 90000 });
        
        // Wait for potential loop of "Unable to load"
        console.log("[Trove] Waiting for app to stabilize...");
        await new Promise(r => setTimeout(r, 5000));
        
        // Check for error
        let text = await page.evaluate(() => document.body.innerText);
        if (text.includes("Unable to load") || text.includes("Couldn't retrieve configuration")) {
            console.log("[Trove] Hit error page. Reloading...");
            await page.reload({ waitUntil: 'networkidle2' });
            await new Promise(r => setTimeout(r, 10000));
        }
        
        // Wait for results selector
        console.log("[Trove] Waiting for images...");
        try {
            await page.waitForSelector('img', { timeout: 20000 });
        } catch(e) {
            console.log("[Trove] Wait failed. Dumping body text sample...");
            text = await page.evaluate(() => document.body.innerText.substring(0, 200));
            console.log(text);
        }

        // Scrape
        const items = await page.evaluate(() => {
            const results = [];
            
            // Trove Layout varies. Look for specific result structures if possible, or generic images with text.
            // On desktop, it's often .trove-result or similar.
            
            // Let's try a broad capture of images
            const imgs = Array.from(document.querySelectorAll('img'));
            for (const img of imgs) {
                const src = img.src;
                if (!src || src.includes('svg') || src.includes('icon') || src.includes('logo') || src.includes('placeholder')) continue;
                
                // Find text context
                let p = img.parentElement;
                let title = "";
                let depth = 0;
                while(p && depth < 4) {
                    if (p.innerText && p.innerText.length > 10) {
                        title = p.innerText.split('\n').filter(l => l.length > 5)[0];
                        if (title) break;
                    }
                    p = p.parentElement;
                    depth++;
                }
                
                if (title && src) {
                    results.push({
                        id: 'trove-' + Math.random().toString(36).substr(2,9),
                        title: title.substring(0, 100),
                        artist: 'Trove Record',
                        image: src,
                        source: 'Trove'
                    });
                }
            }
            // Dedup
            const seen = new Set();
            return results.filter(r => {
                if(seen.has(r.image)) return false;
                seen.add(r.image);
                return true;
            }).slice(0, 50);
        });

        console.log(`[Trove] Found ${items.length} items.`);
        const outPath = path.join(__dirname, '../public/data/agnsw-trove-collection.json');
        
        // Always write, even if empty (to update timestamp), but warn
        fs.writeFileSync(outPath, JSON.stringify(items, null, 2));
        console.log(`[Trove] Wrote to ${outPath}`);

        await browser.close();
    } catch (err) {
        console.error(err);
    }
})();
