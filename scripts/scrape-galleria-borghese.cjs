/**
 * Galleria Borghese Scraper
 * 
 * Scrapes paintings from Galleria Borghese (Rome)
 * Permanent exhibition collection
 * 
 * Collects: title, artist, year, medium, category, dimensions, image
 * 
 * Usage:
 *   node scripts/scrape-galleria-borghese.cjs          # Full scrape
 *   node scripts/scrape-galleria-borghese.cjs --test   # Test mode (3 pages)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.collezionegalleriaborghese.it/en/collezione/pittura';
const OUTPUT_DIR = path.join(__dirname, '../public/data');
const DOWNLOADS_DIR = path.join(__dirname, '../downloads');
const PROGRESS_FILE = path.join(DOWNLOADS_DIR, 'borghese-progress.json');
const OUTPUT_FILE = 'galleria-borghese-collection.json';
const SAVE_INTERVAL = 50;

const delay = ms => new Promise(r => setTimeout(r, ms));
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const log = msg => console.log(`[${timestamp()}] [BORGHESE] ${msg}`);

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
        currentPage: 1,
        totalPages: 0,
        done: false
    };
}

function saveProgress(progress) {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

/**
 * Format artist name: "Lastname Firstname" -> "Firstname Lastname"
 * Remove commas and periods between name parts
 */
function formatArtistName(rawName) {
    if (!rawName) return '';

    // Clean up the name
    let name = rawName.trim();

    // Remove periods and commas
    name = name.replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();

    // If name contains space, swap first/last
    const parts = name.split(' ');
    if (parts.length >= 2) {
        // Check if first word is likely a surname (common pattern in Italian museums)
        // Surnames often come first, so we swap
        // e.g., "Albani Francesco" -> "Francesco Albani"
        // But "Giovanni Battista Tiepolo" should stay as is

        // Simple heuristic: if first word is capitalized and not a common first name
        // Just swap the last word to the front if there are only 2 parts
        if (parts.length === 2) {
            return `${parts[1]} ${parts[0]}`;
        }
    }

    return name;
}

/**
 * Extract artwork links from a collection page
 */
