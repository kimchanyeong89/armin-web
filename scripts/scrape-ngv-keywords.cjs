const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_FILE = path.join(__dirname, '../public/data/ngv-collection.json');

// A large list of keywords, artist names, medium types to scrape from the search API since it maxes out at ~30 per page.
const queries = [
    // Mediums
    'oil', 'canvas', 'acrylic', 'watercolor', 'watercolour', 'ink', 'paper', 'sculpture', 'bronze', 'marble', 'wood', 'glass', 'ceramic', 'porcelain', 'textile', 'silk', 'cotton', 'photograph', 'gelatin', 'silver', 'digital', 'video', 'installation', 'mixed media', 'collage', 'drawing', 'pencil', 'charcoal', 'pastel', 'print', 'lithograph', 'etching', 'engraving', 'screenprint', 'poster',

    // Famous artists generally
    'rembrandt', 'picasso', 'monet', 'van gogh', 'cezanne', 'matisse', 'renoir', 'degas', 'turner', 'constable', 'rubens', 'titian', 'botticelli', 'raphael', 'goya', 'velazquez', 'el greco', 'tintoretto', 'veronese', 'tiépolo', 'boucher', 'fragonard', 'watteau', 'david', 'ingres', 'delacroix', 'courbet', 'manet', 'pissarro', 'sisley', 'morisot', 'seurat', 'signac', 'gauguin', 'toulouse-lautrec', 'rodin', 'klimt', 'schiele', 'kokoschka', 'kandinsky', 'klee', 'marc', 'macke', 'mondrian', 'malevich', 'chagall', 'modigliani', 'soutine', 'rouault', 'braque', 'leger', 'gris', 'delaunay', 'duchamp', 'ernst', 'magritte', 'dali', 'miro', 'arp', 'calder', 'moore', 'hepworth', 'bacon', 'freud', 'hockney', 'warhol', 'lichtenstein', 'johns', 'rauschenberg', 'stella', 'kelly', 'rothko', 'pollock', 'de kooning', 'kline', 'motherwell', 'newman', 'still', 'smith', 'flavin', 'judd', 'andre', 'leWitt', 'morris', 'serra', 'hesse', 'bourgeois', 'kew', 'kapoor', 'gormley', 'whitney', 'ofili', 'doig', 'hirst', 'emins', 'lucas',

    // Australian specific
    'roberts', 'streeton', 'mccubbin', 'conder', 'heysen', 'rees', 'drysdale', 'nolan', 'boyd', 'tucker', 'percival', 'vassilieff', 'fairweather', 'olsen', 'williams', 'whiteley', 'smart', 'brack', 'linn', 'gascoigne', 'kngwarreye', 'petyarre', 'tjupurrula', 'tjakamarra', 'nampitjinpa', 'napangardi', 'namatjira',

    // Asian art specifics
    'qin', 'ming', 'qing', 'han', 'tang', 'song', 'yuan', 'edo', 'meiji', 'showa', 'heian', 'koryo', 'joseon', 'ukiyo-e', 'hokusai', 'hiroshige', 'kunisada', 'yoshitoshi', 'imari', 'kutani', 'satsuma', 'celadon', 'blue and white', 'jade', 'lacquer', 'scroll', 'screen', 'byobu', 'buddha', 'bodhisattva',

    // Abstract shapes/subjects
    'landscape', 'portrait', 'still life', 'abstract', 'figure', 'nude', 'animal', 'bird', 'fish', 'flower', 'tree', 'river', 'mountain', 'sea', 'sky', 'cloud', 'sun', 'moon', 'star', 'night', 'day', 'morning', 'evening', 'spring', 'summer', 'autumn', 'winter', 'man', 'woman', 'child', 'boy', 'girl', 'interior', 'exterior', 'city', 'country', 'village', 'street'
];

const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    let allItems = [];
    if (fs.existsSync(OUTPUT_FILE)) {
        try { allItems = JSON.parse(fs.readFileSync(OUTPUT_FILE)); } catch (e) { }
    }
    // Keep only valid artworks with images
    allItems = allItems.filter(i => i.detailUrl && i.detailUrl.includes('/work/') && i.image);
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
        console.log(`\n--- Query: '${q}' ---`);
        const url = `https://www.ngv.vic.gov.au/?s=${encodeURIComponent(q)}&type=collection`;

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
            let newAdded = 0;
            for (const item of artworks) {
                if (!existingIds.has(item.id)) {
                    existingIds.add(item.id);
                    allItems.push(item);
                    newAdded++;
                }
            }
            console.log(`Found ${artworks.length} artworks, Added ${newAdded}. Total: ${allItems.length}`);
            if (newAdded > 0) fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
            await wait(1000);
        } catch (e) {
            console.error(`Error with query ${q}:`, e.message);
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
                    if (spans.length >= 2) dateStr = spans[1].innerText.replace(/,/g, '').trim();
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

            if (!item.category) item.category = "Artwork";

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
