const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    const mainUrl = 'https://emuseum.mfah.org/search/*?filter=classifications%3APAINTING%3Bcatalogueonly%3Afalse%3BmediaExistence%3Atrue#filters';
    console.log('Navigating to main page...');
    await page.goto(mainUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    const title = await page.title();
    console.log('Page Title:', title);
    
    // Attempt to wait for something that looks like content
    try {
        await page.waitForSelector('.grid-item, .result-item, .objects-container', { timeout: 10000 });
        console.log('Content selector found.');
    } catch (e) {
        console.log('Warning: Content selector not found, might be challenge page.');
    }
    
    // Fetch JSON
    const jsonUrl = 'https://emuseum.mfah.org/search/*/objects/json?filter=classifications:PAINTING;catalogueonly:false;mediaExistence:true';
    console.log('Fetching JSON...');
    
    const data = await page.evaluate(async (url) => {
        try {
            const resp = await fetch(url, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json, text/javascript, */*; q=0.01'
                }
            });
            const text = await resp.text();
            try {
                return JSON.parse(text);
            } catch (e) {
                return { error: 'ParseError', textSnippet: text.slice(0, 500) };
            }
        } catch (e) {
            return { error: 'FetchError', message: e.toString() };
        }
    }, jsonUrl);
    
    fs.writeFileSync('mfah_p1.json', JSON.stringify(data, null, 2));
    console.log('Saved mfah_p1.json');
    if (data.results) console.log('Items found:', data.results.length);
    else console.log('No results key found.');

    await browser.close();
})();
