/**
 * Museo Egizio (Turin) Scraper v3
 * 
 * Properly extracts artwork information including background-image based images.
 * Strategy: Get image URLs from search results grid (faster), then get metadata from detail pages.
 * 
 * Usage:
 *   node scripts/scrape-museo-egizio-v3.cjs --test    # Test mode (3 pages)
 *   node scripts/scrape-museo-egizio-v3.cjs           # Full scrape
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'https://collezioni.museoegizio.it';
const SEARCH_URL = 'https://collezioni.museoegizio.it/en-GB/search/?action=s&description=&title=&inventoryNumber=&cgt=&provenance=&acquisition=&yearFrom=&yearTo=';
const OUTPUT_DIR = path.join(__dirname, '../public/data');
const DOWNLOADS_DIR = path.join(__dirname, '../downloads');
const PROGRESS_FILE = path.join(DOWNLOADS_DIR, 'museo-egizio-v3-progress.json');
const OUTPUT_FILE = 'museo-egizio-collection.json';
const SAVE_INTERVAL = 50;
const ITEMS_PER_PAGE = 20;

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
    const pageUrl = `${SEARCH_URL}&searchPage=${pageNum}`;
    log(`📄 Loading page ${pageNum}...`);

    await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await delay(2000);

    // Extract item info from search results grid
    const items = await page.evaluate(() => {
        const results = [];
        // Target the search result cards
        const cards = document.querySelectorAll('.row.results a.js-link, a.js-link');

        cards.forEach(card => {
            const href = card.href;
            if (!href || !href.includes('/material/')) return;

            // Get image from the card
            const img = card.querySelector('img.js-img, img');
            let imageUrl = '';

            if (img) {
                // Try src first
                if (img.src && !img.src.includes('placeholder') && !img.src.includes('ph-gallery')) {
                    imageUrl = img.src;
                }
                // Try data attributes for lazy loading
                if (!imageUrl && img.dataset) {
                    imageUrl = img.dataset.src || img.dataset.lazySrc || img.dataset.original || '';
                }
                // Try background-image
                if (!imageUrl) {
                    const bg = window.getComputedStyle(img).backgroundImage;
                    if (bg && bg !== 'none') {
                        const match = bg.match(/url\(['"]?(.*?)['"]?\)/);
                        if (match) imageUrl = match[1];
                    }
                }
            }

            // Ensure full URL
            if (imageUrl && !imageUrl.startsWith('http')) {
                imageUrl = window.location.origin + imageUrl;
            }

            // Get big version if available
            if (imageUrl && imageUrl.includes('_small')) {
                imageUrl = imageUrl.replace('_small', '_big');
            }

            // Get title preview from card text
            const titleText = card.textContent.trim().split('\n')[0] || '';

            results.push({
                url: href,
                image: imageUrl,
                titlePreview: titleText.substring(0, 100)
            });
        });

        return results;
    });

    log(`   Found ${items.length} items on page ${pageNum}`);
    return items;
}

async function scrapeItemDetails(page, itemUrl, imageFromGrid) {
    try {
        // Clean URL - remove extra query params for cleaner navigation
        const cleanUrl = itemUrl.split('?')[0];

        await page.goto(cleanUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
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
                duration: null
            };

            // Title from h1
            const h1 = document.querySelector('h1');
            if (h1) result.title = h1.textContent.trim();

            // Extract metadata using multiple strategies

            // Strategy 1: Look for .row.no-gutters containers with label/value
            const rows = document.querySelectorAll('.row.no-gutters');
            rows.forEach(row => {
                const labelEl = row.querySelector('label');
                const valueEl = row.querySelector('.value') || row.querySelector('span:not(label)');
                if (!labelEl) return;

                const label = labelEl.textContent.trim().toLowerCase();
                let value = '';

                if (valueEl) {
                    value = valueEl.textContent.trim();
                } else {
                    // Get text after label
                    const rowText = row.textContent;
                    const labelText = labelEl.textContent;
                    const afterLabel = rowText.substring(rowText.indexOf(labelText) + labelText.length).trim();
                    value = afterLabel.split('\n')[0].trim();
                }

                if (label.includes('material')) {
                    result.medium = value;
                } else if (label.includes('date')) {
                    result.year = value;
                } else if (label.includes('period')) {
                    if (!result.year) result.year = value;
                } else if (label.includes('inv') || label.includes('n°')) {
                    result.inventoryNumber = value;
                } else if (label.includes('object') || label.includes('cgt')) {
                    result.type = value;
                } else if (label.includes('dimension') || label.includes('measure')) {
                    result.dimensions = value;
                } else if (label.includes('dynasty')) {
                    if (!result.year) result.year = value;
                }
            });

            // Strategy 2: Plain label elements
            const labels = document.querySelectorAll('label');
            labels.forEach(label => {
                const labelText = label.textContent.trim().toLowerCase();
                let sibling = label.nextSibling;
                let value = '';

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

                if (!value) return;

                if (labelText.includes('material') && !result.medium) {
                    result.medium = value;
                } else if (labelText.includes('date') && !result.year) {
                    result.year = value;
                }
            });

            // Try to get image from gallery carousel
            const galleryItem = document.querySelector('.owl-carousel.gallery-object .owl-item.active .item img');
            if (galleryItem) {
                // Try background-image
                const style = galleryItem.getAttribute('style') || window.getComputedStyle(galleryItem).backgroundImage;
                if (style) {
                    const match = style.match(/url\(['"]?(.*?)['"]?\)/);
                    if (match) result.image = match[1];
                }
                // Try src
                if (!result.image && galleryItem.src && !galleryItem.src.includes('ph-gallery')) {
                    result.image = galleryItem.src;
                }
            }

            // Try download link for high-res
            const downloadLink = document.querySelector('.download-img, a[href*="/objects/images/"]');
            if (downloadLink && downloadLink.href) {
                result.image = downloadLink.href;
            }

            // Fallback: any image with _big
            if (!result.image) {
                const bigImg = document.querySelector('img[src*="_big"], img[src*="/objects/images/"]');
                if (bigImg && bigImg.src) {
                    result.image = bigImg.src;
                }
            }

            // Check for dimensions in description text
            if (!result.dimensions) {
                const bodyText = document.body.innerText;
                const dimMatch = bodyText.match(/(\d+(?:\.\d+)?\s*(?:x|×)\s*\d+(?:\.\d+)?(?:\s*(?:x|×)\s*\d+(?:\.\d+)?)?\s*(?:cm|mm|m))/i);
                if (dimMatch) {
                    result.dimensions = dimMatch[1];
                }
            }

            // Check for video
            const videoElement = document.querySelector('video');
            if (videoElement) {
                result.duration = videoElement.duration || null;
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
    const maxPages = testMode ? 3 : 999;

    log('🏛️ Museo Egizio (Turin) Scraper v3');
    log(`   Mode: ${testMode ? 'TEST (3 pages)' : 'FULL'}`);
    log('   Turin, Italy - Egyptian Museum Collection');

    let progress = loadProgress();
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
        await delay(3000);

        // Try to click search if needed
        try {
            await page.click('.js-search-button', { timeout: 5000 });
            await delay(3000);
        } catch (e) {
            // Already on results
        }

        // Get total
        const totalItems = await page.evaluate(() => {
            const text = document.body.innerText;
            // Look for "5451 results" or similar
            const match = text.match(/(\d[\d,\.]*)\s*(?:results|risultati)/i);
            if (match) return parseInt(match[1].replace(/[,\.]/g, ''));
            return 5451; // fallback
        });

        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
        log(`   Total items: ${totalItems}`);
        log(`   Total pages: ${totalPages}`);
        log(`   Pages to scrape: ${Math.min(totalPages, maxPages)}`);

        let consecutiveEmptyPages = 0;

        for (let pageNum = progress.currentPage; pageNum <= Math.min(totalPages, maxPages); pageNum++) {
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
            for (let i = 0; i < items.length; i++) {
                const item = items[i];

                // Skip if already scraped
                if (progress.scrapedUrls.has(item.url)) {
                    continue;
                }

                // Skip if no image in grid (we need images per user request)
                if (!item.image) {
                    log(`   ⏭️ [Page ${pageNum}, ${i + 1}/${items.length}] No image in grid, skipping`);
                    progress.scrapedUrls.add(item.url);
                    continue;
                }

                const urlId = item.url.split('/material/')[1]?.replace(/\/?$/, '').replace(/\//g, '_') || item.url.split('/').pop();
                log(`   🎨 [Page ${pageNum}, ${i + 1}/${items.length}] ${urlId}`);

                const details = await scrapeItemDetails(page, item.url, item.image);

                if (details) {
                    // Use grid image if detail page didn't provide one
                    const finalImage = details.image || item.image;

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
                        image: finalImage,
                        source: 'Museo Egizio',
                        url: item.url,
                        duration: details.duration
                    };

                    progress.artworks.push(artwork);
                    progress.scrapedUrls.add(item.url);

                    log(`      ✓ ${artwork.title.substring(0, 50)}${artwork.title.length > 50 ? '...' : ''}`);
                    if (artwork.medium) log(`        Medium: ${artwork.medium.substring(0, 50)}`);
                    if (artwork.year) log(`        Year: ${artwork.year}`);
                }

                // Save checkpoint
                if (progress.artworks.length % SAVE_INTERVAL === 0 && progress.artworks.length > 0) {
                    saveProgress(progress);
                    saveOutput(progress.artworks);
                    log(`   💾 Checkpoint saved: ${progress.artworks.length} items`);
                }

                // Small delay
                await delay(300 + Math.random() * 300);
            }

            // Save after each page
            saveProgress(progress);
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
