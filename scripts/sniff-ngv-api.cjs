const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
(async () => {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.on('response', async res => {
        const url = res.url();
        if ((url.includes('json') || url.includes('api') || url.includes('search')) && !url.includes('google') && !url.includes('fonts')) {
            console.log("\n--- RESPONSE URL:", url);
            try {
                const text = await res.text();
                // console.log("BODY:", text.substring(0, 500));
            } catch(e){}
        }
    });
    await page.goto('https://www.ngv.vic.gov.au/explore/collection/search/', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r=>setTimeout(r, 5000));
    await browser.close();
})();
