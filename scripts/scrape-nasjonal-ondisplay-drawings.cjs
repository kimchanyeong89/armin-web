const puppeteer = require('puppeteer');
const fs = require('fs');

const EXISTING_FILE = 'public/data/nasjonal-collection.json';

(async () => {
    console.log("Scraping onDisplay Drawings from Nasjonalmuseet...");

    let existingItems = [];
    try {
        existingItems = JSON.parse(fs.readFileSync(EXISTING_FILE));
        console.log(`Loaded ${existingItems.length} existing items.`);
    } catch (e) {
        console.log('No existing file found.');
    }

    const existingIds = new Set(existingItems.map(i => i.id));

    const browser = await puppeteer.launch({
        headless: "new",
        defaultViewport: { width: 1280, height: 800 }
    });

    const page = await browser.newPage();

    const searchUrl = 'https://www.nasjonalmuseet.no/en/collection/search/?onDisplay=true&object-name=drawing';

    await page.setRequestInterception(true);
    page.on('request', req => req.continue());

    console.log(`Navigating to ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2000));

    let pageNum = 1;
    let hasMore = true;
    let gatheredCount = 0;

    while (hasMore) {
        try {
            const result = await page.evaluate(async (p) => {
                const tokenInput = document.getElementById('aft');
                if (!tokenInput) return { error: 'No token' };
                const token = tokenInput.value;

                const target = '/en/collection/search//search';

                const bodyParams = new URLSearchParams();
                bodyParams.append('includeRelatedResult', 'true');
                bodyParams.append('page', p);
                bodyParams.append('object-name', 'drawing');
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
            }, pageNum);

            if (result.error) {
                console.error(`Page ${pageNum} error: ${result.error}`);
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
                        category: 'Drawing',
                        type: '2D',
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
                gatheredCount += newItems.length;
                console.log(`Page ${pageNum}: Found ${newItems.length}, Added ${added} new. (Total: ${gatheredCount})`);

                pageNum++;
                await new Promise(r => setTimeout(r, 500));

                if (pageNum > 10) break; // Safety for 60 items (should be ~3 pages)
            } else {
                console.log(`No more results at page ${pageNum}.`);
                hasMore = false;
            }

        } catch (err) {
            console.error(`Error: ${err.message}`);
            hasMore = false;
        }
    }

    await page.close();
    await browser.close();

    fs.writeFileSync(EXISTING_FILE, JSON.stringify(existingItems, null, 2));
    console.log(`\nFinal Total items saved: ${existingItems.length}`);

    const drawingCount = existingItems.filter(i => i.category === 'Drawing').length;
    console.log(`Drawing items: ${drawingCount}`);
})();
