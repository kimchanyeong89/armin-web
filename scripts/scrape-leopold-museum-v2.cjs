/**
 * Leopold Museum Collection Scraper V2
 * Strategy: Iterate through search result pages to collect ALL valid artwork URLs first,
 * then scrape details for each. This guarantees coverage effectively.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/leopold-museum-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/leopold-museum-v2-progress.json');
const LOG_FILE = path.join(__dirname, '../downloads/leopold-museum-v2.log');

// Ensure directories exist
if (!fs.existsSync(path.dirname(OUTPUT_FILE))) fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
if (!fs.existsSync(path.dirname(PROGRESS_FILE))) fs.mkdirSync(path.dirname(PROGRESS_FILE), { recursive: true });

function log(message) {
    // Ensure log file exists
    if (!fs.existsSync(LOG_FILE)) {
        fs.writeFileSync(LOG_FILE, '');
    }
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
    fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Reuse the robust metadata extraction logic
async function scrapeArtworkDetail(page, artworkUrl) {
    try {
        const response = await page.goto(artworkUrl, { waitUntil: 'load', timeout: 30000 });
        if (!response || response.status() !== 200) {
            log(`⚠️ Failed to load page: ${artworkUrl}`);
            return null;
        }

        // Wait for stability
        try {
            await page.waitForTimeout(1000);
            await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });
        } catch (e) { }

        // Quick check for "not found"
        const isNotFound = await page.evaluate(() => document.body.innerText.includes('Page not found') || document.body.innerText.includes('Object not found'));
        if (isNotFound) return null;

        const metadata = await page.evaluate(() => {
            const data = {};
            data.originalUrl = window.location.href;

            const bodyText = document.body.textContent || '';

            // Title
            const titleEl = document.querySelector('.object-title') || document.querySelector('h1');
            if (titleEl) {
                data.title = titleEl.textContent.trim();
                // Try to extract date from title if present
                const dateMatch = data.title.match(/,\s*(\d{4})/);
                if (dateMatch) data.date = dateMatch[1];
            }

            // Main Metadata Extraction logic looking for key labels
            // Common layout: <div class="label">Date</div><div class="value">1910</div>
            // Or structure like text blocks.

            // Helper to find value by label text
            function getValueByLabel(labelText) {
                // Strategy 1: Look for DL/DT/DD or known classes (adjust based on actual site structure)
                // Based on previous script, it seems to be unstructured text analysis or simple layout.
                // Let's stick to the text search approach which was working, but refine it.

                // Find element containing label
                const labels = Array.from(document.querySelectorAll('strong, b, .label, dt'));
                const target = labels.find(el => el.textContent.includes(labelText));
                if (target) {
                    // Try next sibling or parent's text
                    let value = target.nextSibling?.textContent?.trim(); // if text node
                    if (!value && target.nextElementSibling) value = target.nextElementSibling.textContent.trim();
                    return value;
                }
                return null;
            }

            // Re-implementing the text-search strategy from previous script as fallback
            const objDataIdx = bodyText.lastIndexOf('Object data');
            const objDataSection = objDataIdx !== -1 ? bodyText.substring(objDataIdx, objDataIdx + 2000) : bodyText;

            const extractSection = (startMarker, endMarkers) => {
                const startIdx = objDataSection.indexOf(startMarker);
                if (startIdx === -1) return null;

                // Find nearest end marker
                let bestEndIdx = -1;
                for (const endMarker of endMarkers) {
                    const idx = objDataSection.indexOf(endMarker, startIdx + startMarker.length);
                    if (idx !== -1 && (bestEndIdx === -1 || idx < bestEndIdx)) {
                        bestEndIdx = idx;
                    }
                }

                if (bestEndIdx !== -1) {
                    return objDataSection.substring(startIdx + startMarker.length, bestEndIdx).trim();
                }
                // Fallback: take next 100 chars
                return objDataSection.substring(startIdx + startMarker.length, startIdx + startMarker.length + 100).split('\n')[0].trim();
            };

            // Date
            if (!data.date) {
                const d = extractSection('Date', ['Category', 'Material', 'Dimensions']);
                if (d) {
                    const cleanD = d.replace(/:/g, '').trim();
                    const m = cleanD.match(/(\d{4})/);
                    if (m) data.date = m[1];
                    else data.date = cleanD;
                }
            }

            // Object Type / Category
            const cat = extractSection('Category', ['Material', 'Dimensions', 'Artist']);
            if (cat) data.objectType = cat.replace(/:/g, '').trim();

            // Medium
            const med = extractSection('Material', ['Dimensions', 'Artist', 'Credit']);
            if (med) {
                data.medium = med.replace(/\/technique/i, '').replace(/:/g, '').trim();
            }

            // Dimensions
            const dims = extractSection('Dimensions', ['Artist', 'Credit']);
            if (dims) data.dimensions = dims.replace(/:/g, '').trim();

            // Artist
            const art = extractSection('Artist/author', ['GND', 'Credit']);
            if (art) data.artist = art.replace(/:/g, '').trim();
            if (!data.artist) {
                const art2 = extractSection('Artists', ['(', 'GND']);
                if (art2) data.artist = art2.replace(/:/g, '').trim();
            }

            // Description (Text section above Object data)
            const textMatch = bodyText.match(/Text[:\s]+([^\n]+(?:\n[^\n]+)*?)(?:\n\n|Object data|Provenance)/i);
            if (textMatch) data.description = textMatch[1].trim();

            // Image
            const imgEl = document.querySelector('.item-image img, .object-image img, img[src*="/images/"]');
            if (imgEl && !imgEl.src.includes('logo')) {
                let src = imgEl.src || imgEl.getAttribute('data-src');
                if (src) {
                    if (src.startsWith('/')) src = window.location.origin + src;
                    data.imageUrl = src;
                }
            }

            return data;
        });

        return metadata;
    } catch (e) {
        log(`⚠️ Error parsing ${artworkUrl}: ${e.message}`);
        return null;
    }
}

async function main() {
    log('🚀 Starting Leopold Museum Scraper V2...');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Load progress if exists
    let existingData = [];
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            const raw = fs.readFileSync(OUTPUT_FILE);
            const json = JSON.parse(raw);
            if (json.artworks) existingData = json.artworks;
        } catch (e) { log('Could not read existing file, starting fresh.'); }
    }

    const processedUrls = new Set(existingData.map(a => a.sourceUrl));
    log(`Found ${existingData.length} existing artworks.`);

    // Step 1: Collect ALL URLs from Search Pages
    const allUrls = new Set();
    const baseUrl = 'https://onlinecollection.leopoldmuseum.org/en/search/';
    const limit = 100;
    let offset = 0;

    log('Phase 1: Collecting Artwork URLs...');

    while (true) {
        const searchUrl = `${baseUrl}?offset=${offset}&limit=${limit}&layout=default`;
        // log(`Visiting ${searchUrl} ...`);

        await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });

        try {
            await page.waitForSelector('a[href*="/en/object/"]', { timeout: 10000 });
        } catch (e) {
            log(`Timeout waiting for selector at offset ${offset}. Page might be empty or loading failed.`);
        }

        // Check if we hit a "No results" page or just extracted loops
        const extracted = await page.evaluate(() => {
            const anchors = Array.from(document.querySelectorAll('a[href*="/en/object/"], a[href*="/en/objekt/"]'));
            return anchors.map(a => a.href).filter(h => !h.includes('search'));
        });

        if (extracted.length === 0) {
            log(`No more items found at offset ${offset}. Stopping collection.`);
            break;
        }

        let newCount = 0;
        extracted.forEach(url => {
            // Standardize URL
            // Ensure https
            if (url.startsWith('http:')) url = url.replace('http:', 'https:');
            if (!allUrls.has(url)) {
                allUrls.add(url);
                newCount++;
            }
        });

        log(`Offset ${offset}: Found ${extracted.length} links (${newCount} new). Total collected: ${allUrls.size}`);

        // If we got fewer than limit, likely the last page
        if (extracted.length < limit) break;

        offset += limit;
        // Safety
        if (offset > 10000) break; // 3000 items expected, 10k safety

        await sleep(500);
    }

    const urlsToScrape = Array.from(allUrls);
    log(`Total URLs to process: ${urlsToScrape.length}`);

    // Step 2: Process URLs
    let results = [...existingData];
    const resultsMap = new Map(results.map(r => [r.sourceUrl, r]));

    let newScrapedCount = 0;

    // Create a new page for scraping details to keep search page separate if needed
    // Using a fresh context for detail scraping might be safer
    const detailContext = await browser.newContext();
    const detailPage = await detailContext.newPage();

    for (let i = 0; i < urlsToScrape.length; i++) {
        const url = urlsToScrape[i];

        // Check if already exists and valid
        if (resultsMap.has(url)) {
            continue;
        }

        log(`[${i + 1}/${urlsToScrape.length}] Scraping ${url}`);

        const meta = await scrapeArtworkDetail(detailPage, url);
        if (meta) {
            const id = url.split('/').pop();
            const artwork = {
                id: `leopold-${id}`,
                name: meta.title || 'Untitled',
                artist: meta.artist || 'Unknown',
                year: parseInt(meta.date) || 0,
                date: meta.date || '',
                image: meta.imageUrl || '',
                sourceUrl: url,
                originalUrl: meta.originalUrl || url,
                exhibitionName: 'Leopold Museum',
                exhibitionTitle: 'Leopold Museum Collection',
                description: meta.description || '',
                medium: meta.medium || '',
                dimension: meta.dimensions || '',
                category: meta.objectType || '',
                objectType: meta.objectType || '',
                type: '2D' // Default
            };

            // Refine Type
            const t = (artwork.category || '').toLowerCase();
            if (t.includes('sculpture') || t.includes('plastic') || t.includes('relief') || t.includes('object')) {
                artwork.type = '3D';
            }

            resultsMap.set(url, artwork);
            results.push(artwork);
            newScrapedCount++;
        }

        // Save periodically
        if (newScrapedCount > 0 && newScrapedCount % 20 === 0) {
            const out = {
                museum: 'Leopold Museum',
                collection: 'Leopold Museum Collection',
                total: results.length,
                artworks: Array.from(resultsMap.values()),
                scrapedAt: new Date().toISOString()
            };
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(out, null, 2));
            log(`Saved progress. Total: ${results.length}`);
        }

        await sleep(1000 + Math.random() * 1000); // Polite delay
    }

    // Final Save
    const finalOut = {
        museum: 'Leopold Museum',
        collection: 'Leopold Museum Collection',
        total: Array.from(resultsMap.values()).length,
        artworks: Array.from(resultsMap.values()),
        scrapedAt: new Date().toISOString()
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalOut, null, 2));
    log(`✅ Completed! Total artworks: ${finalOut.total}. New scraped: ${newScrapedCount}`);

    await browser.close();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
