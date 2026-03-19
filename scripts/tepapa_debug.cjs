const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    try {
        await page.goto('https://collections.tepapa.govt.nz/object/35719', { waitUntil: 'domcontentloaded' });
        const img = await page.evaluate(() => {
            const el = document.querySelector('img');
            return el ? el.src : null;
        });
        console.log("Found Image:", img);
        const html = await page.evaluate(() => document.body.innerHTML);
        console.log("Tokens in HTML:", html.match(/media\.tepapa\.govt\.nz[^"'<>\s]+/g)?.slice(0, 5));
    } catch(e) { console.log(e); }
    await browser.close();
})();
