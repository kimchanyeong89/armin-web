const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    const url = 'https://emuseum.mfah.org/search/*?filter=classifications%3APAINTING%3Bcatalogueonly%3Afalse%3BmediaExistence%3Atrue#filters';
    console.log('Navigating...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    const html = await page.content();
    fs.writeFileSync('mfah_dump.html', html);
    console.log('Saved mfah_dump.html');
    
    await browser.close();
})();
