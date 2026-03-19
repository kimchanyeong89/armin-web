const { chromium } = require('playwright');
const fs = require('fs');

const EXISTING_FILE = 'public/data/nasjonal-collection.json';

(async () => {
    console.log("Scraping 60 onDisplay Drawings from page...");

    let existingItems = [];
    try {
        existingItems = JSON.parse(fs.readFileSync(EXISTING_FILE));
        console.log(`Loaded ${existingItems.length} existing items.`);
    } catch (e) {
        console.log('No existing file found.');
    }

    const existingIds = new Set(existingItems.map(i => i.id));

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const searchUrl = 'https://www.nasjonalmuseet.no/en/collection/search/?onDisplay=true&object-name=drawing';

    console.log(`Navigating to ${searchUrl}...`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Scroll to load all 60 items (lazy loading)
    console.log('Scrolling to load all items...');
    for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);
    }

    // Extract all item links from the page
    const itemUrls = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="/en/collection/object/"]'));
        const uniqueUrls = [...new Set(links.map(a => a.href))];
        return uniqueUrls;
    });

    console.log(`Found ${itemUrls.length} unique item URLs on page.`);

    // Now fetch each item's detail using the API pattern we know works
    let addedCount = 0;

    for (const itemUrl of itemUrls) {
        const nmId = itemUrl.split('/').pop();

        if (existingIds.has(nmId)) {
            console.log(`Skipping ${nmId} (already exists)`);
            continue;
        }

        try {
            // Use the API to get item details
            const apiUrl = `/en/collection/search//search`;
            const token = await page.evaluate(() => {
                const tokenInput = document.getElementById('aft');
                return tokenInput ? tokenInput.value : '';
            });

            // Actually, we can't easily query by ID via the search API
            // Let's just navigate to each detail page and extract data
            console.log(`Fetching ${nmId}...`);
            await page.goto(itemUrl, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(500);

            const itemData = await page.evaluate(() => {
                // Try to find the data in the page
                const titleEl = document.querySelector('h1');
                const title = titleEl ? titleEl.textContent.trim() : '';

                // Look for producer/artist
                const artistEl = document.querySelector('[data-test="producer"], .producer');
                const artist = artistEl ? artistEl.textContent.trim() : '';

                // Look for image
                const imgEl = document.querySelector('img[src*="iiif"]');
                let image = '';
                if (imgEl && imgEl.src) {
                    // Convert to 800px
                    image = imgEl.src.replace(/\/full\/[^\/]+\//, '/full/800,/');
                }

                return { title, artist, image };
            });

            if (itemData.image) {
                const newItem = {
                    id: nmId,
                    source: 'Nasjonalmuseet',
                    url: itemUrl,
                    title: itemData.title || 'Untitled',
                    artist: itemData.artist || 'Unknown',
                    image: itemData.image,
                    category: 'Drawing',
                    type: '2D',
                    _raw: { nmId }
                };

                existingItems.push(newItem);
                existingIds.add(nmId);
                addedCount++;
                console.log(`Added ${nmId}: ${itemData.title}`);
            }

        } catch (err) {
            console.error(`Error fetching ${nmId}:`, err.message);
        }
    }

    await browser.close();

    fs.writeFileSync(EXISTING_FILE, JSON.stringify(existingItems, null, 2));
    console.log(`\nAdded ${addedCount} new drawings.`);
    console.log(`Total items: ${existingItems.length}`);

    const drawingCount = existingItems.filter(i => i.category === 'Drawing').length;
    console.log(`Drawing items: ${drawingCount}`);
})();
