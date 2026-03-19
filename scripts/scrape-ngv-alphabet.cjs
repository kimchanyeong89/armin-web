const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_FILE = path.join(__dirname, '../public/data/ngv-collection.json');
const chars = 'abcdefghijklmnopqrstuvwxyz'.split('');
const MAX_PAGES_PER_CHAR = 5;

const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    let allItems = [];
    if (fs.existsSync(OUTPUT_FILE)) {
		try { allItems = JSON.parse(fs.readFileSync(OUTPUT_FILE)); } catch(e){}
	}
    const existingIds = new Set(allItems.map(i => i.id));

    process.on('SIGINT', () => {
        console.log('Interrupted! Saving state...');
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
        process.exit(0);
    });

    for (const char of chars) {
        console.log(`\n--- Scraping search: '${char}' ---`);
        let consecutiveEmpty = 0;
        
        for (let pageNum = 1; pageNum <= MAX_PAGES_PER_CHAR; pageNum++) {
            if (consecutiveEmpty > 1) break;
            
            const url = `https://www.ngv.vic.gov.au/page/${pageNum}/?type=collection&s=${char}`;
            console.log(`[List] Scraping ${url}`);
            
            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                
                const items = await page.evaluate(() => {
                    const els = document.querySelectorAll('.rd-card--square.feature');
                    return Array.from(els).map(el => {
                        const link = el.getAttribute('href');
                        const imgEl = el.querySelector('.rd-card__thumbnail');
                        const titleEl = el.querySelector('.rd-card__title');
                        const artistEl = el.querySelector('.rd-card__info');

                        return {
                            id: 'ngv-' + (link ? link.split('/').pop() : Math.random().toString(36).substr(2, 9)),
                            detailUrl: link,
                            image: imgEl ? imgEl.getAttribute('data-img-src') : null,
                            title: titleEl ? titleEl.innerText.trim() : 'Untitled',
                            artist: artistEl ? artistEl.innerText.trim() : 'Unknown',
                            source: 'NGV'
                        };
                    });
                });

                if (items.length === 0) {
                    consecutiveEmpty++;
                    continue;
                }
                
                consecutiveEmpty = 0;
                let newAdded = 0;
                for (const item of items) {
                    if (!existingIds.has(item.id) && item.image) {
                        existingIds.add(item.id);
                        allItems.push(item);
                        newAdded++;
                    }
                }
                console.log(`Page ${pageNum}: Found ${items.length}, Added ${newAdded}. Total: ${allItems.length}`);
                fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
                await wait(1000);
            } catch (e) {
                console.error(`Error on page ${pageNum}:`, e.message);
            }
        }
    }

    console.log("--- Enrichment ---");
    const queue = allItems.filter(i => !i.category);
    console.log(`${queue.length} items to enrich...`);
    for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        if (!item.detailUrl) continue;
        try {
            await page.goto(item.detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            const meta = await page.evaluate(() => {
                const getText = (label) => {
                    const xpath = `//p[strong[contains(text(), '${label}')]]`;
                    const res = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                    if (res) {
                        const clone = res.cloneNode(true);
                        const strong = clone.querySelector('strong');
                        if (strong) strong.remove();
                        const br = clone.querySelector('br');
                        if (br) br.remove();
                        return clone.innerText.trim();
                    }
                    return null;
                };

                const titleEl = document.querySelector('h1.page-header-title em');
                let dateStr = null;
                if (document.querySelector('h1.page-header-title')) {
                   const spans = document.querySelectorAll('h1.page-header-title span');
                   if(spans.length >= 2) dateStr = spans[1].innerText.replace(/,/g, '').trim();
                }

                return {
                    title: titleEl ? titleEl.innerText.trim() : undefined,
                    date: dateStr,
                    medium: getText('Medium'),
                    dimensions: getText('Measurements') || getText('Dimensions'),
                    credit: getText('Credit Line'),
                    location: getText('Gallery location'),
                    accession: getText('Accession Number'),
                    category: getText('Departments')
                };
            });
            Object.assign(item, meta);
            item.onDisplay = item.location && !item.location.toLowerCase().includes('not on display') ? true : false;
            if (i % 10 === 0) {
                process.stdout.write(` ${i}...`);
                fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
            }
        } catch (e) {
            process.stdout.write('x');
        }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
    await browser.close();
})();
