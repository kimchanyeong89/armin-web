/**
 * Museo Egizio (Turin) Final Scraper v4
 * 
 * Properly handles pagination by respecting page limits.
 * Each search page displays 20 items.
 * 
 * Usage:
 *   node scripts/scrape-museo-egizio-v4.cjs --test    # Test mode (first 60 items, 3 pages)
 *   node scripts/scrape-museo-egizio-v4.cjs           # Full scrape
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'https://collezioni.museoegizio.it';
const OUTPUT_DIR = path.join(__dirname, '../public/data');
const DOWNLOADS_DIR = path.join(__dirname, '../downloads');
const PROGRESS_FILE = path.join(DOWNLOADS_DIR, 'museo-egizio-v4-progress.json');
const OUTPUT_FILE = 'museo-egizio-collection.json';
const SAVE_INTERVAL = 50;
const ITEMS_PER_PAGE = 20; // As observed on the website
const TOTAL_EXPECTED = 5451;

const delay = ms => new Promise(r => setTimeout(r, ms));
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const log = msg => console.log(`[${timestamp()}] [EGIZIO] ${msg}`);

// Ensure directories exist
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

function loadProgress() {
    if (fs.existsSync(PROGRESS_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
            data.scrapedUrls = new Set(data.scrapedUrls || []);
            return data;
        } catch (e) {
            log('⚠️ Failed to load progress, starting fresh');
        }
    }
    return {
        artworks: [],
        scrapedUrls: new Set(),
        currentPage: 1,
        done: false
    };
}

function saveProgress(progress) {
    const toSave = {
        ...progress,
        scrapedUrls: Array.from(progress.scrapedUrls || [])
    };
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(toSave, null, 2));
}

function saveOutput(artworks) {
    const output = {
        museum: "Museo Egizio",
        museumId: "museo-egizio",
        collectionName: "Museo Egizio Collection",
        scrapedAt: new Date().toISOString(),
        totalObjects: artworks.length,
        coverImage: artworks.find(a => a.image)?.image || null,
        objects: artworks
    };
    fs.writeFileSync(path.join(OUTPUT_DIR, OUTPUT_FILE), JSON.stringify(output, null, 2));
}

async function getItemsFromSearchPage(page, pageNum) {
    // Build clean pagination URL
    const pageUrl = `${BASE_URL}/en-GB/search/?action=s&searchPage=${pageNum}`;
    log(`📄 Loading page ${pageNum}...`);

    await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await delay(2000);

    // Extract item info - only from the current page's visible items
    const items = await page.evaluate((expectedCount) => {
        const results = [];
        // Find all artwork card links
        const cards = document.querySelectorAll('a.js-link');

        cards.forEach(card => {
            const href = card.href;
            if (!href || !href.includes('/material/')) return;

            // Get image from the card
            const img = card.querySelector('img');
            let imageUrl = '';

            if (img && img.src) {
                imageUrl = img.src;
                // Convert small to full/big
                if (imageUrl.includes('_small')) {
                    imageUrl = imageUrl.replace('_small', '_full');
                }
            }

            results.push({
                url: href.split('?')[0], // Clean URL without query params
                image: imageUrl
            });
        });

        // Limit to expected per page to avoid duplicates
        return results.slice(0, expectedCount);
    }, ITEMS_PER_PAGE + 5); // Allow a small buffer

    log(`   Found ${items.length} items on page ${pageNum}`);
    return items;
}

async function scrapeItemDetails(page, itemUrl, imageFromGrid) {
    try {
        await page.goto(itemUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(1000);

        const data = await page.evaluate(() => {
            const result = {
                title: '',
                artist: '',
                year: '',
                medium: '',
                dimensions: '',
                type: '',
                inventoryNumber: '',
                image: '',
                duration: null
            };

            // Title from h1
            const h1 = document.querySelector('h1');
            if (h1) result.title = h1.textContent.trim();

            // Get metadata from rows
            const rows = document.querySelectorAll('.row.no-gutters');
            rows.forEach(row => {
                const labelEl = row.querySelector('label');
                if (!labelEl) return;

                const label = labelEl.textContent.trim().toLowerCase();
                let value = '';

                // Try .value class first
                const valueEl = row.querySelector('.value');
                if (valueEl) {
                    value = valueEl.textContent.trim();
                } else {
                    // Get text after label
                    let sibling = labelEl.nextSibling;
                    while (sibling) {
                        if (sibling.nodeType === Node.TEXT_NODE && sibling.textContent.trim()) {
                            value = sibling.textContent.trim();
                            break;
                        } else if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName !== 'LABEL') {
                            value = sibling.textContent.trim();
                            break;
                        }
                        sibling = sibling.nextSibling;
                    }
                }

                if (label.includes('material')) {
                    result.medium = value;
                } else if (label.includes('date')) {
                    result.year = value;
                } else if (label.includes('inv') || label.includes('n°')) {
                    result.inventoryNumber = value;
                } else if (label.includes('object') || label.includes('cgt')) {
                    result.type = value;
                } else if (label.includes('dimension') || label.includes('height') || label.includes('measure')) {
                    result.dimensions = value;
                } else if (label.includes('dynasty')) {
                    if (!result.year) result.year = value;
                } else if (label.includes('period')) {
                    if (!result.year) result.year = value;
                }
            });

            // Get high-res image from download link
            const downloadLink = document.querySelector('a.download-img');
            if (downloadLink && downloadLink.href) {
                result.image = downloadLink.href;
            }

            // Fallback: look for any _full or _big image
            if (!result.image) {
                const fullImg = document.querySelector('img[src*="_full"], img[src*="_big"]');
                if (fullImg) result.image = fullImg.src;
            }

            return result;
        });

        // Use grid image as fallback
        if (!data.image && imageFromGrid) {
            data.image = imageFromGrid;
        }

        return data;

    } catch (error) {
        log(`   ⚠️ Error scraping ${itemUrl}: ${error.message}`);
        return null;
    }
}

async function main() {
    const args = process.argv.slice(2);
    const testMode = args.includes('--test');
    const maxPages = testMode ? 3 : Math.ceil(TOTAL_EXPECTED / ITEMS_PER_PAGE);

    log('🏛️ Museo Egizio (Turin) Final Scraper v4');
    log(`   Mode: ${testMode ? 'TEST (3 pages, ~60 items)' : 'FULL'}`);
    log('   Turin, Italy - Egyptian Museum Collection');

    let progress = loadProgress();
    log(`   Resuming from page ${progress.currentPage} with ${progress.artworks.length} items already scraped`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    });
    const page = await context.newPage();

    try {
        log(`📊 Expected total: ${TOTAL_EXPECTED} items across ${Math.ceil(TOTAL_EXPECTED / ITEMS_PER_PAGE)} pages`);
        log(`   Pages to scrape: ${maxPages}`);

        let consecutiveEmptyPages = 0;

        for (let pageNum = progress.currentPage; pageNum <= maxPages; pageNum++) {
            progress.currentPage = pageNum;

            // Get items from search page
            const items = await getItemsFromSearchPage(page, pageNum);

            if (items.length === 0) {
                consecutiveEmptyPages++;
                if (consecutiveEmptyPages >= 3) {
                    log('   No items found on 3 consecutive pages, stopping...');
                    break;
                }
                continue;
            }

            consecutiveEmptyPages = 0;

            // Process each item
            let pageCount = 0;
            for (let i = 0; i < items.length; i++) {
                const item = items[i];

                // Skip if already scraped
                if (progress.scrapedUrls.has(item.url)) {
                    continue;
                }

                // Skip if no image
                if (!item.image) {
                    progress.scrapedUrls.add(item.url);
                    continue;
                }

                const urlId = item.url.split('/material/')[1]?.replace(/\/?$/, '') || 'unknown';
                log(`   🎨 [Page ${pageNum}, ${++pageCount}/${items.length}] ${urlId}`);

                const details = await scrapeItemDetails(page, item.url, item.image);

                if (details) {
                    const artwork = {
                        id: `egizio-${urlId.replace(/[^a-zA-Z0-9]/g, '-')}`,
                        title: details.title || 'Untitled',
                        artist: 'Ancient Egyptian',
                        year: details.year || null,
                        dateStr: details.year || null,
                        medium: details.medium || '',
                        dimensions: details.dimensions || '',
                        inventoryNumber: details.inventoryNumber || '',
                        type: details.type || '',
                        image: details.image || item.image,
                        source: 'Museo Egizio',
                        url: item.url,
                        duration: details.duration
                    };

                    progress.artworks.push(artwork);
                    progress.scrapedUrls.add(item.url);

                    log(`      ✓ ${artwork.title.substring(0, 40)}${artwork.title.length > 40 ? '...' : ''}`);
                    if (details.medium) log(`        Medium: ${details.medium.substring(0, 40)}`);
                }

                // Save checkpoint every 50 items
                if (progress.artworks.length % SAVE_INTERVAL === 0 && progress.artworks.length > 0) {
                    saveProgress(progress);
                    saveOutput(progress.artworks);
                    log(`   💾 Checkpoint saved: ${progress.artworks.length} items`);
                }

                // Small delay between requests
                await delay(300 + Math.random() * 200);
            }

            // Save after each page
            saveProgress(progress);
            log(`   ✅ Page ${pageNum} complete. Total scraped: ${progress.artworks.length}`);
        }

        // Final save
        saveOutput(progress.artworks);
        progress.done = true;
        saveProgress(progress);

        log('');
        log(`✅ Done! ${progress.artworks.length} items saved to ${OUTPUT_FILE}`);
        log('');
        log('📊 Summary:');
        log(`   Total artworks: ${progress.artworks.length}`);
        log(`   With images: ${progress.artworks.filter(a => a.image).length}`);
        log(`   With titles: ${progress.artworks.filter(a => a.title && a.title !== 'Untitled').length}`);
        log(`   With year/date: ${progress.artworks.filter(a => a.year).length}`);
        log(`   With medium: ${progress.artworks.filter(a => a.medium).length}`);
        log(`   With type: ${progress.artworks.filter(a => a.type).length}`);

    } catch (error) {
        log(`❌ Error: ${error.message}`);
        console.error(error);
        saveProgress(progress);
        saveOutput(progress.artworks);
    } finally {
        await browser.close();
    }
}

main().catch(console.error);
