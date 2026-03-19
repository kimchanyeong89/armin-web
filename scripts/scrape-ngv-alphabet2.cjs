const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_FILE = path.join(__dirname, '../public/data/ngv-collection.json');

// Better letters for art: focus on common vowels, consonants, painting types.
const queries = ['painting', 'drawing', 'sculpture', 'print', 'photograph', 'oil', 'canvas', 'paper', 'wood', 'bronze', 'a', 'e', 'i', 'o', 'u', 'y', 's', 't', 'm', 'c', 'p', 'b', 'r'];
const MAX_PAGES_PER_CHAR = 15; // increased to get more

const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    let oldData = [];
    if (fs.existsSync(OUTPUT_FILE)) {
		try { oldData = JSON.parse(fs.readFileSync(OUTPUT_FILE)); } catch(e){}
	}
    // keep valid old items
    const allItems = oldData.filter(i => i.detailUrl && i.detailUrl.includes('/work/') && i.image);
    const existingIds = new Set(allItems.map(i => i.id));
    console.log(`Starting with ${allItems.length} existing artworks.`);

    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();

    process.on('SIGINT', () => {
        console.log('Interrupted! Saving state...');
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
        process.exit(0);
    });

    for (const q of queries) {
        console.log(`\n--- Scraping search: '${q}' ---`);
        let consecutiveEmpty = 0;
        
        for (let pageNum = 1; pageNum <= MAX_PAGES_PER_CHAR; pageNum++) {
            if (consecutiveEmpty > 2) break;
            
            const url = `https://www.ngv.vic.gov.au/page/${pageNum}/?s=${q}&type=collection`;
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

                const artworks = items.filter(i => i.detailUrl && i.detailUrl.includes('/work/') && i.image);

                if (artworks.length === 0) {
                    consecutiveEmpty++;
                    // don't break immediately, could just be a page of artists
                    continue;
                } else {
                    consecutiveEmpty = 0;
                }
                
                let newAdded = 0;
                for (const item of artworks) {
                    if (!existingIds.has(item.id)) {
                        existingIds.add(item.id);
                        allItems.push(item);
                        newAdded++;
                    }
                }
                console.log(`Page ${pageNum}: Found ${artworks.length} artworks, Added ${newAdded}. Total: ${allItems.length}`);
                if (newAdded > 0) fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
                await wait(1000);
            } catch (e) {
                console.error(`Error on page ${pageNum}:`, e.message);
            }
        }
    }

    console.log("--- Enrichment ---");
    const queue = allItems.filter(i => !i.category && i.detailUrl);
    console.log(`${queue.length} items to enrich...`);
    for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        try {
            await page.goto(item.detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            const meta = await page.evaluate(() => {
                const getText = (label) => {
                    const xpath = `//p[strong[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${label.toLowerCase()}')]]`;
                    const res = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                    if (res) {
                        const clone = res.cloneNode(true);
                        const str = clone.querySelector('strong');
                        if (str) str.remove();
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
                    medium: getText('Medium') || getText('Support'),
                    dimensions: getText('Measurements') || getText('Dimensions'),
                    credit: getText('Credit Line'),
                    location: getText('Gallery location'),
                    accession: getText('Accession Number'),
                    category: getText('Departments') || getText('Department')
                };
            });
            Object.assign(item, meta);
            item.onDisplay = item.location && !item.location.toLowerCase().includes('not on display') ? true : false;
            
            // Clean up titles / dates
            if (item.title === undefined && oldData.find(x => x.id === item.id)) {
                item.title = oldData.find(x => x.id === item.id).title;
            }
            if(!item.category) item.category = "Artwork"; // fallback

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