async function extractArtworkLinks(page) {
    return await page.evaluate(() => {
        const links = [];
        const seenHrefs = new Set();

        // Find all artwork links
        document.querySelectorAll('a[href*="/en/opere/"]').forEach(link => {
            const href = link.getAttribute('href');
            if (!href || seenHrefs.has(href)) return;

            seenHrefs.add(href);

            const slugMatch = href.match(/\/en\/opere\/([^/?#]+)/);
            if (!slugMatch) return;

            const slug = slugMatch[1];

            // Get thumbnail image if available
            const img = link.querySelector('img');
            let thumbnailUrl = '';
            if (img && img.src) {
                thumbnailUrl = img.src;
            }

            links.push({
                slug,
                sourceUrl: href.startsWith('http') ? href : 'https://www.collezionegalleriaborghese.it' + href,
                thumbnail: thumbnailUrl
            });
        });

        return links;
    });
}

/**
 * Extract artwork details from detail page
 */
async function extractArtworkDetails(page, item) {
    try {
        await page.goto(item.sourceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(1500);

        // Scroll down to load all content
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
        await delay(500);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await delay(500);

        const details = await page.evaluate(() => {
            const result = {
                title: '',
                artist: '',
                year: '',
                medium: '',
                category: '',
                dimensions: '',
                image: ''
            };

            // Title - look for h1 heading
            const titleEl = document.querySelector('h1');
            if (titleEl) {
                result.title = titleEl.textContent.trim();
            }

            // Artist - look for h2 with link to /autore/ or /en/autore/
            // Structure: <h2><a href="/en/autore/..."><span>Attributed to</span> Artist Name</a></h2>
            const artistLink = document.querySelector('a[href*="/autore/"], a[href*="/en/autore/"]');
            if (artistLink) {
                // Get the text content but remove prefix spans like "Attributed to", "Workshop of", etc
                let artistText = artistLink.textContent.trim();

                // Remove common prefixes
                const prefixes = [
                    'Attributed to',
                    'Workshop of',
                    'Circle of',
                    'School of',
                    'Follower of',
                    'After',
                    'Style of',
                    'Manner of',
                    'Attribuito a',
                    'Bottega di',
                    'Cerchia di',
                    'Scuola di'
                ];

                for (const prefix of prefixes) {
                    if (artistText.toLowerCase().startsWith(prefix.toLowerCase())) {
                        artistText = artistText.substring(prefix.length).trim();
                    }
                }

                result.artist = artistText;
            }

            // Find the metadata section - look for rows with labels like "Date", "Medium", etc.
            // Structure: <div class="row">
            //   <div class="col-... mb-2"><b>Date</b></div>
            //   <div class="col-... mb-2"><div class="vline">value</div></div>
            // </div>

            // Alternative: look for labels by text content
            const getAllTextForLabel = (labelText) => {
                // Find all bold elements or spans that might be labels
                const labelsToFind = labelText instanceof Array ? labelText : [labelText];

                for (const label of labelsToFind) {
                    // Try finding by bold text
                    const boldElements = document.querySelectorAll('b, strong');
                    for (const bold of boldElements) {
                        if (bold.textContent.trim().toLowerCase() === label.toLowerCase()) {
                            // Get the next sibling's text or parent's next sibling
                            const parent = bold.parentElement;
                            const nextSibling = parent.nextElementSibling;
                            if (nextSibling) {
                                const vline = nextSibling.querySelector('.vline');
                                if (vline) {
                                    return vline.textContent.trim();
                                }
                                return nextSibling.textContent.trim();
                            }
                        }
                    }
                }
                return '';
            };

            // Date/Year
            result.year = getAllTextForLabel(['Date', 'Data', 'Dating', 'Datazione']);

            // Medium/Technique
            result.medium = getAllTextForLabel(['Medium', 'Technique', 'Tecnica', 'Material', 'Materiale']);

            // Category/Classification
            const categoryText = getAllTextForLabel(['Classification', 'Category', 'Type', 'Tipologia', 'Classificazione']);
            if (categoryText) {
                result.category = categoryText;
            }

            // Dimensions
            result.dimensions = getAllTextForLabel(['Dimensions', 'Size', 'Dimensioni', 'Misure']);

            // Image - look for main artwork image
            // The images are typically in /uploads/server/files/
            const imageSelectors = [
                'img[src*="/uploads/server/files/"]',  // Borghese specific
                'img[src*="/uploads/"]',
                'img[src*="/files/"]',
                'img.opera-image',
                'img.artwork-image',
                '.gallery img',
                'article img',
                'main img'
            ];

            for (const selector of imageSelectors) {
                const img = document.querySelector(selector);
                if (img && img.src) {
                    // Skip small images, logos, icons
                    if (img.naturalWidth > 200 || !img.naturalWidth) {
                        if (!img.src.includes('logo') && !img.src.includes('icon') && !img.src.includes('avatar')) {
                            result.image = img.src;
                            break;
                        }
                    }
                }
            }

            // If no image found, try all images
            if (!result.image) {
                const allImages = document.querySelectorAll('img');
                for (const img of allImages) {
                    if (img.src && (img.naturalWidth > 300 || !img.naturalWidth)) {
                        if (!img.src.includes('logo') && !img.src.includes('icon') && !img.src.includes('avatar')) {
                            result.image = img.src;
                            break;
                        }
                    }
                }
            }

            return result;
        });

        return {
            id: item.slug,
            slug: item.slug,
            title: details.title,
            artist: formatArtistName(details.artist),
            year: details.year,
            medium: details.medium,
            category: details.category || 'Painting',
            dimensions: details.dimensions,
            image: details.image || item.thumbnail,
            sourceUrl: item.sourceUrl
        };

    } catch (e) {
        log(`  ⚠️ Failed to get details for ${item.slug}: ${e.message}`);
        return {
            id: item.slug,
            slug: item.slug,
            image: item.thumbnail,
            sourceUrl: item.sourceUrl,
            error: e.message
        };
    }
}

/**
 * Get total number of pages
 */
async function getTotalPages(page) {
    return await page.evaluate(() => {
        // Look for pagination links or dropdown
        const pagLinks = document.querySelectorAll('a[href*="?pag="]');
        let maxPage = 1;

        pagLinks.forEach(link => {
            const href = link.getAttribute('href');
            const match = href.match(/pag=(\d+)/);
            if (match) {
                const pageNum = parseInt(match[1]);
                if (pageNum > maxPage) maxPage = pageNum;
            }
        });

        // Also check for pagination select dropdown
        const select = document.querySelector('#pag, select[name="pag"]');
        if (select) {
            const options = select.querySelectorAll('option');
            options.forEach(opt => {
                const val = parseInt(opt.value);
                if (!isNaN(val) && val > maxPage) maxPage = val;
            });
        }

        return maxPage;
    });
}

async function main() {
    const args = process.argv.slice(2);
    const testMode = args.includes('--test');
    const maxTestPages = 3;

    log(`🏛️ Galleria Borghese Scraper`);
    log(`   Mode: ${testMode ? `TEST (first ${maxTestPages} pages)` : 'FULL'}`);
    log(`   Rome, Italy - Paintings Collection`);

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

    const listPage = await context.newPage();
    const detailPage = await context.newPage();

    try {
        // First, get total pages
        log(`📄 Loading collection page...`);
        await listPage.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await delay(2000);

        // Handle cookie consent if present
        try {
            const cookieBtn = await listPage.$('button:has-text("Accept"), button:has-text("Accetta"), .cookie-accept');
            if (cookieBtn) {
                await cookieBtn.click();
                await delay(500);
            }
        } catch (e) { }

        const totalPages = await getTotalPages(listPage);
        progress.totalPages = totalPages;
        log(`   Found ${totalPages} pages of artworks`);

        const pagesToScrape = testMode ? Math.min(maxTestPages, totalPages) : totalPages;

        // Collect all artwork links first
        const allLinks = [];

        for (let pageNum = 1; pageNum <= pagesToScrape; pageNum++) {
            log(`📖 Scraping page ${pageNum}/${pagesToScrape}...`);

            const pageUrl = pageNum === 1 ? BASE_URL : `${BASE_URL}?pag=${pageNum}`;
            await listPage.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await delay(1500);

            // Scroll to load lazy images
            await listPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
            await delay(300);
            await listPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await delay(500);

            const pageLinks = await extractArtworkLinks(listPage);
            log(`   Found ${pageLinks.length} artworks on page ${pageNum}`);

            // Filter out already scraped
            const newLinks = pageLinks.filter(link => !progress.scrapedSlugs.includes(link.slug));
            allLinks.push(...newLinks);
        }

        log(`\n📊 Total new artworks to scrape: ${allLinks.length}`);

        // Now scrape each artwork detail
        let scraped = 0;
        for (const link of allLinks) {
            if (progress.scrapedSlugs.includes(link.slug)) {
                continue;
            }

            scraped++;
            log(`🎨 [${scraped}/${allLinks.length}] Scraping: ${link.slug}`);

            const artwork = await extractArtworkDetails(detailPage, link);

            // Skip if no image
            if (!artwork.image || artwork.image === '') {
                log(`   ⚠️ Skipping ${link.slug} - no image`);
                progress.scrapedSlugs.push(link.slug);
                continue;
            }

            // Warn if missing required fields but still save
            if (!artwork.title) log(`   ⚠️ Missing title for ${link.slug}`);
            if (!artwork.artist) log(`   ⚠️ Missing artist for ${link.slug}`);
            if (!artwork.year) log(`   ⚠️ Missing year for ${link.slug}`);

            progress.artworks.push(artwork);
            progress.scrapedSlugs.push(link.slug);

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
        museum: "Galleria Borghese",
        museumId: "galleria-borghese",
        location: "Rome, Italy",
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

    // Check for issues
    const issues = progress.artworks.filter(a => !a.title || !a.artist || !a.year);
    if (issues.length > 0) {
        log(`\n⚠️ ${issues.length} items with missing required fields`);
    }
}

main().catch(console.error);
