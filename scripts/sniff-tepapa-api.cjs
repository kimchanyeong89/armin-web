const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
(async () => {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.on('request', async req => {
        const url = req.url();
        if (url.includes('media.tepapa.govt.nz')) {
            console.log("\n--- REQUEST URL:", url);
            console.log("Headers:", req.headers());
        }
    });
    await page.goto('https://collections.tepapa.govt.nz/object/35719', { waitUntil: 'networkidle2', timeout: 30000 });
    await browser.close();
})();
