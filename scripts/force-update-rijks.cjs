const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const COLLECTION_FILE = path.join(__dirname, '../public/data/rijksmuseum-paintings-collection.json');
const LOG_FILE = path.join(__dirname, '../downloads/rijks-force-update.log');
const BASE_URL = 'https://www.rijksmuseum.nl';
const SEARCH_QUERY = '/en/collection/search?collectionSearchContext=Art&sortingType=Popularity&onlyWithImages=true&onlyInMuseum=true';

// Config
const MAX_PAGES = 1000; // Safety limit
const RETRY_LIMIT = 3;

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper to extract ID from URL
function getIdFromUrl(url) {
    const match = url.match(/\/collection\/(?:object\/)?([^/?]+)/);
    if (match) return match[1].replace(/--[a-f0-9]+$/, '');
    return null;
}

async function collectLinks(page) {
    let allLinks = new Set();
    let consecutiveEmptyPages = 0;

    for (let p = 1; p <= MAX_PAGES; p++) {
        const url = `${BASE_URL}${SEARCH_QUERY}&page=${p}`;
        let retries = 0;
        let linksOnPage = [];

        while (retries < RETRY_LIMIT) {
            try {
                log(`Navigating to page ${p}... (Attempt ${retries + 1})`);
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

                // Wait for grid or list
                try {
                    await page.waitForSelector('a[href*="/en/collection/"]', { timeout: 5000 });
                } catch (e) { /* might be empty page */ }

                // Extract links
                linksOnPage = await page.evaluate(() => {
                    const anchors = Array.from(document.querySelectorAll('a[href*="/en/collection/"]'));
                    const hrefs = [];
                    for (const a of anchors) {
                        const h = a.getAttribute('href');
                        // Allow object number style URLs or object/ style URLs
                        // e.g. /en/collection/SK-A-123 or /en/collection/object/sk-a-123
                        if (h && (h.includes('/collection/SK-') || h.includes('/collection/object/'))) {
                            hrefs.push(h.startsWith('http') ? h : 'https://www.rijksmuseum.nl' + h);
                        }
                    }
                    return [...new Set(hrefs)]; // unique on page
                });

                if (linksOnPage.length > 0) break; // Success

                // If 0 links, check if "No results"
                const noResults = await page.evaluate(() => document.body.innerText.includes('No results found'));
                if (noResults) {
                    log('Detected "No results found". Stopping.');
                    return Array.from(allLinks);
                }

                log(`Warning: Found 0 links on page ${p}. Retrying...`);
                retries++;
                await sleep(2000);

            } catch (err) {
                log(`Error on page ${p}: ${err.message}`);
                retries++;
                await sleep(2000);
            }
        }

        if (linksOnPage.length === 0) {
            consecutiveEmptyPages++;
            if (consecutiveEmptyPages >= 2) {
                log('Too many empty pages. Stopping collection.');
                break;
            }
        } else {
            consecutiveEmptyPages = 0;
            linksOnPage.forEach(l => allLinks.add(l));
            log(`Page ${p}: Found ${linksOnPage.length} links. Total unique: ${allLinks.size}`);
        }

        // Check pagination next button for clean exit?
        // Not strictly necessary if we rely on "No results" or empty links, but good optimization.
        /*
        const hasNext = await page.evaluate(() => !!document.querySelector('.pagination .next'));
        if (!hasNext && linksOnPage.length < 10) { // arbitrary threshold
            log('No next button and few results. Stopping.');
            break;
        }
        */

        // Slight delay to be nice
        await sleep(500);
    }

    return Array.from(allLinks);
}

