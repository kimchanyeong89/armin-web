const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    // Launch browser
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        
        // 1. Go to homepage
        const url = "https://collections.tepapa.govt.nz/";
        console.log(`Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'load', timeout: 30000 });
        
        // 2. Perform Search
        // Wait for search box to appear. It's often dynamic in SPAs.
        // Found input element name="searchQuery" in previous debug HTML
        const searchInputSelector = 'input[name="searchQuery"]';
        console.log(`Waiting for search input (${searchInputSelector})...`);
        
        try {
            await page.waitForSelector(searchInputSelector, { timeout: 10000 });
        } catch (e) {
            console.error("Search input not found! Dumping HTML for debugging...");
            const html = await page.content();
            console.log("HTML length:", html.length);
            throw e;
        }
        
        console.log("Typing 'paintings'...");
        await page.type(searchInputSelector, 'paintings');
        await page.keyboard.press('Enter');
        
        console.log("Submitted search. Waiting for results...");
        
        // Wait for navigation or results
        // The URL likely changes to /search?searchQuery=paintings
        
        // Sometimes wait for navigation is tricky with SPA.
        // Let's wait for a definitive element that appears on search results.
        // Usually result items are unique.
        // Or wait for network idle again.
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => console.log("Navigation timeout (SPA likely finished loading)."));
        
        const currentUrl = page.url();
        console.log(`Current URL: ${currentUrl}`);
        
        // 3. Extract Results
        console.log("Looking for result items...");
        
        // Try multiple selectors common in lists
        // Often: div.search-result, li based constructs
        // Let's just grab all images inside links and see if they look like artworks.
        
        // Wait for ANY image to load (often results have thumbnails)
        try {
            await page.waitForSelector('img[src*="media.tepapa.govt.nz"]', { timeout: 10000 });
        } catch (e) {
            console.log("Warning: Specific image selector not found. Trying generic img.");
            // Maybe search results are text only? Or lazy loaded.
            await page.waitForSelector('main', { timeout: 5000 });
        }
        
        // Extract data
        const data = await page.evaluate(() => {
            // Helper function to extract text and image
            const results = [];
            // Look for anchor tags that link to /object/ or similar detail pages
            const links = Array.from(document.querySelectorAll('a[href*="/object/"]'));
            
            links.forEach(a => {
                const img = a.querySelector('img');
                const titleEl = a.querySelector('span[class*="title"], h3, h4, div[class*="title"]'); 
                const title = titleEl ? titleEl.innerText.trim() : a.innerText.trim();
                
                if (title.length > 3 && (img || title.includes('Paintings'))) {
                    results.push({
                        href: a.href,
                        title: title,
                        imgSrc: img ? img.src : null
                    });
                }
            });
            
            return {
                title: document.title,
                count: results.length,
                items: results.slice(0, 5), // Sample
                bodySample: document.body.innerText.slice(0, 500)
            };
        });

        console.log("Scrape Result:", JSON.stringify(data, null, 2));

    } catch (e) {
        console.error("Scrape failed:", e.message);
    } finally {
        await browser.close();
    }
})();
