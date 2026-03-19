const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_FILE = path.join(__dirname, '../public/data/ngv-trove-collection-fixed.json');

(async () => {
    console.log("[Trove] Launching NGV Scraper (Fixed)...");
    
    const browser = await puppeteer.launch({ 
        headless: "new",
        defaultViewport: null,
        dumpio: true, // Log chrome stdout
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'] 
    });
    
    const page = await browser.newPage();
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
    await page.setUserAgent(ua);
    
    // Pass webdriver check
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // Search for NGV items
    // Using simple keyword search on Trove Images
    const url = "https://trove.nla.gov.au/search/category/images?keyword=%22National%20Gallery%20of%20Victoria%22%20painting";
    
    console.log(`[Trove] Navigating to ${url}`);
    
    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Wait for results
        // Use a more generic selector for the app to load
        try {
            await page.waitForSelector('.vh-resource-card', { timeout: 10000 }).catch(()=>console.log("No .vh-resource-card"));
            await page.waitForSelector('img', { timeout: 10000 });
        } catch(e) { console.log("[!] Timeout waiting for images"); }

        // Attempt to auto-scroll to load more items
        console.log("[Trove] Scrolling for more items...");
        for(let i=0; i<5; i++) { // Scroll a few times
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await new Promise(r => setTimeout(r, 2000));
        }
        
        const items = await page.evaluate(() => {
            const results = [];
            // Strategy: Look for cards. In Trove they might be article tags or divs.
            // Let's rely on Image logic which is most robust for image search
            const imgs = Array.from(document.querySelectorAll('img'));
            
            imgs.forEach(img => {
                const src = img.src;
                if (!src || src.endsWith('.svg') || src.includes('icon') || src.includes('logo')) return;
                // Heuristic: Small images are UI, Large/List images are content
                if (img.naturalWidth < 100) return;
                
                // Find title in parents
                let p = img.parentElement;
                let title = "Untitled";
                let foundTitle = false;
                
                for(let k=0; k<5; k++) {
                    if(!p) break;
                    // Look for headings or large text
                    // Trove results usually have a Title link
                    const links = p.querySelectorAll('a');
                    let bestTitle = "";
                    
                    for (const link of links) {
                        const txt = link.innerText.trim();
                        // If text is long enough and not just a year
                        if(txt.length > 5 && !/^\d{4}$/.test(txt)) {
                            bestTitle = txt;
                            break;
                        }
                    }
                    
                    if(!bestTitle) {
                         const headings = p.querySelectorAll('h3, h4, span[class*="title"]');
                         if (headings.length > 0) {
                             bestTitle = headings[0].innerText.trim();
                         }
                    }
                    
                    if (bestTitle && !/^\d{4}$/.test(bestTitle)) {
                        title = bestTitle;
                        foundTitle = true;
                        break;
                    }
                    p = p.parentElement;
                }
                
                if (foundTitle) {
                     results.push({
                        id: 'trove-ngv-' + Math.random().toString(36).substr(2,9),
                        title: title,
                        artist: "Review Source",
                        image: src,
                        source: "Trove (NGV)",
                        category: "Artwork",
                        detailUrl: img.parentElement ? img.parentElement.href : null
                    });
                }
            });
            
            // Deduplicate by Image URL
            const seen = new Set();
            return results.filter(r => {
                if(seen.has(r.image)) return false;
                seen.add(r.image);
                return true;
            });
        });

        console.log(`[Trove] Found ${items.length} items.`);
        
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(items, null, 2));
        console.log(`Saved to ${OUTPUT_FILE}`);

    } catch (err) {
        console.error("Scrape Error:", err);
    } finally {
        await browser.close();
    }
})();
