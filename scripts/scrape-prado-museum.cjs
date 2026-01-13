/**
 * Museo del Prado Collection Scraper (Playwright)
 * 
 * Scrapes all artworks from the Museo del Prado collection
 * - Total: ~9,135 artworks
 * - Uses Playwright for Cloudflare bypass
 * - Collects: title, artist, date, medium, dimensions, image URL, detail page URL
 * 
 * Output: Each artwork includes its detail page URL for direct navigation
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'https://www.museodelprado.es';
const COLLECTION_URL = `${BASE_URL}/en/the-collection/art-works`;
const OUTPUT_FILE = path.join(__dirname, '../public/data/museo-del-prado-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/prado-progress.json');
const LOG_FILE = path.join(__dirname, '../downloads/prado-scrape.log');

const SCROLL_DELAY = 1500;  // Delay between scrolls
const PAGE_DELAY = 2000;    // Delay between detail page fetches
const MAX_CONCURRENT = 3;   // Max concurrent detail page fetches
const ITEMS_PER_LOG = 100;  // Log progress every N items

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
    return { phase: 'list', listItems: [], artworks: [], processedUrls: [] };
};

const saveProgress = (progress) => {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
};

// Phase 1: Collect all artwork links from the list page by scrolling
const collectArtworkLinks = async (page) => {
    log('📋 Phase 1: Collecting artwork links by scrolling...');

    await page.goto(COLLECTION_URL, { waitUntil: 'networkidle', timeout: 60000 });
    log('   Page loaded, accepting cookies...');

    // Accept cookies if needed
    try {
        const acceptButton = await page.$('button:has-text("Aceptar todas las cookies")');
        if (acceptButton) {
            await acceptButton.click();
            await delay(1000);
            log('   Cookies accepted');
        }
    } catch (e) { }

    // Get total results
    const totalText = await page.textContent('.results-count, h1, [class*="results"]').catch(() => '');
    const totalMatch = totalText.match(/(\d[\d,\.]*)\s*results?/i);
    const totalCount = totalMatch ? parseInt(totalMatch[1].replace(/[,\.]/g, '')) : 9135;
    log(`   Total artworks: ${totalCount}`);

    const collectedLinks = new Set();
    let lastCount = 0;
    let noNewItemsCount = 0;

    // Scroll to load all items
    while (noNewItemsCount < 10) {
        // Get all artwork links
        const links = await page.$$eval(
            'a[href*="/the-collection/art-work/"]',
            (els) => els.map(el => ({
                url: el.href,
                title: el.querySelector('h2, h3, .title')?.textContent?.trim() || '',
                artist: el.querySelector('.author, .artist, [class*="author"]')?.textContent?.trim() || '',
                imageUrl: el.querySelector('img')?.src || ''
            }))
        );

        links.forEach(link => {
            if (link.url && link.url.includes('/art-work/') && !collectedLinks.has(link.url)) {
                collectedLinks.add(JSON.stringify(link));
            }
        });

        const currentCount = collectedLinks.size;
        if (currentCount === lastCount) {
            noNewItemsCount++;
        } else {
            noNewItemsCount = 0;
            if (currentCount % 100 < 10 || currentCount % 500 === 0) {
                log(`   Collected ${currentCount}/${totalCount} links...`);
            }
        }
        lastCount = currentCount;

        // Scroll down
        await page.evaluate(() => {
            window.scrollBy(0, window.innerHeight * 2);
        });
        await delay(SCROLL_DELAY);

        // Check if we've hit the bottom or collected enough
        const atBottom = await page.evaluate(() => {
            return (window.innerHeight + window.scrollY) >= document.body.scrollHeight - 100;
        });

        if (atBottom && currentCount >= totalCount * 0.95) {
            log(`   Reached near bottom with ${currentCount} items`);
            break;
        }
    }

    const items = [...collectedLinks].map(s => JSON.parse(s));
    log(`✅ Collected ${items.length} unique artwork links`);
    return items;
};

// Phase 2: Fetch detail page for each artwork
const fetchArtworkDetails = async (page, itemUrl, retries = 3) => {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            await page.goto(itemUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await delay(1000);

            // Check for Cloudflare challenge
            const isChallenge = await page.evaluate(() => {
                return document.title.includes('Just a moment') ||
                    document.body.innerText.includes('Verify you are human');
            });

            if (isChallenge) {
                log(`   ⚠️ Cloudflare challenge on ${itemUrl}, waiting...`);
                await delay(5000);
                continue;
            }

            // Extract all metadata from the detail page
            const artwork = await page.evaluate(() => {
                const data = {
                    title: '',
                    artist: '',
                    date: '',
                    medium: '',
                    dimensions: '',
                    inventoryNumber: '',
                    department: '',
                    location: '',
                    description: '',
                    imageUrl: '',
                    detailUrl: window.location.href
                };

                // Title
                const titleEl = document.querySelector('h1, .title-work, [class*="title"]');
                if (titleEl) data.title = titleEl.textContent.trim();

                // Artist
                const artistEl = document.querySelector('.author a, .artist, [class*="author"]');
                if (artistEl) data.artist = artistEl.textContent.trim();

                // Metadata from definition list or labeled fields
                const getFieldValue = (labels) => {
                    for (const label of labels) {
                        // Try definition list
                        const dt = Array.from(document.querySelectorAll('dt')).find(el =>
                            el.textContent.toLowerCase().includes(label.toLowerCase())
                        );
                        if (dt) {
                            const dd = dt.nextElementSibling;
                            if (dd && dd.tagName === 'DD') {
                                return dd.textContent.trim();
                            }
                        }

                        // Try label-value pairs
                        const labelEl = Array.from(document.querySelectorAll('[class*="label"], th, .field-label')).find(el =>
                            el.textContent.toLowerCase().includes(label.toLowerCase())
                        );
                        if (labelEl) {
                            const valueEl = labelEl.nextElementSibling || labelEl.parentElement.querySelector('[class*="value"], td');
                            if (valueEl) return valueEl.textContent.trim();
                        }
                    }
                    return '';
                };

                data.date = getFieldValue(['date', 'dated', 'chronology', 'fecha', 'datación']);
                data.medium = getFieldValue(['technique', 'medium', 'support', 'técnica', 'soporte']);
                data.dimensions = getFieldValue(['dimensions', 'size', 'medidas', 'dimensiones']);
                data.inventoryNumber = getFieldValue(['inventory', 'catalogue', 'número de catálogo', 'inventario']);
                data.department = getFieldValue(['department', 'departamento', 'collection']);
                data.location = getFieldValue(['location', 'room', 'ubicación', 'sala']);

                // Description
                const descEl = document.querySelector('.description, .text-work, [class*="description"]');
                if (descEl) data.description = descEl.textContent.trim().substring(0, 1000);

                // Main image - try multiple sources
                const mainImg = document.querySelector('.work-image img, .gallery-image img, .zoom-image img, picture img');
                if (mainImg) {
                    data.imageUrl = mainImg.src || mainImg.getAttribute('data-src') || '';
                }

                // Also check for higher quality image in data attributes or zoom
                const zoomData = document.querySelector('[data-zoom], [data-large], [data-full]');
                if (zoomData) {
                    data.imageUrl = zoomData.getAttribute('data-zoom') ||
                        zoomData.getAttribute('data-large') ||
                        zoomData.getAttribute('data-full') ||
                        data.imageUrl;
                }

                // og:image as fallback
                const ogImage = document.querySelector('meta[property="og:image"]');
                if (ogImage && !data.imageUrl) {
                    data.imageUrl = ogImage.getAttribute('content');
                }

                return data;
            });

            return artwork;

        } catch (error) {
            if (attempt < retries - 1) {
                log(`   ⚠️ Retry ${attempt + 1}/${retries} for ${itemUrl}`);
                await delay(3000);
            } else {
                log(`   ❌ Failed to fetch ${itemUrl}: ${error.message}`);
                return null;
            }
        }
    }
    return null;
};

// Main scraping function
const scrape = async () => {
    log('🏛️ Museo del Prado Collection Scraper');
    log('=====================================');

    let progress = loadProgress();

    const browser = await chromium.launch({
        headless: false,  // Use headful mode for Cloudflare bypass
        slowMo: 50
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US'
    });

    const page = await context.newPage();

    try {
        // Phase 1: Collect all artwork links
        if (!progress.listItems || progress.listItems.length === 0) {
            progress.listItems = await collectArtworkLinks(page);
            progress.phase = 'details';
            saveProgress(progress);
        } else {
            log(`📋 Using cached ${progress.listItems.length} artwork links`);
        }

        // Phase 2: Fetch details for each artwork
        const processedUrls = new Set(progress.processedUrls || []);
        const artworks = progress.artworks || [];
        const toProcess = progress.listItems.filter(item => !processedUrls.has(item.url));

        log(`\n🖼️  Phase 2: Fetching artwork details...`);
        log(`   Total: ${progress.listItems.length}, Already: ${processedUrls.size}, Remaining: ${toProcess.length}\n`);

        let processed = 0;
        let successful = 0;

        for (const item of toProcess) {
            // Merge list data with detail data
            const details = await fetchArtworkDetails(page, item.url);

            if (details) {
                const artwork = {
                    ...item,
                    ...details,
                    // Ensure these fields are populated
                    title: details.title || item.title,
                    artist: details.artist || item.artist,
                    imageUrl: details.imageUrl || item.imageUrl,
                    detailUrl: item.url
                };

                if (artwork.title && (artwork.imageUrl || artwork.detailUrl)) {
                    artworks.push(artwork);
                    successful++;
                }
            }

            processedUrls.add(item.url);
            processed++;

            if (processed % ITEMS_PER_LOG === 0 || processed === toProcess.length) {
                log(`   ${processed}/${toProcess.length} processed (${successful} successful)`);
                progress.artworks = artworks;
                progress.processedUrls = [...processedUrls];
                saveProgress(progress);
            }

            await delay(PAGE_DELAY);
        }

        // Final save
        progress.artworks = artworks;
        progress.processedUrls = [...processedUrls];
        progress.phase = 'complete';
        saveProgress(progress);

        // Filter and save final results
        const validArtworks = artworks.filter(a => a.title && (a.imageUrl || a.detailUrl));

        log(`\n✅ Complete! ${validArtworks.length} artworks`);

        // Statistics
        const stats = {
            total: validArtworks.length,
            withImage: validArtworks.filter(a => a.imageUrl).length,
            withArtist: validArtworks.filter(a => a.artist).length,
            withDate: validArtworks.filter(a => a.date).length,
            withMedium: validArtworks.filter(a => a.medium).length,
            withDimensions: validArtworks.filter(a => a.dimensions).length,
        };

        log('\n📊 Statistics:');
        log(`   Total artworks: ${stats.total}`);
        log(`   With image: ${stats.withImage}`);
        log(`   With artist: ${stats.withArtist}`);
        log(`   With date: ${stats.withDate}`);
        log(`   With medium: ${stats.withMedium}`);
        log(`   With dimensions: ${stats.withDimensions}`);

        // Sample artwork
        const sample = validArtworks.find(a => a.artist && a.date && a.medium);
        if (sample) {
            log('\n🔍 Sample artwork:');
            log(JSON.stringify(sample, null, 2));
        }

        // Ensure output directory exists
        const outputDir = path.dirname(OUTPUT_FILE);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(validArtworks, null, 2));
        log(`\n💾 Saved to ${OUTPUT_FILE}`);

        return validArtworks;

    } finally {
        await browser.close();
    }
};

// Run scraper
scrape().catch(error => {
    log(`❌ Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
});
