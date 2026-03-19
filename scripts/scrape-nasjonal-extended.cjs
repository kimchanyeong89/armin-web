const puppeteer = require('puppeteer');
const fs = require('fs');

const EXISTING_FILE = 'public/data/nasjonal-collection.json';

const TARGETS = [
    // { term: 'drawing', category: 'Drawing', type: '2D' }, // Already done
    { term: 'photograph', category: 'Photography', type: '2D' },
    { term: 'chair', category: 'Furniture', type: '3D' }
];

(async () => {
    console.log("Starting Nasjonalmuseet Extended Scraper (Round 2)...");
    let existingItems = [];
    try {
        existingItems = JSON.parse(fs.readFileSync(EXISTING_FILE));
        console.log(`Loaded ${existingItems.length} existing items.`);
    } catch (e) {
        console.log('No existing file found, starting fresh.');
    }

    // Check what we already have for fast duplicate lookup
    const existingIds = new Set(existingItems.map(i => i.id));

    for (const target of TARGETS) {
        console.log(`\n=== Processing: ${target.term} ===`);

        const browser = await puppeteer.launch({
            headless: "new",
            defaultViewport: { width: 1280, height: 800 }
        });

        try {
            const page = await browser.newPage();

            const searchUrl = `https://www.nasjonalmuseet.no/en/collection/search/?object-name=${target.term}&onDisplay=true`;
            let apiUrl = '';

            await page.setRequestInterception(true);
            page.on('request', req => {
                if (req.method() === 'POST' && req.url().includes('/search') && !apiUrl) {
                    apiUrl = req.url();
                }
                req.continue();
            });

            console.log(`Navigating to ${searchUrl}...`);
            await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
            await new Promise(r => setTimeout(r, 2000));

            // Attempt to trigger load
            if (!apiUrl) {
                console.log("API URL not captured yet. Attempting to trigger load...");
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                await new Promise(r => setTimeout(r, 2000));
            }
            if (!apiUrl) {
                console.log("Using fallback API URL (inferred).");
            }

            let pageNum = 1;
            let hasMore = true;
            let gatheredForTerm = 0;

            while (hasMore) {
                try {
                    const result = await page.evaluate(async (p, termType) => {
                        const tokenInput = document.getElementById('aft');
                        if (!tokenInput) return { error: 'No token' };
                        const token = tokenInput.value;

                        let target = '/en/collection/search//search';

                        const bodyParams = new URLSearchParams();
                        bodyParams.append('includeRelatedResult', 'true');
                        bodyParams.append('page', p);
                        bodyParams.append('object-name', termType);
                        bodyParams.append('onDisplay', 'true');

                        const res = await fetch(target, {
                            method: 'POST',
                            headers: {
                                'X-Requested-With': 'XMLHttpRequest',
                                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                                'RequestVerificationToken': token
                            },
                            body: bodyParams.toString()
                        });

                        if (!res.ok) return { error: res.statusText };
                        return await res.json();
                    }, pageNum, target.term);

                    if (result.error) {
                        console.error(`Page ${pageNum} error: ${result.error}`);
                        if (result.error === 'No token') { console.error('Token missing'); break; }
                        break;
                    }

                    if (result.Results && result.Results.length > 0) {
                        const newItems = result.Results.map(r => {
                            let img = '';
                            if (r.media && r.media.iiifImageUrlTemplate && r.media.images && r.media.images.length > 0) {
                                const template = r.media.iiifImageUrlTemplate;
                                const filename = r.media.images[0].originalFile;
                                img = template.replace('{0}', encodeURIComponent(filename))
                                    .replace('{1}', '800')
                                    .replace('{2}', '');
                            } else if (r.image) {
                                img = r.image;
                            }

                            return {
                                id: r.media?.nmId || r.url.split('/').pop(),
                                source: 'Nasjonalmuseet',
                                url: 'https://www.nasjonalmuseet.no' + r.url,
                                title: r.title,
                                artist: r.media?.producer || '',
                                image: img,
                                category: target.category,
                                type: target.type,
                                _raw: r
                            };
                        }).filter(i => i.image && !i.image.includes('null'));

                        let added = 0;
                        for (const item of newItems) {
                            if (!existingIds.has(item.id)) {
                                existingItems.push(item);
                                existingIds.add(item.id);
                                added++;
                            }
                        }
                        gatheredForTerm += newItems.length;
                        console.log(`Page ${pageNum}: Found ${newItems.length}, Added ${added} new. (Term Total: ${gatheredForTerm})`);

                        pageNum++;
                        await new Promise(r => setTimeout(r, 500));

                        if (pageNum > 500) break;
                    } else {
                        console.log(`No more results for ${target.term} at page ${pageNum}.`);
                        hasMore = false;
                    }

                } catch (err) {
                    console.error(`Error loop: ${err.message}`);
                    hasMore = false;
                }
            }

            await page.close();
        } catch (e) {
            console.error(`Browser error for ${target.term}:`, e);
        } finally {
            await browser.close();
        }
    }

    fs.writeFileSync(EXISTING_FILE, JSON.stringify(existingItems, null, 2));
    console.log(`Final Total items saved: ${existingItems.length}`);
})();
