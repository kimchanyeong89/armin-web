const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({
        headless: true, // Need headless usually for CI/terminal environments
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    console.log('--- Probing MFAH Screenshot ---');
    const targetUrl = 'https://emuseum.mfah.org/search/*?filter=classifications%3APAINTING%3Bcatalogueonly%3Afalse%3BmediaExistence%3Atrue#filters';
    
    try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
        console.log('Navigation error:', e.message);
    }
    
    await page.screenshot({ path: 'mfah-probe.png' });
    console.log('Screenshot saved to mfah-probe.png');

    const text = await page.evaluate(() => document.body.innerText);
    console.log('Body text:', text.slice(0, 500));
    
    await browser.close();
})();
