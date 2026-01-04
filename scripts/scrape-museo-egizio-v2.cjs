/**
 * Museo Egizio (Turin) Scraper v2
 * 
 * Improved scraper that properly extracts artwork information from detail pages.
 * 
 * Usage:
 *   node scripts/scrape-museo-egizio-v2.cjs --test    # Test mode (3 pages)
 *   node scripts/scrape-museo-egizio-v2.cjs           # Full scrape
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'https://collezioni.museoegizio.it';
const SEARCH_URL = 'https://collezioni.museoegizio.it/en-GB/search/?action=s&description=&title=&inventoryNumber=&cgt=&provenance=&acquisition=&yearFrom=&yearTo=';
const OUTPUT_DIR = path.join(__dirname, '../public/data');
const DOWNLOADS_DIR = path.join(__dirname, '../downloads');
const PROGRESS_FILE = path.join(DOWNLOADS_DIR, 'museo-egizio-v2-progress.json');
const OUTPUT_FILE = 'museo-egizio-collection.json';
const SAVE_INTERVAL = 50;
const ITEMS_PER_PAGE = 20; // Items per page on the website

const delay = ms => new Promise(r => setTimeout(r, ms));
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const log = msg => console.log(`[${timestamp()}] [EGIZIO] ${msg}`);

// Ensure directories exist
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

function loadProgress() {
    if (fs.existsSync(PROGRESS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
        } catch (e) {
            log('⚠️ Failed to load progress, starting fresh');
        }
    }
    return {
        artworks: [],
        scrapedUrls: new Set(),
        currentPage: 1,
        totalPages: null,
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

async function acceptCookies(page) {
    try {
        await delay(1000);
        // Close any cookie banner by pressing escape or clicking
        await page.keyboard.press('Escape');
        await delay(500);
    } catch (e) {
        // Continue
    }
}

async function getItemLinksFromPage(page, pageNum) {
    const pageUrl = `${SEARCH_URL}&searchPage=${pageNum}`;
    log(`📄 Loading page ${pageNum}...`);

    await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await delay(2000);

    // Extract item links
    const links = await page.evaluate(() => {
        const items = [];
        // Find all artwork card links
        const anchors = document.querySelectorAll('a.js-link');
        anchors.forEach(a => {
            if (a.href && a.href.includes('/material/')) {
                items.push(a.href);
            }
        });

        // Also try other selectors
        if (items.length === 0) {
            document.querySelectorAll('a[href*="/material/"]').forEach(a => {
                if (!items.includes(a.href)) {
                    items.push(a.href);
                }
            });
        }

        return items;
    });

    log(`   Found ${links.length} items on page ${pageNum}`);
    return links;
}

async function scrapeItemDetails(page, itemUrl) {
    try {
        await page.goto(itemUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(1500);

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
                duration: null // For video items
            };

            // Title - h1 element
            const h1 = document.querySelector('h1');
            if (h1) result.title = h1.textContent.trim();

            // Extract metadata from labels
            const labels = document.querySelectorAll('label');
            labels.forEach(label => {
                const labelText = label.textContent.trim().toLowerCase();
                // Get the next sibling text content
                let value = '';
                let sibling = label.nextSibling;
                while (sibling) {
                    if (sibling.nodeType === Node.TEXT_NODE) {
                        value = sibling.textContent.trim();
                        if (value) break;
                    } else if (sibling.nodeType === Node.ELEMENT_NODE) {
                        value = sibling.textContent.trim();
                        if (value) break;
                    }
                    sibling = sibling.nextSibling;
                }

                if (labelText.includes('material')) {
                    result.medium = value;
                } else if (labelText.includes('date')) {
                    result.year = value;
                } else if (labelText.includes('period')) {
                    if (!result.year) result.year = value;
                } else if (labelText.includes('inv') || labelText.includes('n°')) {
                    result.inventoryNumber = value;
                } else if (labelText.includes('object') || labelText.includes('cgt')) {
                    result.type = value;
                } else if (labelText.includes('dimension') || labelText.includes('height') || labelText.includes('size')) {
                    result.dimensions = value;
                }
            });

            // Try to extract dimensions from page text if not found
            if (!result.dimensions) {
                const bodyText = document.body.innerText;
                const dimMatch = bodyText.match(/(\d+(?:\.\d+)?\s*(?:x|×)\s*\d+(?:\.\d+)?(?:\s*(?:x|×)\s*\d+(?:\.\d+)?)?\s*(?:cm|mm|m))/i);
                if (dimMatch) {
                    result.dimensions = dimMatch[1];
                }
                // Also look for height patterns
                if (!result.dimensions) {
                    const heightMatch = bodyText.match(/(?:height|h\.?|altezza)[:\s]*(\d+(?:\.\d+)?\s*(?:cm|mm|m))/i);
                    if (heightMatch) {
                        result.dimensions = 'H. ' + heightMatch[1];
                    }
                }
            }

            // Get main image (look for big/large version)
            const imgSelectors = [
                '.js-main-image',
                'img[src*="_big"]',
                '.gallery img',
                '.image-container img',
                'article img'
            ];

            for (const selector of imgSelectors) {
                const img = document.querySelector(selector);
                if (img && img.src && !img.src.includes('logo') && !img.src.includes('icon')) {
                    result.image = img.src;
                    break;
                }
            }

            // Fallback: find largest image with _big suffix or on domain
            if (!result.image) {
                const allImages = document.querySelectorAll('img');
                for (const img of allImages) {
                    if (img.src && img.src.includes('museoegizio') &&
                        (img.src.includes('_big') || img.src.includes('/objects/'))) {
                        result.image = img.src;
                        break;
                    }
                }
            }

            // Check for video
            const videoElement = document.querySelector('video');
            if (videoElement) {
                result.duration = videoElement.duration || null;
            }

            return result;
        });

        return data;

    } catch (error) {
        log(`   ⚠️ Error scraping ${itemUrl}: ${error.message}`);
        return null;
    }
}

async function main() {
    const args = process.argv.slice(2);
    const testMode = args.includes('--test');
    const maxPages = testMode ? 3 : 999;

    log('🏛️ Museo Egizio (Turin) Scraper v2');
    log(`   Mode: ${testMode ? 'TEST (3 pages)' : 'FULL'}`);
    log('   Turin, Italy - Egyptian Museum Collection');

    let progress = loadProgress();

    // Convert scrapedUrls back to Set
    if (Array.isArray(progress.scrapedUrls)) {
        progress.scrapedUrls = new Set(progress.scrapedUrls);
    } else {
        progress.scrapedUrls = new Set();
    }

    log(`   Resuming from page ${progress.currentPage} with ${progress.artworks.length} items already scraped`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    });
    const page = await context.newPage();

    try {
        // First, get total count
        log('📋 Getting total count...');
        await page.goto(SEARCH_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await acceptCookies(page);
        await delay(2000);

        // Look for search button and click it if needed
        try {
            const searchBtn = await page.$('.js-search-button');
            if (searchBtn) {
                await searchBtn.click();
                await delay(2000);
            }
        } catch (e) {
            // Continue
        }

        // Get total results
        const totalText = await page.evaluate(() => {
            // Look for results count text
            const text = document.body.innerText;
            const match = text.match(/(\d[\d,\.]*)\s*(?:results|oggetti|items)/i);
            return match ? match[1].replace(/[,\.]/g, '') : null;
        });

        const totalItems = totalText ? parseInt(totalText) : 5451; // Fallback to known count
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

        log(`   Total items: ${totalItems}`);
        log(`   Total pages: ${totalPages}`);
        log(`   Pages to scrape: ${Math.min(totalPages, maxPages)}`);

        // Scrape pages
        let consecutiveEmptyPages = 0;

        for (let pageNum = progress.currentPage; pageNum <= Math.min(totalPages, maxPages); pageNum++) {
            progress.currentPage = pageNum;

            // Get item links from this page
            const itemLinks = await getItemLinksFromPage(page, pageNum);

            if (itemLinks.length === 0) {
                consecutiveEmptyPages++;
                if (consecutiveEmptyPages >= 3) {
                    log('   No items found on 3 consecutive pages, stopping...');
                    break;
                }
                continue;
            }

            consecutiveEmptyPages = 0;

            // Scrape each item
            for (let i = 0; i < itemLinks.length; i++) {
                const url = itemLinks[i];

                // Skip if already scraped
                if (progress.scrapedUrls.has(url)) {
                    continue;
                }

                const urlId = url.split('/material/')[1]?.replace(/\/?$/, '') || url.split('/').pop();
                log(`   🎨 [Page ${pageNum}, ${i + 1}/${itemLinks.length}] ${urlId}`);

                const details = await scrapeItemDetails(page, url);

                if (details) {
                    // Skip items without images (as per user request)
                    if (!details.image) {
                        log(`      ⏭️ No image, skipping`);
                        progress.scrapedUrls.add(url);
                        continue;
                    }

                    const artwork = {
                        id: `egizio-${urlId.replace(/[^a-zA-Z0-9]/g, '-')}`,
                        title: details.title || 'Untitled',
                        artist: 'Ancient Egyptian', // Default for Egyptian artifacts
                        year: details.year || null,
                        dateStr: details.year || null,
                        medium: details.medium || '',
                        dimensions: details.dimensions || '',
                        inventoryNumber: details.inventoryNumber || '',
                        type: details.type || '',
                        image: details.image,
                        source: 'Museo Egizio',
                        url: url,
                        duration: details.duration // For videos
                    };

                    progress.artworks.push(artwork);
                    progress.scrapedUrls.add(url);

                    log(`      ✓ ${artwork.title.substring(0, 50)}${artwork.title.length > 50 ? '...' : ''}`);
                    if (artwork.medium) log(`        Medium: ${artwork.medium}`);
                    if (artwork.dimensions) log(`        Dimensions: ${artwork.dimensions}`);
                }

                // Save checkpoint
                if (progress.artworks.length % SAVE_INTERVAL === 0) {
                    saveProgress(progress);
                    saveOutput(progress.artworks);
                    log(`   💾 Checkpoint saved: ${progress.artworks.length} items`);
                }

                // Small delay between requests
                await delay(500 + Math.random() * 500);
            }

            // Save after each page
            saveProgress(progress);
        }

        // Save final output
        saveOutput(progress.artworks);
        progress.done = true;
        saveProgress(progress);

        log('');
        log(`✅ Done! ${progress.artworks.length} items saved to ${OUTPUT_FILE}`);
        log('');
        log('📊 Summary:');
        log(`   Total artworks: ${progress.artworks.length}`);
        log(`   With images: ${progress.artworks.filter(a => a.image).length}`);
        log(`   With titles: ${progress.artworks.filter(a => a.title).length}`);
        log(`   With year/date: ${progress.artworks.filter(a => a.year).length}`);
        log(`   With medium: ${progress.artworks.filter(a => a.medium).length}`);
        log(`   With dimensions: ${progress.artworks.filter(a => a.dimensions).length}`);
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
