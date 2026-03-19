const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

(async () => {
    console.log("Sniffing NGV Network...");
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    // Log Requests
    page.on('request', req => {
        const url = req.url();
        if (url.includes('json') || url.includes('api') || url.includes('search')) {
            console.log("REQ:", url);
        }
    });

    await page.goto('https://www.ngv.vic.gov.au/explore/collection/', { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Type in search to trigger ajax?
    // Or just load.
    
    await browser.close();
})();
