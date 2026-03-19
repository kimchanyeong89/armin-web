const puppeteer = require('puppeteer');

(async () => {
    console.log("Launching Puppeteer to capture Network requests...");
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    const page = await browser.newPage();
    
    // Capture API requests
    page.on('request', request => {
        const url = request.url();
        if (url.includes('/search')) {
            console.log(`REQ [${request.method()}]: ${url}`);
            if (request.method() === 'POST') {
                console.log('Post Data:', request.postData());
            }
        }
    });

    page.on('response', async response => {
        const url = response.url();
        if (url.includes('/search') && response.request().method() !== 'OPTIONS') {
           try {
               console.log(`RESP [${response.status()}] from: ${url}`);
               // const text = await response.text();
               // console.log('Sample Data:', text.substring(0, 300));
           } catch(e) {}
        }
    });

    try {
        await page.goto('https://www.nasjonalmuseet.no/en/collection/search/?object-name=painting', { waitUntil: 'networkidle2' });
        console.log("Page loaded.");
        
        // Wait replacement
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const count = await page.evaluate(() => document.querySelectorAll('a[href*="/collection/object/"]').length);
        console.log(`Found ${count} object elements in DOM.`);
        
    } catch (e) {
        console.error("Puppeteer Error:", e.message);
    } finally {
        await browser.close();
    }
})();
