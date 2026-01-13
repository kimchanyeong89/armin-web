/**
 * Museo del Prado Collection Scraper v3 - Paginated Version
 * 
 * Uses ?page= parameter to navigate through collection
 * - 36 items per page
 * - ~9,135 total items → ~254 pages
 * - Collects: title, artist, date, medium, image URL, detail page URL
 * 
 * Each artwork's detailUrl links directly to the museum's page
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'https://www.museodelprado.es';
const COLLECTION_URL = `${BASE_URL}/en/the-collection/art-works`;
const OUTPUT_FILE = path.join(__dirname, '../public/data/museo-del-prado-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/prado-progress-v3.json');
const LOG_FILE = path.join(__dirname, '../downloads/prado-scrape-v3.log');

const ITEMS_PER_PAGE = 36;
const PAGE_DELAY = 2000;      // Delay between page loads
const MAX_RETRIES = 3;

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
    return { lastPage: 0, artworks: [], totalPages: null };
};

const saveProgress = (progress) => {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
};

// Wait for Cloudflare to clear
const waitForCloudflareClear = async (page, maxWaitMs = 60000) => {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
        const isChallenge = await page.evaluate(() => {
            return document.title.toLowerCase().includes('just a moment') ||
                document.body.innerText.toLowerCase().includes('verify you are human');
        });

        if (!isChallenge) {
            return true;
        }

        log('   ⏳ Waiting for Cloudflare verification...');
        await delay(5000);
    }

    return false;
};

// Extract artworks from a page
const extractArtworks = async (page, pageNum) => {
    const artworks = await page.evaluate((pageNumber) => {
        const items = [];

        // Find all artwork links
        const artworkLinks = document.querySelectorAll('a[href*="/the-collection/art-work/"]');
        const seenUrls = new Set();

        artworkLinks.forEach(link => {
            // Clean URL - remove searchid and other query params
            let url = link.href.split('?')[0];

            if (seenUrls.has(url)) return;
            seenUrls.add(url);

            // Find parent container
            const parent = link.closest('figure') || link.closest('li') || link.closest('.item') || link.parentElement;

            // Extract metadata
            let title = '';
            const titleEl = parent?.querySelector('p.titulo a, h2, h3, .title') || link.querySelector('h2, h3');
            if (titleEl) title = titleEl.textContent.trim();
            if (!title && link.textContent.length > 0 && link.textContent.length < 200) {
                title = link.textContent.trim();
            }

            // Artist
            let artist = '';
            const artistEl = parent?.querySelector('.autor a, .author, [class*="autor"]');
            if (artistEl) artist = artistEl.textContent.trim();

            // Medium/technique
            let medium = '';
            const mediumEl = parent?.querySelector('.soporte, .technique');
            if (mediumEl) medium = mediumEl.textContent.trim();

            // Image
            let imageUrl = '';
            let thumbnailUrl = '';
            const imgEl = parent?.querySelector('img') || link.querySelector('img');
            if (imgEl) {
                thumbnailUrl = imgEl.src || imgEl.getAttribute('data-src') || '';
                // Try to get higher resolution
                imageUrl = thumbnailUrl.replace(/_\d+\.jpg$/, '_800.jpg');
            }

            if (url.includes('/art-work/') && (title || imageUrl)) {
                items.push({
                    title: title,
                    artist: artist,
                    medium: medium,
                    imageUrl: imageUrl,
                    thumbnailUrl: thumbnailUrl,
                    detailUrl: url,  // This is the key field for direct navigation
                    source: 'Museo del Prado',
                    page: pageNumber
                });
            }
        });

        return items;
    }, pageNum);

    return artworks;
};

// Fetch a single page
const fetchPage = async (page, pageNum, retries = MAX_RETRIES) => {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const url = pageNum === 1 ? COLLECTION_URL : `${COLLECTION_URL}?page=${pageNum}`;
            log(`   Fetching page ${pageNum}...`);

            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await delay(1000);

            // Check for Cloudflare
            const cleared = await waitForCloudflareClear(page, 30000);
            if (!cleared) {
                log(`   ⚠️ Cloudflare challenge on page ${pageNum}, attempt ${attempt + 1}`);
                await delay(5000);
                continue;
            }

            // Wait for content to load
            try {
                await page.waitForSelector('a[href*="/the-collection/art-work/"]', { timeout: 15000 });
            } catch (e) {
                log(`   ⚠️ No artworks found on page ${pageNum}, might be end of collection`);
                return [];
            }

            // Extract artworks
            const artworks = await extractArtworks(page, pageNum);
            log(`   ✓ Page ${pageNum}: ${artworks.length} artworks`);

            return artworks;

        } catch (error) {
            if (attempt < retries - 1) {
                log(`   ⚠️ Error on page ${pageNum}, retry ${attempt + 1}: ${error.message}`);
                await delay(5000);
            } else {
                log(`   ❌ Failed page ${pageNum}: ${error.message}`);
                return [];
            }
        }
    }
    return [];
};

// Main scraper
const scrape = async () => {
    log('🏛️ Museo del Prado Collection Scraper v3 (Paginated)');
    log('=====================================================');

    let progress = loadProgress();

    const browser = await chromium.launch({
        headless: false,
        slowMo: 50,
        args: ['--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US'
    });

    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    const page = await context.newPage();

    try {
        // Get total count from first page
        log('\n📊 Getting total count...');
        await page.goto(COLLECTION_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await waitForCloudflareClear(page);
        await delay(2000);

        // Accept cookies
        try {
            const acceptBtn = await page.$('button:has-text("Aceptar")');
            if (acceptBtn) {
                await acceptBtn.click();
                await delay(1000);
                log('   Cookies accepted');
            }
        } catch (e) { }

        // Get total
        let totalCount = 9135;
        try {
            await page.waitForSelector('[class*="results"], h1', { timeout: 10000 });
            const text = await page.evaluate(() => {
                const el = document.querySelector('[class*="results"]') || document.querySelector('h1');
                return el ? el.textContent : '';
            });
            const match = text.match(/(\d[\d,\.]*)/);
            if (match) {
                totalCount = parseInt(match[1].replace(/[,\.]/g, ''));
            }
        } catch (e) { }

        const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
        log(`   Total: ${totalCount} artworks across ${totalPages} pages`);
        progress.totalPages = totalPages;

        // Resume from last page
        const startPage = progress.lastPage + 1;
        const artworks = progress.artworks || [];

        log(`\n🖼️  Starting from page ${startPage}...`);
        log(`   Already collected: ${artworks.length} artworks\n`);

        // Fetch all pages
        for (let pageNum = startPage; pageNum <= totalPages; pageNum++) {
            const pageArtworks = await fetchPage(page, pageNum);

            // Add new artworks (dedup by URL)
            const existingUrls = new Set(artworks.map(a => a.detailUrl));
            for (const artwork of pageArtworks) {
                if (!existingUrls.has(artwork.detailUrl)) {
                    artworks.push(artwork);
                    existingUrls.add(artwork.detailUrl);
                }
            }

            progress.lastPage = pageNum;
            progress.artworks = artworks;

            // Save progress every 10 pages
            if (pageNum % 10 === 0) {
                saveProgress(progress);
                log(`   💾 Progress saved: ${artworks.length} artworks (page ${pageNum}/${totalPages})`);
            }

            // Empty page might mean end of collection
            if (pageArtworks.length === 0 && pageNum > 10) {
                log(`   ⚠️ Empty page ${pageNum}, checking next few pages...`);
                let emptyCount = 1;
                for (let checkPage = pageNum + 1; checkPage <= pageNum + 3 && checkPage <= totalPages; checkPage++) {
                    const checkArtworks = await fetchPage(page, checkPage);
                    if (checkArtworks.length === 0) emptyCount++;
                    else break;
                }
                if (emptyCount >= 3) {
                    log('   📊 Multiple empty pages, likely at end of collection');
                    break;
                }
            }

            await delay(PAGE_DELAY);
        }

        // Final save
        progress.artworks = artworks;
        saveProgress(progress);

        // Remove duplicates and filter valid
        const uniqueUrls = new Set();
        const validArtworks = artworks.filter(a => {
            if (!a.detailUrl || uniqueUrls.has(a.detailUrl)) return false;
            uniqueUrls.add(a.detailUrl);
            return a.title || a.imageUrl;
        });

        log(`\n✅ Complete! ${validArtworks.length} unique artworks`);

        // Statistics
        const stats = {
            total: validArtworks.length,
            withImage: validArtworks.filter(a => a.imageUrl).length,
            withTitle: validArtworks.filter(a => a.title).length,
            withArtist: validArtworks.filter(a => a.artist).length,
            withMedium: validArtworks.filter(a => a.medium).length,
            uniqueArtists: new Set(validArtworks.map(a => a.artist).filter(Boolean)).size
        };

        log('\n📊 Statistics:');
        log(`   Total artworks: ${stats.total}`);
        log(`   With image: ${stats.withImage}`);
        log(`   With title: ${stats.withTitle}`);
        log(`   With artist: ${stats.withArtist} (${stats.uniqueArtists} unique)`);
        log(`   With medium: ${stats.withMedium}`);

        // Sample
        const sample = validArtworks.find(a => a.title && a.artist);
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

        log('\n🎯 Each artwork includes:');
        log('   - detailUrl: Direct link to the museum\'s artwork page');
        log('   - imageUrl: High-resolution image from CDN');
        log('   - title, artist, medium: Available metadata');

        return validArtworks;

    } finally {
        await browser.close();
        log('\n🚪 Browser closed');
    }
};

// Run
scrape().catch(error => {
    log(`❌ Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
});
