/**
 * Museo Egizio (Turin) Scraper v5
 * 
 * Fixed pagination - properly handles page-based URLs.
 * 
 * Usage:
 *   node scripts/scrape-museo-egizio-v5.cjs --test    # Test mode (3 pages)
 *   node scripts/scrape-museo-egizio-v5.cjs           # Full scrape
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'https://collezioni.museoegizio.it';
const OUTPUT_DIR = path.join(__dirname, '../public/data');
const DOWNLOADS_DIR = path.join(__dirname, '../downloads');
const PROGRESS_FILE = path.join(DOWNLOADS_DIR, 'museo-egizio-v5-progress.json');
const OUTPUT_FILE = 'museo-egizio-collection.json';
const SAVE_INTERVAL = 50;
const ITEMS_PER_PAGE = 20;
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
            data.scrapedIds = new Set(data.scrapedIds || []);
            return data;
        } catch (e) {
            log('⚠️ Failed to load progress, starting fresh');
        }
    }
    return {
        artworks: [],
        scrapedIds: new Set(),
        currentPage: 1,
        done: false
    };
}

function saveProgress(progress) {
    const toSave = {
        ...progress,
        scrapedIds: Array.from(progress.scrapedIds || [])
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

// Extract catalog ID from URL
function getCatId(url) {
    const match = url.match(/\/material\/([^\/\?]+)/);
    return match ? match[1] : null;
}

async function getItemsFromSearchPage(page, pageNum, retries = 3) {
    const pageUrl = `${BASE_URL}/en-GB/search/?action=s&searchPage=${pageNum}`;
    log(`📄 Loading page ${pageNum}...`);

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await page.goto(pageUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
            await delay(2000);

            // Wait for results to appear
            await page.waitForSelector('a.js-link', { timeout: 15000 }).catch(() => { });
            await delay(1000);

            const items = await page.evaluate(() => {
                const results = [];
                const cards = document.querySelectorAll('a.js-link');

                cards.forEach(card => {
                    const href = card.href;
                    if (!href || !href.includes('/material/')) return;

                    const img = card.querySelector('img');
                    let imageUrl = '';

                    if (img && img.src && !img.src.includes('placeholder')) {
                        imageUrl = img.src;
                        if (imageUrl.includes('_small')) {
                            imageUrl = imageUrl.replace('_small', '_full');
                        }
                    }

                    // Extract clean URL
                    const cleanUrl = href.split('?')[0];

                    results.push({
                        url: cleanUrl,
                        image: imageUrl
                    });
                });

                return results;
            });

            log(`   Found ${items.length} items on page ${pageNum}`);
            return items;

        } catch (error) {
            log(`   ⚠️ Attempt ${attempt}/${retries} failed: ${error.message}`);
            if (attempt === retries) {
                log(`   ❌ Page ${pageNum} failed after ${retries} attempts`);
                return [];
            }
            await delay(5000);
        }
    }
    return [];
}

async function scrapeItemDetails(page, itemUrl, imageFromGrid, retries = 2) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await page.goto(itemUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
            await delay(800);

            const data = await page.evaluate(() => {
                const result = {
                    title: '',
                    year: '',
                    medium: '',
                    dimensions: '',
                    type: '',
                    inventoryNumber: '',
                    image: ''
                };

                const h1 = document.querySelector('h1');
                if (h1) result.title = h1.textContent.trim();

                const rows = document.querySelectorAll('.row.no-gutters');
                rows.forEach(row => {
                    const labelEl = row.querySelector('label');
                    if (!labelEl) return;

                    const label = labelEl.textContent.trim().toLowerCase();
                    let value = '';

                    const valueEl = row.querySelector('.value');
                    if (valueEl) {
                        value = valueEl.textContent.trim();
                    } else {
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

                    if (label.includes('material')) result.medium = value;
                    else if (label.includes('date')) result.year = value;
                    else if (label.includes('inv') || label.includes('n°')) result.inventoryNumber = value;
                    else if (label.includes('object') || label.includes('cgt')) result.type = value;
                    else if (label.includes('dynasty') && !result.year) result.year = value;
                    else if (label.includes('period') && !result.year) result.year = value;
                });

                const downloadLink = document.querySelector('a.download-img');
                if (downloadLink && downloadLink.href) {
                    result.image = downloadLink.href;
                }

                if (!result.image) {
                    const fullImg = document.querySelector('img[src*="_full"], img[src*="_big"]');
                    if (fullImg) result.image = fullImg.src;
                }

                return result;
            });

            if (!data.image && imageFromGrid) {
                data.image = imageFromGrid;
            }

            return data;

        } catch (error) {
            if (attempt === retries) {
                log(`      ⚠️ Failed to scrape: ${error.message}`);
                return null;
            }
            await delay(2000);
        }
    }
    return null;
}

async function main() {
    const args = process.argv.slice(2);
    const testMode = args.includes('--test');
    const maxPages = testMode ? 3 : Math.ceil(TOTAL_EXPECTED / ITEMS_PER_PAGE);

    log('🏛️ Museo Egizio (Turin) Scraper v5');
    log(`   Mode: ${testMode ? 'TEST (3 pages)' : 'FULL'}`);

    let progress = loadProgress();
    log(`   Resuming from page ${progress.currentPage} with ${progress.artworks.length} items`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    });
    const page = await context.newPage();

    try {
        log(`📊 Expected: ~${TOTAL_EXPECTED} items across ${Math.ceil(TOTAL_EXPECTED / ITEMS_PER_PAGE)} pages`);
        log(`   Scraping pages: ${progress.currentPage} to ${maxPages}`);

        let consecutiveEmptyPages = 0;

        for (let pageNum = progress.currentPage; pageNum <= maxPages; pageNum++) {
            progress.currentPage = pageNum;

            const items = await getItemsFromSearchPage(page, pageNum);

            if (items.length === 0) {
                consecutiveEmptyPages++;
                if (consecutiveEmptyPages >= 3) {
                    log('   ⚠️ No items on 3 consecutive pages, stopping...');
                    break;
                }
                continue;
            }

            consecutiveEmptyPages = 0;
            let pageScraped = 0;

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const catId = getCatId(item.url);

                if (!catId) continue;

                // Skip if already scraped (by catalog ID, not full URL)
                if (progress.scrapedIds.has(catId)) {
                    continue;
                }

                // Skip if no image
                if (!item.image) {
                    progress.scrapedIds.add(catId);
                    continue;
                }

                log(`   🎨 [P${pageNum}, ${++pageScraped}] ${catId}`);

                const details = await scrapeItemDetails(page, item.url, item.image);

                if (details) {
                    const artwork = {
                        id: `egizio-${catId.replace(/[^a-zA-Z0-9]/g, '-')}`,
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
                        url: item.url
                    };

                    progress.artworks.push(artwork);
                    progress.scrapedIds.add(catId);

                    log(`      ✓ ${artwork.title.substring(0, 35)}... | ${artwork.medium.substring(0, 20)}`);
                }

                if (progress.artworks.length % SAVE_INTERVAL === 0 && progress.artworks.length > 0) {
                    saveProgress(progress);
                    saveOutput(progress.artworks);
                    log(`   💾 Saved: ${progress.artworks.length} items`);
                }

                await delay(200 + Math.random() * 200);
            }

            saveProgress(progress);
            log(`   ✅ Page ${pageNum} done | Total: ${progress.artworks.length}`);
        }

        saveOutput(progress.artworks);
        progress.done = true;
        saveProgress(progress);

        log('');
        log(`✅ Complete! ${progress.artworks.length} items saved.`);

    } catch (error) {
        log(`❌ Error: ${error.message}`);
        saveProgress(progress);
        saveOutput(progress.artworks);
    } finally {
        await browser.close();
    }
}

main().catch(console.error);
