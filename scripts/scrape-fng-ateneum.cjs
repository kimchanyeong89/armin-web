/**
 * Full Scraper for Ateneum (Finnish National Gallery) - Comprehensive
 * Captures data via Puppeteer by intercepting API responses while Clicking "Show more"
 * Updates: Use 'Artwork' category and dynamic classification
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '..', 'public', 'data', 'ateneum-collection.json');

async function scrape() {
    console.log("Starting Ateneum Comprehensive Scraper...");
    const browser = await puppeteer.launch({
        headless: "new",
        defaultViewport: { width: 1280, height: 800 }
    });

    const itemsMap = new Map();
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
                    let newItems = [];

                    if (Array.isArray(data)) {
                        newItems = data;
                    } else if (data.data && Array.isArray(data.data)) {
                        newItems = data.data;
                    }

                    if (newItems.length > 0) {
                        newItems.forEach(item => {
                            if (!itemsMap.has(String(item.id))) {
                                itemsMap.set(String(item.id), item);
                            }
                        });
                        process.stdout.write(`\rCollected: ${itemsMap.size} items...`);
                    }
                } catch (e) {
                    // ignore json parse errors
                }
            }
        });

        // URL for ALL Artworks (not just paintings) in Ateneum
        const searchUrl = 'https://www.kansallisgalleria.fi/en/search?categories[]=artwork&hasImage=true&museums[]=ateneum';
        console.log(`Navigating to: ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'networkidle2' });

        // Handle Cookie Consent
        try {
            const cookieBtn = await page.waitForSelector('button ::-p-text("Allow all cookies")', { timeout: 5000 });
            if (cookieBtn) {
                await cookieBtn.click();
                await new Promise(r => setTimeout(r, 1000));
            }
        } catch (e) {
            // ignore
        }

        // Click "Show more" loop
        console.log("\nStarting click loop...");
        let noChangeCount = 0;
        let lastCount = itemsMap.size;

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

            if (itemsMap.size === lastCount) {
                noChangeCount++;
                console.log(`\nNo new items (attempt ${noChangeCount})...`);
            } else {
                noChangeCount = 0;
                lastCount = itemsMap.size;
            }

            if (noChangeCount >= 5) {
                console.log("\nNo new items for a while. Stopping.");
                isClicking = false;
            }

            // Safety limit increased to 20k
            if (itemsMap.size > 20000) {
                console.log("\nReached safety limit (20000). Stopping.");
                isClicking = false;
            }
        }

        console.log(`\nProcessing ${itemsMap.size} items...`);

        const artworks = Array.from(itemsMap.values()).map(item => {
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
                // Try to find image with highest resolution or default
                const mm = item.multimedia[0];
                const version = mm.image_version || 1;
                // Use 1000px if available
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
                } else if (dim.measurements && dim.measurements.length === 1 && dim.type === 'height') {
                    dimensions = `H ${dim.measurements[0]} ${dim.unit}`;
                }
            }

            // Classification Logic
            let category = 'Painting'; // Default logic start
            let type = '2D';

            const rawClassifications = (item.classifications || []).map(c => c.en ? c.en.toLowerCase() : '').join(' ');
            const rawType = (item.type && item.type.en) ? item.type.en.toLowerCase() : '';

            if (rawClassifications.includes('sculpture') || rawType.includes('sculpture')) {
                category = 'Sculpture';
                type = '3D';
            } else if (rawClassifications.includes('drawing') || rawClassifications.includes('graphic') || rawClassifications.includes('sketch')) {
                category = 'Drawing';
                type = '2D';
            } else if (rawClassifications.includes('photograph')) {
                category = 'Photography';
                type = '2D';
            } else if (rawClassifications.includes('installation')) {
                category = 'Installation';
                type = '3D';
            } else if (rawClassifications.includes('painting')) {
                category = 'Painting';
                type = '2D';
            } else {
                // Fallback
                if (item.type && item.type.en) category = item.type.en;
                else if (item.classifications && item.classifications.length > 0 && item.classifications[0].en) category = item.classifications[0].en;
                else category = 'Artwork';

                // Infer type from dimensions if 3D?
                if (item.dimensions && item.dimensions[0] && item.dimensions[0].measurements && item.dimensions[0].measurements.length === 3) {
                    type = '3D'; // H x W x D
                }
            }

            const onDisplay = !!item.currentLocation;

            return {
                id: String(item.id),
                source: 'Ateneum',
                url: `https://www.kansallisgalleria.fi/en/object/${item.id}`,
                title: title,
                artist: artist,
                image: image,
                date: item.yearFrom ? String(item.yearFrom) : (item.year ? String(item.year) : ''),
                year: item.yearFrom || item.year || 0,
                medium: category, // Use category as medium
                dimensions: dimensions,
                category: category,
                type: type,
                onDisplay: onDisplay,
                publicDomain: publicDomain,
                rights: rights,
                department: 'Ateneum Art Museum'
            };
        });

        // Filter out items without images
        const validArtworks = artworks.filter(a => !!a.image);

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(validArtworks, null, 2));
        console.log(`\n✅ Saved ${validArtworks.length} items to ${OUTPUT_FILE}`);

        const onDisplayCount = validArtworks.filter(a => a.onDisplay).length;
        console.log(`On Display: ${onDisplayCount}`);

    } catch (e) {
        console.error("Error:", e);
    } finally {
        await browser.close();
    }
}

scrape();
