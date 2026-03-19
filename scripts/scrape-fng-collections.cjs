/**
 * FNG Collections Scraper (Kiasma & Sinebrychoff)
 * Scrapes provided Painting and On-Display lists, resolves duplicates, 
 * and enriches metadata for On-Display/Untyped items.
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const CONFIGS = [
    {
        name: 'Kiasma',
        id: 'kiasma-collection',
        output: path.join(__dirname, '../public/data/kiasma-collection.json'),
        department: 'Kiasma Museum of Contemporary Art',
        urls: [
            { name: 'Painting', url: 'https://www.kansallisgalleria.fi/en/search?classifications[]=painting&hasImage=true&museums[]=kiasma' },
            { name: 'OnDisplay', url: 'https://www.kansallisgalleria.fi/en/search?hasImage=true&museums[]=kiasma&onDisplay=kiasma' }
        ]
    },
    {
        name: 'Sinebrychoff',
        id: 'sinebrychoff-collection',
        output: path.join(__dirname, '../public/data/sinebrychoff-collection.json'),
        department: 'Sinebrychoff Art Museum',
        urls: [
            { name: 'Painting', url: 'https://www.kansallisgalleria.fi/en/search?classifications[]=painting&hasImage=true&museums[]=sinebrychoff' },
            { name: 'OnDisplay', url: 'https://www.kansallisgalleria.fi/en/search?hasImage=true&museums[]=sinebrychoff&onDisplay=sinebrychoff' }
        ]
    }
];

async function scrape() {
    console.log("Starting FNG Collections Scraper...");
    const browser = await puppeteer.launch({
        headless: "new"
    });

    try {
        const page = await browser.newPage();

        let captured = new Map();
        page.on('response', async response => {
            if (response.url().includes('api/search') && response.request().method() === 'POST') {
                try {
                    const data = await response.json();
                    const list = Array.isArray(data) ? data : (data.data || []);
                    list.forEach(i => captured.set(String(i.id), i));
                } catch (e) { }
            }
        });

        for (const config of CONFIGS) {
            console.log(`\n=== Processing ${config.name} ===`);
            const itemsMap = new Map();

            // 1. Scrape Lists
            for (const source of config.urls) {
                console.log(`   Scraping list: ${source.name}`);
                captured.clear();

                await page.goto(source.url, { waitUntil: 'networkidle2' });
                try {
                    await page.waitForSelector('[class*="search-result-item"]', { timeout: 15000 });
                } catch (e) { }

                try {
                    const btn = await page.waitForSelector('button ::-p-text("Allow all cookies")', { timeout: 1000 });
                    if (btn) await btn.click();
                } catch (e) { }

                let isClicking = true;
                let noChange = 0;
                let lastSize = 0;

                while (isClicking) {
                    const btn = await page.$('xpath///button[contains(., "Show more")]');
                    if (btn && await btn.boundingBox()) {
                        await btn.click();
                        try { await page.waitForNetworkIdle({ timeout: 4000, idleTime: 500 }); } catch (e) { }
                    } else {
                        isClicking = false;
                    }

                    if (captured.size === lastSize) {
                        noChange++;
                        if (noChange >= 3) isClicking = false;
                    } else {
                        noChange = 0;
                        lastSize = captured.size;
                        process.stdout.write(`\r   Captured: ${captured.size}...`);
                    }
                }
                console.log(`\n   Finished ${source.name}. Count: ${captured.size}`);

                // Merge
                for (const item of captured.values()) {
                    const id = String(item.id);
                    let newItem = itemsMap.get(id);
                    if (!newItem) {
                        // Create basic item
                        const title = item.title?.en || item.title?.fi || item.title?.sv || 'Untitled';
                        let artist = 'Unknown';
                        if (item.people && item.people.length > 0) {
                            const p = item.people.find(x => x.role?.en === 'Artist') || item.people[0];
                            artist = `${p.firstName || ''} ${p.familyName || ''}`.trim();
                        }
                        let image = '';
                        let rights = '';
                        let publicDomain = false;
                        if (item.multimedia && item.multimedia.length > 0) {
                            const mm = item.multimedia[0];
                            image = `https://www.kansallisgalleria.fi/media-assets/${mm.image_version || 1}/jpg/1000/${mm.id}.jpg`;
                            rights = mm.license || '';
                            const r = rights.toLowerCase();
                            publicDomain = r.includes('cc0') || r.includes('public domain') || r.includes('no copyright');
                        }
                        let dimensions = '';
                        if (item.dimensions && item.dimensions.length > 0) {
                            const d = item.dimensions[0];
                            if (d.measurements?.length >= 2) dimensions = `${d.measurements[0]} x ${d.measurements[1]} ${d.unit}`;
                            else if (d.measurements?.length === 1 && d.type === 'height') dimensions = `H ${d.measurements[0]} ${d.unit}`;
                        }

                        newItem = {
                            id,
                            source: config.name,
                            url: `https://www.kansallisgalleria.fi/en/object/${item.id}`,
                            title,
                            artist,
                            image,
                            date: item.yearFrom ? String(item.yearFrom) : (item.year ? String(item.year) : ''),
                            year: item.yearFrom || item.year || 0,
                            medium: source.category,
                            dimensions,
                            category: source.category,
                            type: source.type,
                            onDisplay: false,
                            publicDomain,
                            rights,
                            department: config.department
                        };
                    }

                    // Enable Enrichment for Kiasma AND Sinebrychoff to get correct Medium
                    if (config.name === 'Kiasma' || config.name === 'Sinebrychoff' || source.name === 'OnDisplay') newItem._enrich = true;

                    if (source.name === 'OnDisplay') {
                        newItem.onDisplay = true;
                    } else if (source.name === 'Painting') {
                        if (newItem.category === 'Artwork') newItem.category = 'Painting';
                    }
                    itemsMap.set(id, newItem);
                }
            }

            // 2. Enrich Items
            const toEnrich = Array.from(itemsMap.values()).filter(i => i._enrich);
            console.log(`\n   Enriching ${toEnrich.length} items (fetching Metadata)...`);

            // Optimization: Block images/fonts to speed up
            const BATCH_SIZE = 15;
            for (let i = 0; i < toEnrich.length; i += BATCH_SIZE) {
                const batch = toEnrich.slice(i, i + BATCH_SIZE);
                process.stdout.write(`\r   Enriching ${i}/${toEnrich.length}...`);

                await Promise.all(batch.map(async (item) => {
                    const p = await browser.newPage();
                    try {
                        await p.setRequestInterception(true);
                        p.on('request', (req) => {
                            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort();
                            else req.continue();
                        });

                        await p.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

                        const metadata = await p.evaluate(() => {
                            const res = { category: '', medium: '' };

                            // 1. Category via Link
                            const catLink = document.querySelector('a[href*="classifications[]"]');
                            if (catLink && catLink.innerText) res.category = catLink.innerText.trim();

                            // 2. Medium via Text Scan
                            const lis = document.querySelectorAll('li');
                            for (const li of lis) {
                                const txt = li.innerText;
                                if (txt.includes('cm,') || txt.includes('cm ,')) {
                                    const parts = txt.split(/cm\s*,/);
                                    if (parts.length > 1) {
                                        let med = parts[1].trim();
                                        med = med.split('\n')[0].trim();
                                        if (med && med.length < 150
                                            && !med.toLowerCase().includes('owner')
                                            && !med.toLowerCase().includes('purchase')
                                            && !med.toLowerCase().includes('collection')) {
                                            res.medium = med;
                                            break;
                                        }
                                    }
                                }
                            }
                            // Fallback DT
                            if (!res.medium) {
                                const dts = Array.from(document.querySelectorAll('dt'));
                                for (const dt of dts) {
                                    const label = dt.innerText.toLowerCase();
                                    if (label.includes('material') || label.includes('medium')) {
                                        const dd = dt.nextElementSibling;
                                        if (dd) res.medium = dd.innerText.trim();
                                    }
                                }
                            }
                            return res;
                        });

                        if (metadata.category) {
                            item.category = metadata.category;
                            const c = item.category.toLowerCase();
                            item.type = (c.includes('sculpture') || c.includes('installation') || c.includes('3d')) ? '3D' : '2D';
                        }
                        if (metadata.medium) item.medium = metadata.medium;
                    } catch (e) { } finally { await p.close(); }
                }));
            }
            console.log(`\n   Enrichment done.`);

            // 3. Save
            const finalItems = Array.from(itemsMap.values()).map(i => {
                const { _enrich, ...rest } = i;
                return rest;
            });
            fs.writeFileSync(config.output, JSON.stringify(finalItems, null, 2));
            console.log(`✅ Saved ${finalItems.length} items to ${config.output}`);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
}

scrape();
