const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_FILE = path.join(__dirname, '../public/data/ngv-collection.json');
const BASE_URL = 'https://www.ngv.vic.gov.au/explore/collection/search/?type=artwork&q=';
const MAX_PAGES = 100; // Let's scrape 100 pages * 20 items = 2000 items
const CONCURRENCY = 10;

// Helper to wait
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    console.log("Launching NGV Scraper...");
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    let allItems = [];
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            allItems = JSON.parse(fs.readFileSync(OUTPUT_FILE));
            console.log(`[Init] Loaded ${allItems.length} existing items.`);
        } catch (e) { console.error("Error reading existing file", e); }
    }
    const existingIds = new Set(allItems.map(i => i.id));

    // Phase 1: List Scraping
    console.log("--- Phase 1: List Scraping ---");
    let pageNum = 1;
    let consecutiveEmpty = 0;

    // We can skip pages if we already have items? 
    // NGV pages might change if sorted by default (relevance?). 
    // Best to scan from page 1.

    const page = await browser.newPage();

    while (pageNum <= MAX_PAGES) {
        if (consecutiveEmpty > 3) {
            console.log("Too many empty pages. Stopping list scrape.");
            break;
        }

        const url = `${BASE_URL}&paged=${pageNum}`;
        console.log(`[List] Scraping page ${pageNum}...`);

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

            // Selector for items
            const items = await page.evaluate(() => {
                const els = document.querySelectorAll('.rd-card--square.feature');
                return Array.from(els).map(el => {
                    const link = el.getAttribute('href');
                    const imgEl = el.querySelector('.rd-card__thumbnail');
                    const titleEl = el.querySelector('.rd-card__title');
                    const artistEl = el.querySelector('.rd-card__info');

                    let bg = imgEl ? imgEl.getAttribute('data-img-src') : null; // data-img-src="url"
                    // Or style background-image

                    return {
                        id: 'ngv-' + (link ? link.split('/').pop() : Math.random().toString(36).substr(2, 9)),
                        detailUrl: link,
                        image: bg,
                        title: titleEl ? titleEl.innerText.trim() : 'Untitled',
                        artist: artistEl ? artistEl.innerText.trim() : 'Unknown',
                        source: 'NGV'
                    };
                });
            });

            if (items.length === 0) {
                console.log(`[List] No items found on page ${pageNum}.`);
                consecutiveEmpty++;
                pageNum++;
                continue;
            }

            consecutiveEmpty = 0;
            let newOnPage = 0;

            for (const item of items) {
                if (!existingIds.has(item.id)) {
                    existingIds.add(item.id);
                    allItems.push(item);
                    newOnPage++;
                }
            }

            console.log(`[List] Page ${pageNum}: Found ${items.length}, New ${newOnPage}. Total: ${allItems.length}`);

            if (pageNum % 5 === 0) {
                fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
            }

            pageNum++;
            await wait(500); // Polite delay

        } catch (e) {
            console.error(`[List] Error on page ${pageNum}:`, e.message);
            // Retry once? Or skip
            pageNum++;
        }
    }

    await page.close();
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));

    // Phase 2: Metadata Enrichment
    console.log("--- Phase 2: Metadata Enrichment ---");
    // Filter items missing category/location
    const queue = allItems.filter(i => !i.category);
    console.log(`[Detail] ${queue.length} items to enrich.`);

    // Process in batches
    for (let i = 0; i < queue.length; i += CONCURRENCY) {
        const batch = queue.slice(i, i + CONCURRENCY);

        await Promise.all(batch.map(async (item) => {
            if (!item.detailUrl) return;
            const p = await browser.newPage();
            try {
                await p.goto(item.detailUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

                const meta = await p.evaluate(() => {
                    const getText = (label) => {
                        // Find <p><strong>Label</strong><br>Value</p>
                        // Using XPath
                        const xpath = `//p[strong[contains(text(), '${label}')]]`;
                        const res = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                        if (res) {
                            // The text often follows the <br> inside the <p>
                            // clone the node, remove strong/br, get text
                            const clone = res.cloneNode(true);
                            const strong = clone.querySelector('strong');
                            if (strong) strong.remove();
                            const br = clone.querySelector('br');
                            if (br) br.remove();
                            return clone.innerText.trim();
                        }
                        return null;
                    };

                    // Fallback for Title/Date/Artist if scraped list was weak
                    // Title: H1 > span > em
                    const h1 = document.querySelector('h1.page-header-title');
                    let detailTitle, detailDate, detailArtist;
                    if (h1) {
                        const em = h1.querySelector('em');
                        if (em) detailTitle = em.innerText.trim();
                        // Date usually second span: <span>1979</span>
                        const spans = h1.querySelectorAll('span');
                        if (spans.length >= 2) detailDate = spans[1].innerText.trim();

                        // Artist link nearby?
                        // <a href="/explore/collection/artist/...">Jim DINE</a>
                        // Often before the H1
                        const artistLink = document.querySelector('.artist-name a'); // Guessing class
                        if (artistLink) detailArtist = artistLink.innerText.trim();
                    }

                    const location = getText('Gallery location');

                    return {
                        medium: getText('Medium'),
                        dimensions: getText('Measurements') || getText('Dimensions'),
                        credit: getText('Credit Line'),
                        location: location || 'Not on display',
                        accession: getText('Accession Number'),
                        category: getText('Departments'), // Use Departments as category
                        onDisplay: location && !location.toLowerCase().includes('not on display')
                    };
                });

                Object.assign(item, meta);
                // Also infer onDisplay
                item.onDisplay = item.location && !item.location.toLowerCase().includes('not on display');

                process.stdout.write('.');
            } catch (e) {
                console.error(`X (${item.id})`, e.message);
            } finally {
                await p.close();
            }
        }));

        if ((i + CONCURRENCY) % 20 === 0) {
            console.log(` (${i + CONCURRENCY}/${queue.length})`);
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
        }
    }

    console.log("\n[Done] NGV Scrape Complete.");
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
    await browser.close();
})();
