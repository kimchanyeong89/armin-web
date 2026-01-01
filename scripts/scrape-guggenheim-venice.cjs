/**
 * Guggenheim Venice Scraper
 * 
 * Scrapes artworks from Peggy Guggenheim Collection (Venice)
 * Uses sitemap.xml to discover all artwork URLs
 * 
 * Collects: title, artist, year, medium, category, dimensions, image
 * 
 * Usage:
 *   node scripts/scrape-guggenheim-venice.cjs          # Full scrape
 *   node scripts/scrape-guggenheim-venice.cjs --test   # Test mode (30 items)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SITEMAP_URL = 'https://www.guggenheim-venice.it/sitemap.xml';
const OUTPUT_DIR = path.join(__dirname, '../public/data');
const DOWNLOADS_DIR = path.join(__dirname, '../downloads');
const PROGRESS_FILE = path.join(DOWNLOADS_DIR, 'guggenheim-venice-progress.json');
const OUTPUT_FILE = 'guggenheim-venice-collection.json';
const SAVE_INTERVAL = 50;

const delay = ms => new Promise(r => setTimeout(r, ms));
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const log = msg => console.log(`[${timestamp()}] [GUGGENHEIM] ${msg}`);

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
        scrapedSlugs: [],
        done: false
    };
}

function saveProgress(progress) {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

/**
 * Fetch artwork URLs from sitemap
 */
async function fetchArtworkUrls(page) {
    log('📄 Fetching sitemap for artwork URLs...');

    // Use page.evaluate to fetch and parse sitemap
    const urls = await page.evaluate(async (sitemapUrl) => {
        const response = await fetch(sitemapUrl);
        const text = await response.text();
        // Match artwork URLs - pattern: /en/art/works/[slug]/
        const matches = text.match(/https:\/\/www\.guggenheim-venice\.it\/en\/art\/works\/[^\/\s<>]+/g) || [];
        return [...new Set(matches)];
    }, SITEMAP_URL);

    log(`   Found ${urls.length} artwork URLs in sitemap`);
    return urls;
}

/**
 * Extract artwork details from detail page
 */
async function extractArtworkDetails(page, url) {
    const slug = url.split('/works/')[1]?.replace(/\/$/, '') || url;

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(1500);

        const details = await page.evaluate(() => {
            const result = {
                title: '',
                artist: '',
                year: '',
                medium: '',
                category: '',
                dimensions: '',
                image: '',
                description: ''
            };

            // Title - use .Artwork-title or h1
            const titleEl = document.querySelector('.Artwork-title, h1');
            if (titleEl) {
                result.title = titleEl.textContent.trim();
            }

            // Artist - use .Artwork-artist class
            const artistEl = document.querySelector('.Artwork-artist');
            if (artistEl) {
                result.artist = artistEl.textContent.trim();
            }

            // If no artist found with class, try artist link
            if (!result.artist) {
                const artistLink = document.querySelector('a[href*="/artists/"]');
                if (artistLink) {
                    result.artist = artistLink.textContent.trim();
                }
            }

            // Year/Date - use .Artwork-date class
            const dateEl = document.querySelector('.Artwork-date');
            if (dateEl) {
                result.year = dateEl.textContent.trim();
            }

            // Image - extract from picture source srcset (highest resolution)
            const pictureSource = document.querySelector('picture source');
            if (pictureSource && pictureSource.getAttribute('srcset')) {
                const srcset = pictureSource.getAttribute('srcset');
                // srcset format: "/path/image-300.jpg 300w, /path/image-600.jpg 600w, ..."
                const urls = srcset.split(',').map(s => s.trim().split(' ')[0]);
                // Get the last (largest) image
                const largestImage = urls[urls.length - 1];
                if (largestImage) {
                    result.image = largestImage.startsWith('http')
                        ? largestImage
                        : `https://www.guggenheim-venice.it${largestImage}`;
                }
            }

            // Fallback to picture img if no source
            if (!result.image) {
                const pictureImg = document.querySelector('picture img');
                if (pictureImg && pictureImg.src && !pictureImg.src.includes('data:image/svg')) {
                    result.image = pictureImg.src;
                }
            }

            // Category - Modern Art for Guggenheim
            result.category = 'Modern Art';

            return result;
        });

        return {
            id: slug,
            slug: slug,
            title: details.title,
            artist: details.artist,
            year: details.year,
            medium: details.medium,
            category: details.category || 'Modern Art',
            dimensions: details.dimensions,
            image: details.image,
            sourceUrl: url
        };

    } catch (e) {
        log(`  ⚠️ Failed to get details for ${slug}: ${e.message}`);
        return {
            id: slug,
            slug: slug,
            sourceUrl: url,
            error: e.message
        };
    }
}