async function scrapeDetails(page, url) {
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (e) {
        log(`Failed to load details for ${url}: ${e.message}`);
        return null;
    }

    // Basic data extraction
    return await page.evaluate((currentUrl) => {
        const d = {
            id: '',
            objectNumber: '',
            title: '',
            artist: '',
            date: '',
            year: null,
            medium: '',
            dimensions: '',
            imageUrl: '',
            thumbnailUrl: '',
            displayLocation: '',
            onDisplay: true,
            sourceUrl: currentUrl
        };

        // ID
        const urlMatch = currentUrl.match(/\/collection\/(?:object\/)?([^/?]+)/);
        if (urlMatch) {
            d.objectNumber = urlMatch[1].replace(/--[a-f0-9]+$/, '');
            d.id = d.objectNumber;
        }

        // Title
        const h1 = document.querySelector('h1');
        if (h1) d.title = h1.textContent.trim();

        // Metadata extraction
        const meta = {};
        document.querySelectorAll('dt').forEach(dt => {
            const key = dt.textContent.trim().toLowerCase();
            let dd = dt.nextElementSibling;
            // find corresponding dd
            while (dd && dd.tagName !== 'DD') dd = dd.nextElementSibling;
            if (dd && dd.tagName === 'DD') {
                meta[key] = dd.textContent.trim();
            }
        });

        // Mapping
        // Artist
        const artistKeys = ['maker', 'artist', 'creator', 'painters', 'vervaardiger'];
        for (const k of artistKeys) {
            if (meta[k]) { d.artist = meta[k]; break; }
        }
        if (!d.artist) {
            const h2 = document.querySelector('h2.item-maker');
            if (h2) d.artist = h2.textContent.trim();
        }

        // Date
        const dateKeys = ['dating', 'date', 'biographical date', 'datering', 'periode'];
        for (const k of dateKeys) {
            if (meta[k]) {
                d.date = meta[k];
                const m = d.date.match(/(\d{4})/);
                if (m) d.year = parseInt(m[1]);
                break;
            }
        }

        // Medium
        const medKeys = ['material', 'technique', 'medium', 'materiaal'];
        for (const k of medKeys) {
            if (meta[k]) { d.medium = meta[k]; break; }
        }

        // Dimensions
        if (meta['measurements']) d.dimensions = meta['measurements'];
        else if (meta['afmetingen']) d.dimensions = meta['afmetingen'];

        // Location
        const bodyText = document.body.innerText;
        const locMatch = bodyText.match(/(?:On display in|Te zien in)\s+(.+?)(\n|$)/i);
        if (locMatch) d.displayLocation = locMatch[1].trim();

        // Image
        const img = document.querySelector('.image-container img, .header-image img');
        if (img) {
            let src = img.getAttribute('src');
            if (src) {
                if (!src.startsWith('http')) src = 'https://www.rijksmuseum.nl' + src;
                d.thumbnailUrl = src;
                d.imageUrl = src.replace(/w=\d+/, 'w=1200').replace(/h=\d+/, 'h=1200');
            }
        }

        return d;
    }, url);
}

async function main() {
    log('STARTING FORCE UPDATE (Full Link Scan)');

    // 1. Load DB
    let data;
    try {
        data = JSON.parse(fs.readFileSync(COLLECTION_FILE, 'utf8'));
    } catch (e) {
        log('Failed to read DB, starting fresh.');
        data = { artworks: [] };
    }

    let artworks = data.artworks || [];
    const artworkMap = new Map();
    artworks.forEach(a => artworkMap.set(a.id, a));
    log(`Loaded ${artworks.length} existing artworks.`);

    // 2. Scan Links
    const browser = await chromium.launch({ headless: true });
    // Use a context with desktop Viewport to possibly load more items?
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();

    let allDisplayLinks = [];
    try {
        allDisplayLinks = await collectLinks(page);
        log(`--- Link Collection Complete. Found ${allDisplayLinks.length} items. ---`);
    } catch (e) {
        log(`Critical Error in Link Collection: ${e.message}`);
        process.exit(1);
    }

    // 3. Process
    let updated = 0;
    let added = 0;
    let queued = [];

    // First pass: mark existing as On Display
    // Also build queue for new items
    for (const link of allDisplayLinks) {
        const id = getIdFromUrl(link);
        if (!id) continue;

        if (artworkMap.has(id)) {
            const item = artworkMap.get(id);
            if (!item.onDisplay) {
                item.onDisplay = true;
                updated++;
            }
            // item.sourceUrl = link; // update source url just in case
        } else {
            queued.push(link);
        }
    }
    log(`Marked ${updated} existing items as On Display.`);
    log(`Found ${queued.length} NEW items to scrape.`);

    // Save immediate updates (so user sees 'On Display' for existing items right away)
    data.artworks = Array.from(artworkMap.values());
    data.total_count = data.artworks.length;
    data.last_updated = new Date().toISOString();
    fs.writeFileSync(COLLECTION_FILE, JSON.stringify(data, null, 2));
    log('Saved intermediate updates (existing items marked).');

    // 4. Scrape New Items
    // Process queue in chunks to be safe
    // If queue is huge (e.g. 3000 items), this will take: 3000 * 1s = 50 mins.
    // We should try to parallelize slightly or just run it.
    // Let's run sequentially for stability but maybe faster delay.

    for (let i = 0; i < queued.length; i++) {
        const link = queued[i];
        process.stdout.write(`\rScraping new item ${i + 1}/${queued.length}...`);

        // Minor validation of link
        if (!link) continue;

        const details = await scrapeDetails(page, link);
        if (details && details.id) {
            // Check duplicates again just in case ID resolution differs
            if (!artworkMap.has(details.id)) {
                artworks.push(details);
                artworkMap.set(details.id, details);
                added++;
            }
        }

        await sleep(300); // 300ms delay

        // Save every 20 items
        if ((i + 1) % 20 === 0) {
            data.artworks = artworks; // Array includes new items
            data.total_count = artworks.length;
            fs.writeFileSync(COLLECTION_FILE, JSON.stringify(data, null, 2));
        }
    }

    // Final Save
    data.artworks = artworks;
    data.total_count = artworks.length;
    data.last_updated = new Date().toISOString();
    fs.writeFileSync(COLLECTION_FILE, JSON.stringify(data, null, 2));

    log(`JOB DONE. Updated: ${updated}, Added: ${added}. Total DB Size: ${artworks.length}`);
    await browser.close();
}

main();
