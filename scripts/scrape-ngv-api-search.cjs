const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const allItems = [];
    
    // Just fetch "painting" query
    await page.goto('https://www.ngv.vic.gov.au/?type=collection&s=painting', { waitUntil: 'domcontentloaded' });
    
    // Scrape it
    const items = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.rd-card--square.feature')).map(el => {
            const link = el.getAttribute('href');
            const imgEl = el.querySelector('.rd-card__thumbnail');
            const titleEl = el.querySelector('.rd-card__title');
            const artistEl = el.querySelector('.rd-card__info');
            return {
                id: 'ngv-' + (link ? link.split('/').pop() : Math.random().toString(36).substr(2,9)),
                detailUrl: link,
                imageUrl: imgEl ? imgEl.getAttribute('data-img-src') : null,
                title: titleEl ? titleEl.innerText.trim() : 'Untitled',
                artist: artistEl ? artistEl.innerText.trim() : 'Unknown',
                source: 'NGV'
            };
        });
    });
    
    fs.writeFileSync('../public/data/ngv-collection.json', JSON.stringify(items, null, 2));
    await browser.close();
})();
