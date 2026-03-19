const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

(async () => {
    console.log('Launching Stealth Puppeteer...');
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-size=1920,1080',
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Enable request interception to catch JSON
    await page.setRequestInterception(true);
    
    let jsonCaptured = false;
    const items = [];

    page.on('request', request => {
        request.continue();
    });

    page.on('response', async response => {
        const url = response.url();
        if ((url.includes('/objects') || url.includes('/search')) && response.headers()['content-type']?.includes('application/json')) {
            console.log('Intercepted JSON response:', url);
            try {
                const data = await response.json();
                if (data && (data.objects || data.items || Array.isArray(data))) {
                     console.log('Captured data structure keys:', Object.keys(data));
                     const list = data.objects || data.items || data;
                     if (Array.isArray(list)) {
                         console.log(`Found ${list.length} items in JSON`);
                         items.push(...list);
                         jsonCaptured = true;
                     }
                }
            } catch (e) {
                // ignore
            }
        }
    });

    // Try the main search page that usually triggers a JSON load
    const url = 'https://crystalbridges.emuseum.com/objects/images?sort=9';
    console.log(`Navigating to ${url}...`);

    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    } catch (e) {
        console.log('Navigation timeout or error:', e.message);
    }
    
    // Check if we hit the WAF
    const title = await page.title();
    console.log('Page Title:', title);

    if (title.includes('Verification') || title.includes('Attention')) {
        console.log('Hit WAF. Waiting for 20 seconds to see if stealth plugin passes...');
        await page.waitForTimeout(20000);
        console.log('Title after wait:', await page.title());
    }

    // Capture HTML snapshot
    fs.writeFileSync('crystal-stealth-dump.html', await page.content());

    // If we didn't catch JSON, let's try to evaluate the page for eMuseum global variables
    const windowData = await page.evaluate(() => {
        // eMuseum often puts data in window.mFilter, window.searchResults, etc.
        return {
            mFilter: window.mFilter,
            searchResults: window.searchResults,
            emuseum: window.emuseum
        };
    });
    
    console.log('Window data found:', windowData);

    // Try to click "Load More" or pagination if possible
    // ...

    await browser.close();
})();