async function main() {
    const args = process.argv.slice(2);
    const testMode = args.includes('--test');
    const maxTestItems = 30;

    log(`🏛️ Guggenheim Venice Scraper`);
    log(`   Mode: ${testMode ? `TEST (first ${maxTestItems} items)` : 'FULL'}`);
    log(`   Venice, Italy - Peggy Guggenheim Collection`);

    const progress = loadProgress();

    if (progress.done && !testMode) {
        log('✅ Already completed. Delete progress file to restart.');
        return;
    }

    log(`   Resuming with ${progress.artworks.length} items already scraped`);

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox']
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    try {
        // First navigate to the site to establish session
        await page.goto('https://www.guggenheim-venice.it/en/art/works/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await delay(2000);

        // Handle cookie consent if present
        try {
            const cookieBtn = await page.$('button:has-text("Allow all"), button:has-text("Accept"), .cookie-accept');
            if (cookieBtn) {
                await cookieBtn.click();
                await delay(500);
            }
        } catch (e) { }

        // Fetch all artwork URLs from sitemap
        const allUrls = await fetchArtworkUrls(page);

        // Filter out already scraped
        const newUrls = allUrls.filter(url => {
            const slug = url.split('/works/')[1]?.replace(/\/$/, '') || url;
            return !progress.scrapedSlugs.includes(slug);
        });

        const urlsToScrape = testMode ? newUrls.slice(0, maxTestItems) : newUrls;
        log(`\n📊 Total new artworks to scrape: ${urlsToScrape.length}`);

        // Scrape each artwork
        let scraped = 0;
        for (const url of urlsToScrape) {
            const slug = url.split('/works/')[1]?.replace(/\/$/, '') || url;

            if (progress.scrapedSlugs.includes(slug)) {
                continue;
            }

            scraped++;
            log(`🎨 [${scraped}/${urlsToScrape.length}] Scraping: ${slug}`);

            const artwork = await extractArtworkDetails(page, url);

            // Skip if no image
            if (!artwork.image || artwork.image === '') {
                log(`   ⚠️ Skipping ${slug} - no image`);
                progress.scrapedSlugs.push(slug);
                continue;
            }

            // Warn if missing required fields
            if (!artwork.title) log(`   ⚠️ Missing title for ${slug}`);
            if (!artwork.artist) log(`   ⚠️ Missing artist for ${slug}`);
            if (!artwork.year) log(`   ⚠️ Missing year for ${slug}`);

            progress.artworks.push(artwork);
            progress.scrapedSlugs.push(slug);

            // Save progress periodically
            if (progress.artworks.length % SAVE_INTERVAL === 0) {
                saveProgress(progress);
                log(`   💾 Checkpoint saved: ${progress.artworks.length} items`);
            }

            await delay(500 + Math.random() * 500);
        }

        progress.done = !testMode;

    } finally {
        await browser.close();
    }

    // Final save
    saveProgress(progress);

    // Create output file
    const outputData = {
        museum: "Peggy Guggenheim Collection",
        museumId: "guggenheim-venice",
        location: "Venice, Italy",
        type: "permanent",
        scrapedAt: new Date().toISOString(),
        totalArtworks: progress.artworks.length,
        artworksWithImage: progress.artworks.filter(a => a.image).length,
        artworksWithTitle: progress.artworks.filter(a => a.title).length,
        artworksWithArtist: progress.artworks.filter(a => a.artist).length,
        artworksWithYear: progress.artworks.filter(a => a.year).length,
        objects: progress.artworks
    };

    fs.writeFileSync(path.join(OUTPUT_DIR, OUTPUT_FILE), JSON.stringify(outputData, null, 2));
    log(`\n✅ Done! ${progress.artworks.length} items saved to ${OUTPUT_FILE}`);

    // Summary
    log(`\n📊 Summary:`);
    log(`   Total artworks: ${progress.artworks.length}`);
    log(`   With images: ${outputData.artworksWithImage}`);
    log(`   With titles: ${outputData.artworksWithTitle}`);
    log(`   With artists: ${outputData.artworksWithArtist}`);
    log(`   With years: ${outputData.artworksWithYear}`);
}

main().catch(console.error);
