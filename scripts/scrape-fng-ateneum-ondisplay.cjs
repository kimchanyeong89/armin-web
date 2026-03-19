/**
 * Update Ateneum Scraper - Adds "On Display" artworks
 * Merges with existing data.
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const EXISTING_FILE = path.join(__dirname, '..', 'public', 'data', 'ateneum-collection.json');

async function scrape() {
    console.log("Starting Ateneum On-Display Update Scraper...");

    // Load existing data
    let existingItems = [];
    try {
        if (fs.existsSync(EXISTING_FILE)) {
            existingItems = JSON.parse(fs.readFileSync(EXISTING_FILE, 'utf8'));
            console.log(`Loaded ${existingItems.length} existing items.`);
        }
    } catch (e) {
        console.error("Failed to load existing file:", e);
    }
    const itemsMap = new Map(existingItems.map(i => [String(i.id), i]));

    const browser = await puppeteer.launch({
        headless: "new",
        defaultViewport: { width: 1280, height: 800 }
    });

    const newItemsMap = new Map();
    let isClicking = true;

    try {
        const page = await browser.newPage();

        // Listen for API responses
        page.on('response', async response => {
            const url = response.url();
            if (url.includes('api/search') && response.request().method() === 'POST') {
                try {
                    const contentType = response.headers()['content-type'];
                    if (!contentType || !contentType.includes('application/json')) return;

                    const data = await response.json();
                    let fetchedItems = [];

                    if (Array.isArray(data)) {
                        fetchedItems = data;
                    } else if (data.data && Array.isArray(data.data)) {
                        fetchedItems = data.data;
                    }

                    if (fetchedItems.length > 0) {
                        fetchedItems.forEach(item => {
                            if (!newItemsMap.has(String(item.id))) {
                                newItemsMap.set(String(item.id), item);
                            }
                        });
                        process.stdout.write(`\rCollected new batch: Total ${newItemsMap.size} unique items found in this run...`);
                    }
                } catch (e) {
                    // ignore
                }
            }
        });

        const targetUrl = 'https://www.kansallisgalleria.fi/en/search?categories[]=artwork&hasImage=true&onDisplay=ateneum';
        console.log(`\nNavigating to: ${targetUrl}`);
        await page.goto(targetUrl, { waitUntil: 'networkidle2' });

        // Handle Cookie Consent
        try {
            const cookieBtn = await page.waitForSelector('button ::-p-text("Allow all cookies")', { timeout: 5000 });
            if (cookieBtn) {
                await cookieBtn.click();
                await new Promise(r => setTimeout(r, 1000));
            }
        } catch (e) { }

        // Click "Show more" loop
        console.log("\nStarting click loop...");
        let noChangeCount = 0;
        let lastCount = newItemsMap.size;

        while (isClicking) {
            const showMoreBtn = await page.$('xpath///button[contains(., "Show more")]');

            if (showMoreBtn) {
                const isVisible = await showMoreBtn.boundingBox();
                if (isVisible) {
                    await showMoreBtn.click();
                    try {
                        await page.waitForNetworkIdle({ timeout: 5000, idleTime: 500 });
                    } catch (e) {
                        await new Promise(r => setTimeout(r, 2000));
                    }
                } else {
                    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                    await new Promise(r => setTimeout(r, 1000));
                }
            } else {
                console.log("\n'Show more' button not found. Assuming end of list.");
                isClicking = false;
                break;
            }

            if (newItemsMap.size === lastCount) {
                noChangeCount++;
                console.log(`\nNo newly loaded items (attempt ${noChangeCount})...`);
            } else {
                noChangeCount = 0;
                lastCount = newItemsMap.size;
            }

            if (noChangeCount >= 5) {
                isClicking = false;
            }
        }

        console.log(`\nProcessing ${newItemsMap.size} scraped items...`);

        // Process and Merge
        let addedCount = 0;
        let updatedCount = 0;

        for (const item of newItemsMap.values()) {
            const id = String(item.id);

            // Infer Metadata
            const title = item.title?.en || item.title?.fi || item.title?.sv || 'Untitled';

            let artist = 'Unknown';
            if (item.people && item.people.length > 0) {
                const artistPerson = item.people.find(p => p.role?.en === 'Artist') || item.people[0];
                artist = `${artistPerson.firstName || ''} ${artistPerson.familyName || ''}`.trim();
            }

            let image = '';
            let publicDomain = false;
            let rights = '';
            if (item.multimedia && item.multimedia.length > 0) {
                const mm = item.multimedia[0];
                const version = mm.image_version || 1;
                image = `https://www.kansallisgalleria.fi/media-assets/${version}/jpg/1000/${mm.id}.jpg`;
                rights = mm.license || '';
                const lowerRights = rights.toLowerCase();
                publicDomain = lowerRights.includes('cc0') || lowerRights.includes('public domain') || lowerRights.includes('no copyright');
            }

            let dimensions = '';
            if (item.dimensions && item.dimensions.length > 0) {
                const dim = item.dimensions[0];
                if (dim.measurements && dim.measurements.length >= 2) {
                    dimensions = `${dim.measurements[0]} x ${dim.measurements[1]} ${dim.unit}`;
                }
            }

            // Classification Logic
            let category = 'Painting';
            let type = '2D';

            if (id === '2878034') {
                console.log("DEBUG Essi Renvall Item:", JSON.stringify(item.classifications), JSON.stringify(item.type));
            }

            const rawClassifications = (item.classifications || []).map(c => c.en ? c.en.toLowerCase() : '').join(' ');
            const rawType = (item.type && item.type.en) ? item.type.en.toLowerCase() : '';

            if (rawClassifications.includes('sculpture') || rawType.includes('sculpture')) {
                category = 'Sculpture';
                type = '3D';
            } else if (rawClassifications.includes('drawing') || rawClassifications.includes('graphic')) {
                category = 'Drawing';
                type = '2D';
            } else if (rawClassifications.includes('photograph')) {
                category = 'Photography';
                type = '2D';
            } else if (rawClassifications.includes('installation')) {
                category = 'Installation';
                type = '3D';
            }

            const onDisplay = true; // Since we scraped from "onDisplay=ateneum" URL

            const newItem = {
                id: id,
                source: 'Ateneum',
                url: `https://www.kansallisgalleria.fi/en/object/${item.id}`,
                title: title,
                artist: artist,
                image: image,
                date: item.yearFrom ? String(item.yearFrom) : '',
                year: item.yearFrom || 0,
                medium: category, // Use implied category as medium default if missing specific medium text
                dimensions: dimensions,
                category: category,
                type: type,
                onDisplay: onDisplay,
                publicDomain: publicDomain,
                rights: rights,
                department: 'Ateneum Art Museum'
            };

            // Merge Logic
            if (itemsMap.has(id)) {
                // Update existing
                const existing = itemsMap.get(id);
                // We only force update onDisplay to true. 
                // We also assume this scraping might have better category info if previously defaulted to Painting
                existing.onDisplay = true;
                // If existing was "Painting" but new is "Sculpture", update it
                if (existing.category === 'Painting' && category !== 'Painting') {
                    existing.category = category;
                    existing.type = type;
                    existing.medium = category;
                }
                itemsMap.set(id, existing);
                updatedCount++;
            } else {
                // Add new
                itemsMap.set(id, newItem);
                addedCount++;
            }
        }

        console.log(`\nMerge stats: Added ${addedCount}, Updated ${updatedCount}.`);
        console.log(`Total items in collection: ${itemsMap.size}`);

        const finalArtworks = Array.from(itemsMap.values());
        fs.writeFileSync(EXISTING_FILE, JSON.stringify(finalArtworks, null, 2));
        console.log(`\n✅ Saved to ${EXISTING_FILE}`);

        const odCount = finalArtworks.filter(a => a.onDisplay).length;
        console.log(`Total On Display: ${odCount}`);

    } catch (e) {
        console.error("Error:", e);
    } finally {
        await browser.close();
    }
}

scrape();
