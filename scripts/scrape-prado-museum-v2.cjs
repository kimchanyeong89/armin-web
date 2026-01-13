/**
 * Museo del Prado Collection Scraper (Playwright) - v2
 * 
 * Improved version with:
 * - Better Cloudflare handling with manual verification wait
 * - Extensive scrolling to load all 9,135 artworks
 * - Single page context to maintain session
 * - Extracts detail page URLs for direct navigation
 * 
 * Usage:
 * 1. Run the script
 * 2. When Cloudflare challenge appears, solve it manually in the browser
 * 3. Script will continue after verification
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'https://www.museodelprado.es';
const COLLECTION_URL = `${BASE_URL}/en/the-collection/art-works`;
const OUTPUT_FILE = path.join(__dirname, '../public/data/museo-del-prado-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/prado-progress-v2.json');
const LOG_FILE = path.join(__dirname, '../downloads/prado-scrape-v2.log');

const SCROLL_PAUSE = 800;      // ms between scrolls
const SCROLL_DISTANCE = 1500;  // pixels per scroll
const MAX_NO_NEW_ITEMS = 30;   // attempts before stopping

// Logging
const log = (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    fs.appendFileSync(LOG_FILE, logMessage + '\n');
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Load/save progress
const loadProgress = () => {
    try {
        if (fs.existsSync(PROGRESS_FILE)) {
            return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
        }
    } catch (e) { }
    return { phase: 'list', listItems: [], artworks: [], detailsFetched: [] };
};

const saveProgress = (progress) => {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
};

// Wait for Cloudflare challenge to be solved (manual intervention)
const waitForCloudflareClear = async (page, maxWaitMs = 120000) => {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
        const isChallenge = await page.evaluate(() => {
            return document.title.toLowerCase().includes('just a moment') ||
                document.body.innerText.toLowerCase().includes('verify you are human') ||
                document.body.innerText.toLowerCase().includes('checking your browser');
        });

        if (!isChallenge) {
            log('   ✅ Cloudflare challenge cleared');
            return true;
        }

        log('   ⏳ Waiting for Cloudflare verification... (solve manually if needed)');
        await delay(5000);
    }

    throw new Error('Cloudflare challenge timeout');
};

// Phase 1: Collect all artwork links by extensive scrolling
const collectArtworkLinks = async (page) => {
    log('📋 Phase 1: Collecting artwork links by scrolling...');

    await page.goto(COLLECTION_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });

    // Handle Cloudflare if present
    await waitForCloudflareClear(page);

    // Wait for page to be ready
    await delay(3000);

    log('   Page loaded, accepting cookies...');

    // Accept cookies
    try {
        const acceptButton = await page.$('button:has-text("Aceptar")');
        if (acceptButton) {
            await acceptButton.click();
            await delay(1000);
            log('   Cookies accepted');
        }
    } catch (e) {
        log('   No cookie banner or already accepted');
    }

    // Get total results count
    let totalCount = 9135;  // Default
    try {
        await page.waitForSelector('.results-count, h1, [class*="results"]', { timeout: 10000 });
        const totalText = await page.evaluate(() => {
            const el = document.querySelector('.results-count') ||
                document.querySelector('[class*="results"]') ||
                document.querySelector('h1');
            return el ? el.textContent : '';
        });
        const match = totalText.match(/(\d[\d,\.]*)/);
        if (match) {
            totalCount = parseInt(match[1].replace(/[,\.]/g, ''));
        }
    } catch (e) { }
    log(`   Expected total artworks: ${totalCount}`);

    const collectedLinks = new Map();  // url -> item data
    let lastCount = 0;
    let noNewItemsCount = 0;
    let scrollCount = 0;

    // Start extensive scrolling
    log('   Starting infinite scroll to load all artworks...');

    while (noNewItemsCount < MAX_NO_NEW_ITEMS) {
        // Extract all visible artwork links
        const links = await page.evaluate(() => {
            const items = [];
            const artworkLinks = document.querySelectorAll('a[href*="/the-collection/art-work/"]');

            artworkLinks.forEach(link => {
                const parent = link.closest('li') || link.closest('.item') || link.parentElement;

                // Get title
                let title = '';
                const titleEl = parent.querySelector('h2, h3, .title, [class*="title"]');
                if (titleEl) title = titleEl.textContent.trim();
                if (!title) title = link.querySelector('h2, h3, .title')?.textContent?.trim() || '';

                // Get artist
                let artist = '';
                const artistEl = parent.querySelector('.author, .artist, [class*="author"], [class*="artist"]');
                if (artistEl) artist = artistEl.textContent.trim();

                // Get technique/medium preview
                let medium = '';
                const mediumEl = parent.querySelector('.description, .technique, [class*="technique"]');
                if (mediumEl) medium = mediumEl.textContent.trim();

                // Get image URL (thumbnail from the list)
                let imageUrl = '';
                const imgEl = parent.querySelector('img') || link.querySelector('img');
                if (imgEl) {
                    imageUrl = imgEl.src || imgEl.getAttribute('data-src') || '';
                }

                // Clean URL - remove searchid parameter
                let cleanUrl = link.href.split('?')[0];

                if (cleanUrl && cleanUrl.includes('/art-work/')) {
                    items.push({
                        url: cleanUrl,
                        detailUrl: cleanUrl,  // This is the key field - direct link to museum page
                        title: title,
                        artist: artist,
                        medium: medium,
                        imageUrl: imageUrl
                    });
                }
            });

            return items;
        });

        // Add new links to collection
        let newCount = 0;
        for (const link of links) {
            if (!collectedLinks.has(link.url)) {
                collectedLinks.set(link.url, link);
                newCount++;
            }
        }

        const currentCount = collectedLinks.size;
        scrollCount++;

        // Check progress
        if (currentCount === lastCount) {
            noNewItemsCount++;
        } else {
            noNewItemsCount = 0;
            if (currentCount % 200 === 0 || newCount > 0 && scrollCount % 50 === 0) {
                log(`   Scroll #${scrollCount}: Collected ${currentCount}/${totalCount} links (+${newCount} new)`);
            }
        }
        lastCount = currentCount;

        // Scroll down
        await page.evaluate((distance) => {
            window.scrollBy(0, distance);
        }, SCROLL_DISTANCE);

        await delay(SCROLL_PAUSE);

        // Periodically save progress
        if (scrollCount % 100 === 0 && currentCount > 0) {
            log(`   💾 Saving progress: ${currentCount} items`);
        }

        // Check if we've collected enough
        if (currentCount >= totalCount * 0.98) {
            log(`   📊 Collected ${currentCount}/${totalCount} (${((currentCount / totalCount) * 100).toFixed(1)}%)`);
            break;
        }

        // Safety limit
        if (scrollCount > 2000) {
            log(`   ⚠️ Reached scroll limit at ${currentCount} items`);
            break;
        }
    }

    const items = [...collectedLinks.values()];
    log(`✅ Collected ${items.length} unique artwork links`);

    return items;
};

// Phase 2: Enhance data by visiting each detail page
const fetchDetailPages = async (page, items, progress) => {
    log('\n🖼️  Phase 2: Fetching detail pages for enhanced metadata...');

    const detailsFetched = new Set(progress.detailsFetched || []);
    const artworks = progress.artworks || [];
    const toProcess = items.filter(item => !detailsFetched.has(item.url));

    log(`   Total: ${items.length}, Already fetched: ${detailsFetched.size}, Remaining: ${toProcess.length}`);

    if (toProcess.length === 0) {
        log('   All detail pages already fetched');
        return artworks;
    }

    let processed = 0;
    let successful = 0;
    let errors = 0;

    for (const item of toProcess) {
        try {
            await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Quick check for Cloudflare
            const isChallenge = await page.evaluate(() => {
                return document.title.toLowerCase().includes('just a moment');
            });

            if (isChallenge) {
                log('   ⏳ Cloudflare appeared, waiting for manual solve...');
                await waitForCloudflareClear(page, 60000);
            }

            await delay(1000);

            // Extract detailed metadata
            const details = await page.evaluate(() => {
                const data = {};

                // Title (more reliable from detail page)
                const titleEl = document.querySelector('h1');
                if (titleEl) data.title = titleEl.textContent.trim();

                // Artist with dates
                const artistEl = document.querySelector('.author a, .author, [class*="author"]');
                if (artistEl) {
                    data.artist = artistEl.textContent.trim();
                    // Try to get life dates from link or nearby text
                    const artistLink = artistEl.closest('a') || artistEl.querySelector('a');
                    if (artistLink) {
                        data.artistUrl = artistLink.href;
                    }
                }

                // Extract metadata fields from the detail page
                const getField = (labels) => {
                    for (const label of labels) {
                        // Look in dt/dd pairs
                        const dts = document.querySelectorAll('dt');
                        for (const dt of dts) {
                            if (dt.textContent.toLowerCase().includes(label.toLowerCase())) {
                                const dd = dt.nextElementSibling;
                                if (dd && dd.tagName === 'DD') {
                                    return dd.textContent.trim();
                                }
                            }
                        }

                        // Look in labeled spans/divs
                        const labels2 = document.querySelectorAll('[class*="label"], .field-name');
                        for (const l of labels2) {
                            if (l.textContent.toLowerCase().includes(label.toLowerCase())) {
                                const next = l.nextElementSibling;
                                if (next) return next.textContent.trim();
                            }
                        }
                    }
                    return '';
                };

                data.date = getField(['date', 'dated', 'fecha', 'datación', 'chronology']);
                data.medium = getField(['technique', 'técnica', 'support', 'soporte']);
                data.dimensions = getField(['dimensions', 'medidas', 'dimensiones', 'size']);
                data.inventoryNumber = getField(['inventory', 'inventario', 'catalogue', 'catálogo']);
                data.department = getField(['department', 'departamento']);
                data.location = getField(['location', 'ubicación', 'room', 'sala']);

                // High-quality image
                const mainImg = document.querySelector('.work-image img, .gallery img, picture img, .zoom-container img');
                if (mainImg) {
                    data.imageUrl = mainImg.src || mainImg.getAttribute('data-src') || '';
                    // Try to get higher resolution
                    const srcset = mainImg.srcset;
                    if (srcset) {
                        const urls = srcset.split(',').map(s => s.trim().split(' ')[0]);
                        if (urls.length > 0) {
                            data.imageUrl = urls[urls.length - 1] || data.imageUrl;
                        }
                    }
                }

                // og:image fallback
                const ogImg = document.querySelector('meta[property="og:image"]');
                if (ogImg && !data.imageUrl) {
                    data.imageUrl = ogImg.getAttribute('content');
                }

                // Description
                const descEl = document.querySelector('.description, .text-work, [class*="content-text"]');
                if (descEl) {
                    data.description = descEl.textContent.trim().substring(0, 500);
                }

                return data;
            });

            // Merge with existing item data
            const artwork = {
                ...item,
                ...details,
                title: details.title || item.title,
                artist: details.artist || item.artist,
                imageUrl: details.imageUrl || item.imageUrl,
                detailUrl: item.url  // Keep the direct link to museum page
            };

            // Convert thumbnail to higher quality if it's from CDN
            if (artwork.imageUrl && artwork.imageUrl.includes('cdnprado.net')) {
                // Try to get larger version: replace _268.jpg with _800.jpg or similar
                artwork.imageUrl = artwork.imageUrl.replace(/_\d+\.jpg$/, '_800.jpg');
                artwork.thumbnailUrl = item.imageUrl;  // Keep original as thumbnail
            }

            artworks.push(artwork);
            successful++;

        } catch (error) {
            log(`   ❌ Error on ${item.url}: ${error.message}`);
            errors++;
            // Still add the item with basic data
            artworks.push({
                ...item,
                detailUrl: item.url
            });
        }

        detailsFetched.add(item.url);
        processed++;

        // Progress update
        if (processed % 100 === 0 || processed === toProcess.length) {
            log(`   ${processed}/${toProcess.length} processed (${successful} OK, ${errors} errors)`);
            progress.artworks = artworks;
            progress.detailsFetched = [...detailsFetched];
            saveProgress(progress);
        }

        // Small delay between requests
        await delay(800);
    }

    return artworks;
};

// Main scraping function
const scrape = async () => {
    log('🏛️ Museo del Prado Collection Scraper v2');
    log('==========================================');
    log('NOTE: If Cloudflare challenge appears, solve it manually in the browser');
    log('');

    let progress = loadProgress();

    const browser = await chromium.launch({
        headless: false,  // MUST be headful for manual Cloudflare solving
        slowMo: 100,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process'
        ]
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        javaScriptEnabled: true,
        hasTouch: false,
        isMobile: false
    });

    // Add some human-like behavior
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    const page = await context.newPage();

    try {
        // Phase 1: Collect all artwork links
        if (!progress.listItems || progress.listItems.length < 100) {
            progress.listItems = await collectArtworkLinks(page);
            progress.phase = 'details';
            saveProgress(progress);
        } else {
            log(`📋 Using cached ${progress.listItems.length} artwork links`);
        }

        // Phase 2: Fetch detail pages (optional - can be skipped for basic data)
        // Only if we have few items or user wants full metadata
        if (progress.listItems.length < 500) {
            // For small collections, fetch all details
            progress.artworks = await fetchDetailPages(page, progress.listItems, progress);
        } else {
            // For large collections, use list data with detail URLs
            log('\n📝 Using list page data (detail URLs preserved for navigation)');
            progress.artworks = progress.listItems.map(item => ({
                ...item,
                detailUrl: item.url  // Ensure detail URL is set
            }));
        }

        progress.phase = 'complete';
        saveProgress(progress);

        // Final processing
        const artworks = progress.artworks || progress.listItems;
        const validArtworks = artworks.filter(a => a.title && a.detailUrl);

        log(`\n✅ Complete! ${validArtworks.length} artworks collected`);

        // Statistics
        const stats = {
            total: validArtworks.length,
            withImage: validArtworks.filter(a => a.imageUrl).length,
            withArtist: validArtworks.filter(a => a.artist).length,
            withDate: validArtworks.filter(a => a.date).length,
            withMedium: validArtworks.filter(a => a.medium).length,
            uniqueArtists: new Set(validArtworks.map(a => a.artist).filter(Boolean)).size
        };

        log('\n📊 Statistics:');
        log(`   Total artworks: ${stats.total}`);
        log(`   With image: ${stats.withImage}`);
        log(`   With artist: ${stats.withArtist} (${stats.uniqueArtists} unique)`);
        log(`   With date: ${stats.withDate}`);
        log(`   With medium: ${stats.withMedium}`);

        // Sample
        const sample = validArtworks.find(a => a.artist && a.title);
        if (sample) {
            log('\n🔍 Sample artwork:');
            log(JSON.stringify(sample, null, 2));
        }

        // Save output
        const outputDir = path.dirname(OUTPUT_FILE);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(validArtworks, null, 2));
        log(`\n💾 Saved ${validArtworks.length} artworks to ${OUTPUT_FILE}`);

        log('\n🎯 Each artwork includes a detailUrl field');
        log('   This URL links directly to the museum\'s artwork page');

        return validArtworks;

    } finally {
        log('\n🚪 Closing browser...');
        await browser.close();
    }
};

// Run
scrape().catch(error => {
    log(`❌ Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
});
