/**
 * Rijksmuseum On Display Scraper
 * 
 * Goal: Update existing 'The collection' (formerly Paintings) with "On display" status
 * and add missing on-display items from other categories.
 * 
 * Source: https://www.rijksmuseum.nl/en/collection/search?collectionSearchContext=Art&sortingType=Popularity&onlyWithImages=true&onlyInMuseum=true
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.rijksmuseum.nl';
// The URL provided by user (ensure page=1 is handled dynamically)
const SEARCH_URL_BASE = `${BASE_URL}/en/collection/search?collectionSearchContext=Art&sortingType=Popularity&onlyWithImages=true&onlyInMuseum=true`;

const OUTPUT_FILE = path.join(__dirname, '../public/data/rijksmuseum-paintings-collection.json');
const LOG_FILE = path.join(__dirname, '../downloads/rijksmuseum-ondisplay-log.txt');

// Rate limiting
const DELAY_BETWEEN_PAGES = 2000;
const DELAY_BETWEEN_ARTWORKS = 500; // Slightly faster as we might skip many

function log(message) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Load existing collection
function loadCollection() {
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
            log(`📥 Existing collection loaded: ${data.artworks?.length || 0} items.`);
            return data;
        } catch (e) {
            log('⚠️ Failed to load existing collection.');
        }
    }
    return { artworks: [] };
}

// Collect On Display links
async function collectOnDisplayLinks(page) {
    log('📋 Collecting "On Display" links...');
    const links = new Set();
    let currentPage = 1;
    let hasMore = true;

    while (hasMore) {
        const url = `${SEARCH_URL_BASE}&page=${currentPage}`;
        log(`Loading page ${currentPage}...`);

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await sleep(1500);

            const pageLinks = await page.evaluate(() => {
                const found = [];
                // Select artwork links
                const anchors = document.querySelectorAll('a[href*="/en/collection/"]');
                anchors.forEach(a => {
                    const href = a.getAttribute('href');
                    // Filter distinct artwork URLs
                    if (href && (href.includes('/collection/SK-') || href.includes('/collection/object/'))) {
                        found.push(href.startsWith('http') ? href : 'https://www.rijksmuseum.nl' + href);
                    }
                });
                return found;
            });

            if (pageLinks.length === 0) {
                log('No links found on this page. Stopping.');
                hasMore = false;
                break;
            }

            pageLinks.forEach(l => links.add(l));
            log(`Found ${pageLinks.length} links on page ${currentPage}. Total unique: ${links.size}`);

            // Check for next button or simply if we found items (Rijksmuseum pagination usually works until no items)
            // Rijksmuseum uses infinite scroll or simple pagination buttons.
            // We'll check if there's a next button.
            const hasNext = await page.evaluate(() => {
                const nextBtn = document.querySelector('a[aria-label="Next page"], a.pagination-next, .pagination .next');
                // Also check if we are just out of results text
                if (document.body.innerText.includes('No results found')) return false;
                return !!nextBtn || document.querySelectorAll('.collection-art-object-item').length > 0;
            });

            // Safety break for testing/time limits - remove for full run if needed
            // User said "additionally collect", implying potentially many.
            // But let's check standard pagination limit.
            // 100 pages is a lot (~1000 items). "On display" might be manageable.
            if (!hasNext && pageLinks.length < 10) {
                hasMore = false;
            } else {
                // Rijksmuseum often lists ~8000 items on display. We should probably limit or ensure we can paginate all.
                // For now, let's assume standard pagination works.
                // URL param `page` works.
            }

            // Stop if we see no new links compared to previous set (safety)
            // (Optimized: we iterate pages)

            currentPage++;
            await sleep(DELAY_BETWEEN_PAGES);

        } catch (e) {
            log(`Error on page ${currentPage}: ${e.message}`);
            hasMore = false;
        }
    }
    return Array.from(links);
}

// Scrape details for a single artwork
async function scrapeArtworkDetail(page, url) {
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(1000);

        return await page.evaluate((pageUrl) => {
            const result = {
                id: '',
                objectNumber: '',
                title: '',
                artist: '',
                date: '',
                year: null,
                medium: '',
                dimensions: '',
                description: '',
                imageUrl: '',
                thumbnailUrl: '',
                onDisplay: true, // We are scraping from "On Display" results
                displayLocation: '',
                sourceUrl: pageUrl,
                metadata: {}
            };

            // ID Extraction from URL
            const urlMatch = pageUrl.match(/\/collection\/(?:object\/)?([^/?]+)/);
            if (urlMatch) {
                result.objectNumber = urlMatch[1].replace(/--[a-f0-9]+$/, '');
                result.id = result.objectNumber;
            }

            // H1 Title
            const h1 = document.querySelector('h1');
            if (h1) result.title = h1.textContent?.trim() || '';

            // Metadata extraction (from DL/DT/DD or similar structures)
            // General query for label-value pairs
            const metadataElements = document.querySelectorAll('.artwork-details-row, .object-details dl, .accordion-item-content dl');
            // Note: Rijksmuseum markup varies.
            // Try generic approach: find all DTs and corresponding DDs
            const dts = document.querySelectorAll('dt');
            dts.forEach(dt => {
                const label = dt.textContent.trim().toLowerCase();
                let dd = dt.nextElementSibling;
                while (dd && dd.tagName !== 'DD') dd = dd.nextElementSibling;
                if (dd && dd.tagName === 'DD') {
                    result.metadata[label] = dd.textContent.trim();
                }
            });

            // Artist
            const artistKeys = ['maker', 'artist', 'creator', 'painters', 'vervaardiger'];
            for (const k of artistKeys) {
                if (result.metadata[k]) {
                    result.artist = result.metadata[k];
                    break;
                }
            }
            // Fallback artist from h2/h3 if typical layout
            if (!result.artist) {
                const artistEl = document.querySelector('h2.item-maker, .artwork-artist');
                if (artistEl) result.artist = artistEl.textContent.trim();
            }

            // Date
            const dateKeys = ['marketing date', 'dating', 'date', 'datering', 'periode'];
            for (const k of dateKeys) {
                if (result.metadata[k]) {
                    result.date = result.metadata[k];
                    const m = result.date.match(/(\d{4})/);
                    if (m) result.year = parseInt(m[1]);
                    break;
                }
            }

            // Medium / Material
            const medKeys = ['material', 'technique', 'medium', 'materiaal', 'techniek'];
            for (const k of medKeys) {
                if (result.metadata[k]) {
                    result.medium = result.metadata[k];
                    break;
                }
            }

            // Dimensions
            const dimKeys = ['measurements', 'dimensions', 'afmetingen'];
            for (const k of dimKeys) {
                if (result.metadata[k]) {
                    result.dimensions = result.metadata[k];
                    break;
                }
            }

            // Location
            // Try identifying "On display in..." text
            const bodyText = document.body.innerText;
            const locMatch = bodyText.match(/(?:On display in|Te zien in)\s+(.+?)(\n|$)/i);
            if (locMatch) {
                result.displayLocation = locMatch[1].trim();
            }

            // Image
            const img = document.querySelector('.image-container img, .header-image img, img.media-object');
            if (img) {
                let src = img.getAttribute('src');
                if (src) {
                    if (!src.startsWith('http')) src = 'https://www.rijksmuseum.nl' + src;
                    result.thumbnailUrl = src;
                    result.imageUrl = src.replace(/w=\d+/, 'w=1200').replace(/h=\d+/, 'h=1200'); // Higher res
                }
            }

            return result;
        }, url);
    } catch (e) {
        log(`⚠️ Error scraping details for ${url}: ${e.message}`);
        return null;
    }
}

async function main() {
    log('🚀 Starting Rijksmuseum "On Display" Updater...');

    // 1. Load existing data
    const data = loadCollection();
    let artworks = data.artworks || [];
    log(`Loaded ${artworks.length} existing artworks.`);

    // Create Map for fast lookup
    const artworkMap = new Map();
    artworks.forEach(a => artworkMap.set(a.id, a));

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        // 2. Collect all "On Display" links
        // Note: Use a reasonable limit or iterate all. The prompt implies we want to add them.
        // Rijksmuseum likely has ~3000-8000 on display.
        // For this task, we will try to get a good chunk or all.
        // NOTE: For speed in this context, I will limit to first 10 pages (~100 items) to demonstrate, 
        // unless I should run longer. The user said "collect ... works from that link".
        // I will try to collect as many as possible but maybe cap at 50 pages for safety if time is tight.
        // Let's implement full loop but break if it takes too long? 
        // Better: Run loop until no more pages.
        const onDisplayLinks = await collectOnDisplayLinks(page);
        log(`Found ${onDisplayLinks.length} items on display.`);

        // 3. Process items
        let updatedCount = 0;
        let addedCount = 0;

        for (let i = 0; i < onDisplayLinks.length; i++) {
            const url = onDisplayLinks[i];

            // Extract ID to check existence before visiting?
            const idMatch = url.match(/\/collection\/(?:object\/)?([^/?]+)/);
            const id = idMatch ? idMatch[1].replace(/--[a-f0-9]+$/, '') : null;

            if (id && artworkMap.has(id)) {
                // Already exists -> Update status
                const existing = artworkMap.get(id);
                if (!existing.onDisplay) {
                    existing.onDisplay = true;
                    // Maybe update location if possible?
                    // existing.displayLocation = ... (need to visit to get location if crucial, or skip to save time)
                    // User asked to "additionally collect works... duplicates... update".
                    // Visiting to verify "On display in Room X" is better.
                }
                // Optimization: If we trust it's on display because it came from the search, we can skip visiting 
                // IF we don't need the specific Room location.
                // But getting Room location is nice. Let's visit 10% or just fast update?
                // User: "Duplicates -> don't add or remove... put in collection".
                // I'll visit to ensure data quality (location).
            }

            // Actually, let's scrape details for ALL on-display items to get fresh Location data.
            process.stdout.write(`\rProcessing ${i + 1}/${onDisplayLinks.length}...`);

            const details = await scrapeArtworkDetail(page, url);
            if (details && details.id) {
                if (artworkMap.has(details.id)) {
                    // Update existing
                    const existing = artworkMap.get(details.id);
                    existing.onDisplay = true;
                    existing.displayLocation = details.displayLocation;
                    // Merge other fields if empty?
                    if (!existing.image && details.imageUrl) {
                        existing.image = details.imageUrl;
                        existing.thumbnail = details.thumbnailUrl;
                    }
                    updatedCount++;
                } else {
                    // Add new
                    artworks.push(details);
                    artworkMap.set(details.id, details);
                    addedCount++;
                }
            }

            // Save periodically
            if ((i + 1) % 20 === 0) {
                data.artworks = artworks;
                data.total_count = artworks.length;
                data.last_updated = new Date().toISOString();
                fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
            }

            await sleep(DELAY_BETWEEN_ARTWORKS);
        }

        // Final save
        data.artworks = artworks;
        data.total_count = artworks.length;
        data.last_updated = new Date().toISOString();
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));

        log(`✅ Done. Updated: ${updatedCount}, Added: ${addedCount}. Total: ${artworks.length}`);

    } catch (err) {
        log(`❌ Fatal error: ${err.message}`);
        console.error(err);
    } finally {
        await browser.close();
    }
}

main();
