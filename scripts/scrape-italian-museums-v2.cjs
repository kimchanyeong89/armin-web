/**
 * Italian Museums Parallel Scraper v2
 * 
 * Improved version with correct HTML selectors for:
 * 1. Museo del Novecento - Alberto Della Ragione Collection
 * 2. Museo del Novecento - Ottone Rosai Collection
 * 3. Pinacoteca Ambrosiana (Milan) - using Playwright
 * 4. Google Arts & Culture - Museo del Novecento
 * 
 * Each collection is saved as a separate permanent exhibition.
 * Saves every 50 items as checkpoint.
 * 
 * Usage:
 *   node scripts/scrape-italian-museums-v2.cjs --test   # Test mode (3 pages/loads each)
 *   node scripts/scrape-italian-museums-v2.cjs          # Full scrape
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const DOWNLOADS_DIR = path.join(__dirname, '../downloads');
const SAVE_INTERVAL = 50;

const delay = ms => new Promise(r => setTimeout(r, ms));
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });

// Museum configurations
const MUSEUMS = {
    della_ragione: {
        id: 'novecento-della-ragione',
        name: 'Museo del Novecento - Alberto Della Ragione',
        location: 'Florence, Italy',
        url: 'https://www.museonovecento.it/en/collezione/alberto-della-ragione-en/',
        type: 'novecento',
        collection: 'Alberto Della Ragione',
        room: 'Alberto Della Ragione',
        outputFile: 'novecento-della-ragione-collection.json'
    },
    rosai: {
        id: 'novecento-rosai',
        name: 'Museo del Novecento - Ottone Rosai',
        location: 'Florence, Italy',
        url: 'https://www.museonovecento.it/en/collezione/ottone-rosai-en-the-collections/',
        type: 'novecento',
        collection: 'Ottone Rosai',
        room: 'Ottone Rosai',
        outputFile: 'novecento-rosai-collection.json'
    },
    ambrosiana: {
        id: 'ambrosiana-collection',
        name: 'Pinacoteca Ambrosiana',
        location: 'Milan, Italy',
        url: 'https://www.ambrosiana.it/en/pinacoteca-collections/#/category',
        type: 'js-catalog',
        outputFile: 'ambrosiana-collection.json'
    },
    gac_novecento: {
        id: 'museo-novecento-gac',
        name: 'Museo del Novecento (Google Arts & Culture)',
        location: 'Florence, Italy',
        url: 'https://artsandculture.google.com/partner/museo-del-novecento',
        type: 'gac',
        outputFile: 'museo-novecento-gac-collection.json'
    }
};

// Ensure directories exist
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

/**
 * Format artist name: remove commas/periods between name parts
 */
function formatArtistName(rawName) {
    if (!rawName) return '';
    let name = rawName.trim();

    // Remove life years in parentheses e.g. "Renato Birolli (1905-1959)"
    name = name.replace(/\s*\([^)]*\d{4}[^)]*\)\s*/g, '');

    // Remove commas and periods between name parts
    name = name.replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();

    return name;
}

/**
 * Save progress checkpoint
 */
function saveCheckpoint(museumId, data, artworks) {
    const checkpointFile = path.join(DOWNLOADS_DIR, `${museumId}-checkpoint.json`);
    fs.writeFileSync(checkpointFile, JSON.stringify({
        ...data,
        artworks,
        lastSaved: new Date().toISOString()
    }, null, 2));
}

/**
 * Scrape Museo Novecento collections (Della Ragione or Rosai) - IMPROVED
 */
async function scrapeNovecento(config, testMode = false) {
    const log = msg => console.log(`[${timestamp()}] [${config.id}] ${msg}`);
    log(`🎨 Starting scrape of ${config.name}...`);

    const artworks = [];
    const scrapedUrls = new Set();

    try {
        // Fetch main collection page
        log(`📄 Fetching collection page...`);
        const res = await fetch(config.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();

        // Extract artwork links
        const linkRegex = /href="(https:\/\/www\.museonovecento\.it\/en\/collezioni\/[^"]+)"/g;
        const links = [];
        let match;
        while ((match = linkRegex.exec(html)) !== null) {
            if (!links.includes(match[1]) && !scrapedUrls.has(match[1])) {
                links.push(match[1]);
            }
        }

        log(`   Found ${links.length} artwork links`);
        const limit = testMode ? Math.min(10, links.length) : links.length;

        for (let i = 0; i < limit; i++) {
            const url = links[i];
            if (scrapedUrls.has(url)) continue;

            try {
                log(`🖼️ [${i + 1}/${limit}] Fetching: ${url.split('/').pop()}`);
                const artRes = await fetch(url);
                if (!artRes.ok) continue;
                const artHtml = await artRes.text();

                const artwork = extractNovecentoDetails(artHtml, url, config);
                if (artwork.title || artwork.image) {
                    artworks.push(artwork);
                    scrapedUrls.add(url);
                    log(`   ✓ ${artwork.title} | ${artwork.artist} | ${artwork.year}`);
                }

                // Save checkpoint every SAVE_INTERVAL items
                if (artworks.length % SAVE_INTERVAL === 0) {
                    saveCheckpoint(config.id, config, artworks);
                    log(`   💾 Checkpoint saved: ${artworks.length} items`);
                }

                await delay(300 + Math.random() * 200);
            } catch (e) {
                log(`   ⚠️ Error: ${e.message}`);
            }
        }
    } catch (e) {
        log(`❌ Fatal error: ${e.message}`);
    }

    return artworks;
}

/**
 * Extract details from Museo Novecento artwork page - IMPROVED
 */
function extractNovecentoDetails(html, url, config) {
    const artwork = {
        sourceUrl: url,
        id: url.split('/').filter(Boolean).pop(),
        category: config.collection || 'Painting',
        room: config.room || ''
    };

    // Title - <h1 class="entry-header--title">
    const titleMatch = html.match(/<h1[^>]*class="[^"]*entry-header--title[^"]*"[^>]*>([^<]+)<\/h1>/i) ||
        html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    artwork.title = titleMatch ? titleMatch[1].trim() : '';

    // Artist - <p class="txt-h2 mb-0-imp"> in header-author-wrapper
    const artistMatch = html.match(/header-author-wrapper[^>]*>[\s\S]*?<p[^>]*class="[^"]*txt-h2[^"]*"[^>]*>([^<]+)<\/p>/i) ||
        html.match(/<div[^>]*header-author-wrapper[^>]*>[\s\S]*?<p[^>]*>([^<]+)<\/p>/i);
    artwork.artist = artistMatch ? formatArtistName(artistMatch[1]) : '';

    // Year - <p class="txt-h1 has-primary-gray-color mb-0-imp">1941</p>
    const yearMatch = html.match(/<p[^>]*class="[^"]*txt-h1[^"]*has-primary-gray-color[^"]*"[^>]*>([^<]+)<\/p>/i) ||
        html.match(/<p[^>]*has-primary-gray-color[^>]*>(\d{4}(?:\s*(?:–|-)\s*\d{4})?(?:\s*ca\.?)?)<\/p>/i);
    if (yearMatch) {
        // Extract just the year(s)
        let yearText = yearMatch[1].trim();
        // If contains invalid pattern, try to extract real year
        const realYear = yearText.match(/(\d{4}(?:\s*(?:–|-)\s*\d{4})?(?:\s*ca\.?)?)/);
        artwork.year = realYear ? realYear[1].trim() : yearText;
    } else {
        artwork.year = '';
    }

    // Medium/Technique - inside accordion-tecnica, look for <h4>
    const mediumMatch = html.match(/accordion-tecnica[\s\S]*?<h4>([^<]+)<\/h4>/i) ||
        html.match(/scheda-opera-row--tecnica[\s\S]*?<h4>([^<]+)<\/h4>/i);
    artwork.medium = mediumMatch ? mediumMatch[1].trim() : '';

    // Room/Location - Second Floor, etc
    const roomMatch = html.match(/luogo-link-text[^>]*>([^<]+)<\//i) ||
        html.match(/<h4[^>]*luogo[^>]*>([^<]+)<\/h4>/i);
    if (roomMatch) {
        artwork.room = roomMatch[1].trim();
    }

    // Dimensions - look for cm patterns
    const dimMatch = html.match(/(\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?(?:\s*[x×]\s*\d+(?:[.,]\d+)?)?(?:\s*cm)?)/i);
    artwork.dimensions = dimMatch ? dimMatch[1].trim() : '';

    // Image - og:image or featured image
    const imgMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) ||
        html.match(/data-src="(https:\/\/www\.museonovecento\.it\/wp-content\/uploads\/[^"]+)"/i) ||
        html.match(/<img[^>]+src="(https:\/\/www\.museonovecento\.it\/wp-content\/uploads\/[^"]+)"/i);
    artwork.image = imgMatch ? imgMatch[1].trim() : '';

    return artwork;
}

/**
 * Scrape Pinacoteca Ambrosiana using Playwright - IMPROVED
 */
async function scrapeAmbrosiana(config, browser, testMode = false) {
    const log = msg => console.log(`[${timestamp()}] [${config.id}] ${msg}`);
    log(`🎨 Starting scrape of ${config.name}...`);

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();
    const artworks = [];
    const scrapedIds = new Set();

    try {
        log(`📄 Loading catalog page...`);
        await page.goto(config.url, { waitUntil: 'networkidle', timeout: 60000 });
        await delay(5000);

        // Take screenshot for debug
        await page.screenshot({ path: path.join(DOWNLOADS_DIR, 'ambrosiana-debug.png') });
        log(`   Debug screenshot saved`);

        // Wait for Vue app to load
        await page.waitForSelector('[class*="item"], [class*="card"], article, .list-item', { timeout: 30000 }).catch(() => {
            log(`   ⚠️ No items found with initial selectors`);
        });

        // Try various selectors
        const pageContent = await page.content();
        fs.writeFileSync(path.join(DOWNLOADS_DIR, 'ambrosiana-page.html'), pageContent);
        log(`   Page HTML saved for analysis`);

        // Find artwork links
        const links = await page.evaluate(() => {
            const items = [];
            const seen = new Set();

            // Try multiple selectors
            const selectors = [
                'a[href*="/opere/"]',
                'a[href*="/en/work/"]',
                'a[href*="/work/"]',
                'a[href*="/artwork/"]',
                '[class*="item"] a',
                '[class*="card"] a',
                'article a'
            ];

            for (const sel of selectors) {
                document.querySelectorAll(sel).forEach(el => {
                    const href = el.getAttribute('href');
                    if (!href || seen.has(href)) return;
                    seen.add(href);

                    const fullUrl = href.startsWith('http') ? href : 'https://www.ambrosiana.it' + href;
                    const img = el.querySelector('img') || el.closest('article')?.querySelector('img');

                    items.push({
                        url: fullUrl,
                        thumbnail: img ? (img.src || img.dataset.src) : '',
                        title: el.textContent?.trim().substring(0, 100) || ''
                    });
                });
            }

            return items;
        });

        log(`   Found ${links.length} artwork links`);

        if (links.length === 0) {
            // Try to find any links on page
            const allLinks = await page.evaluate(() => {
                const links = [];
                document.querySelectorAll('a').forEach(a => {
                    const href = a.getAttribute('href');
                    if (href && !href.startsWith('#') && !href.includes('mailto')) {
                        links.push({ href, text: a.textContent?.trim().substring(0, 50) });
                    }
                });
                return links.slice(0, 30);
            });
            log(`   Sample links on page:`);
            allLinks.slice(0, 10).forEach(l => log(`     ${l.href} - ${l.text}`));
        }

        const limit = testMode ? Math.min(10, links.length) : links.length;

        for (let i = 0; i < limit; i++) {
            const item = links[i];
            const id = item.url.split('/').filter(Boolean).pop();
            if (scrapedIds.has(id)) continue;

            try {
                log(`🖼️ [${i + 1}/${limit}] Fetching: ${id}`);
                await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await delay(2000);

                const details = await page.evaluate(() => {
                    const result = {
                        title: '',
                        artist: '',
                        year: '',
                        medium: '',
                        dimensions: '',
                        image: '',
                        room: ''
                    };

                    // Title
                    const h1 = document.querySelector('h1');
                    if (h1) result.title = h1.textContent.trim();

                    // Artist - look for author/artist elements
                    const artistSelectors = ['.artist', '.author', '[class*="artist"]', '[class*="author"]',
                        '[class*="autore"]', 'h2', '.subtitle'];
                    for (const sel of artistSelectors) {
                        const el = document.querySelector(sel);
                        if (el && el.textContent.length < 100) {
                            result.artist = el.textContent.trim();
                            break;
                        }
                    }

                    // Look for metadata in description lists or labeled fields
                    const getText = (labels) => {
                        const allText = document.body.innerText;
                        for (const label of labels) {
                            const regex = new RegExp(label + '[:\\s]+([^\\n]+)', 'i');
                            const match = allText.match(regex);
                            if (match) return match[1].trim();
                        }
                        return '';
                    };

                    result.year = getText(['Date', 'Dating', 'Data', 'Datazione', 'Year', 'Anno']);
                    result.medium = getText(['Medium', 'Technique', 'Tecnica', 'Material', 'Materiale']);
                    result.dimensions = getText(['Dimensions', 'Size', 'Dimensioni', 'Misure']);
                    result.room = getText(['Room', 'Sala', 'Location', 'Collocazione']);

                    // Image
                    const mainImg = document.querySelector('img[src*="/uploads/"], img[src*="/files/"], .artwork-image img, article img, main img');
                    if (mainImg && mainImg.src && !mainImg.src.includes('logo')) {
                        result.image = mainImg.src;
                    }

                    return result;
                });

                const artwork = {
                    id,
                    sourceUrl: item.url,
                    title: details.title || item.title,
                    artist: formatArtistName(details.artist),
                    year: details.year,
                    medium: details.medium,
                    dimensions: details.dimensions,
                    room: details.room,
                    category: 'Painting',
                    image: details.image || item.thumbnail
                };

                if (artwork.title || artwork.image) {
                    artworks.push(artwork);
                    scrapedIds.add(id);
                    log(`   ✓ ${artwork.title} | ${artwork.artist} | ${artwork.year}`);
                }

                if (artworks.length % SAVE_INTERVAL === 0) {
                    saveCheckpoint(config.id, config, artworks);
                    log(`   💾 Checkpoint saved: ${artworks.length} items`);
                }

                await delay(500 + Math.random() * 500);
            } catch (e) {
                log(`   ⚠️ Error: ${e.message}`);
            }
        }
    } catch (e) {
        log(`❌ Fatal error: ${e.message}`);
    } finally {
        await context.close();
    }

    return artworks;
}

/**
 * Scrape Google Arts & Culture collection - IMPROVED with detail page scraping
 */
async function scrapeGAC(config, browser, testMode = false) {
    const log = msg => console.log(`[${timestamp()}] [${config.id}] ${msg}`);
    log(`🎨 Starting scrape of ${config.name}...`);

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();
    const artworks = [];
    const seenIds = new Set();

    try {
        // Use direct assets URL
        const assetsUrl = 'https://artsandculture.google.com/partner/museo-del-novecento?categoryId=medium';
        log(`📄 Loading GAC collection page...`);
        await page.goto(assetsUrl, { waitUntil: 'networkidle', timeout: 60000 });
        await delay(3000);

        // Save debug screenshot
        await page.screenshot({ path: path.join(DOWNLOADS_DIR, 'gac-novecento-debug.png') });

        // Scroll to load items
        const maxScrolls = testMode ? 3 : 30;
        let prevCount = 0;

        for (let s = 0; s < maxScrolls; s++) {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await delay(1500);

            const currentCount = await page.evaluate(() => {
                return document.querySelectorAll('a[href*="/asset/"]').length;
            });

            if (currentCount === prevCount && s > 3) break;
            prevCount = currentCount;

            if (s % 5 === 0) log(`   Scrolled ${s + 1} times, found ${currentCount} items`);
        }

        // Extract items
        const items = await page.evaluate(() => {
            const results = [];
            const seen = new Set();

            document.querySelectorAll('a[href*="/asset/"]').forEach(link => {
                const href = link.getAttribute('href');
                if (!href || seen.has(href)) return;
                seen.add(href);

                const fullUrl = href.startsWith('http') ? href : 'https://artsandculture.google.com' + href;
                const img = link.querySelector('img');

                results.push({
                    url: fullUrl,
                    thumbnail: img ? img.src : ''
                });
            });

            return results;
        });

        log(`   Found ${items.length} artwork items`);
        const limit = testMode ? Math.min(10, items.length) : items.length;

        for (let i = 0; i < limit; i++) {
            const item = items[i];
            const id = item.url.split('/asset/')[1]?.split('?')[0]?.split('/')[0] || `gac-${i}`;
            if (seenIds.has(id)) continue;

            try {
                log(`🖼️ [${i + 1}/${limit}] Fetching: ${id.substring(0, 30)}...`);
                await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await delay(2000);

                // Extract details using various methods
                const details = await page.evaluate(() => {
                    const result = {
                        title: '',
                        artist: '',
                        year: '',
                        medium: '',
                        dimensions: '',
                        image: ''
                    };

                    // Title - usually first h1 or specific class
                    const titleEl = document.querySelector('h1, [class*="title"]');
                    if (titleEl) result.title = titleEl.textContent.trim();

                    // Parse the page text for metadata
                    const pageText = document.body.innerText;

                    // Artist - look for "by" pattern or creator/artist field
                    const artistPatterns = [
                        /Creator\s*[:\n]+\s*([^\n]+)/i,
                        /Artist\s*[:\n]+\s*([^\n]+)/i,
                        /by\s+([A-Z][a-z]+(?: [A-Z][a-z]+)+)/,
                        /Autore\s*[:\n]+\s*([^\n]+)/i
                    ];

                    for (const pat of artistPatterns) {
                        const m = pageText.match(pat);
                        if (m) {
                            result.artist = m[1].trim();
                            break;
                        }
                    }

                    // Year/Date
                    const datePatterns = [
                        /Date\s*[:\n]+\s*(\d{4}(?:\s*[-–]\s*\d{4})?)/i,
                        /Created\s*[:\n]+\s*(\d{4})/i,
                        /Year\s*[:\n]+\s*(\d{4})/i,
                        /(\d{4})\s*[-–]\s*(\d{4})/,
                        /\b(1[89]\d{2}|20[0-2]\d)\b/
                    ];

                    for (const pat of datePatterns) {
                        const m = pageText.match(pat);
                        if (m) {
                            result.year = m[1];
                            break;
                        }
                    }

                    // Medium
                    const mediumPatterns = [
                        /Medium\s*[:\n]+\s*([^\n]+)/i,
                        /Material\s*[:\n]+\s*([^\n]+)/i,
                        /Technique\s*[:\n]+\s*([^\n]+)/i
                    ];

                    for (const pat of mediumPatterns) {
                        const m = pageText.match(pat);
                        if (m) {
                            result.medium = m[1].trim();
                            break;
                        }
                    }

                    // Dimensions
                    const dimPatterns = [
                        /Dimensions\s*[:\n]+\s*([^\n]+)/i,
                        /Size\s*[:\n]+\s*([^\n]+)/i,
                        /(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?(?:\s*cm)?)/i
                    ];

                    for (const pat of dimPatterns) {
                        const m = pageText.match(pat);
                        if (m) {
                            result.dimensions = m[1].trim();
                            break;
                        }
                    }

                    // High-res image
                    const imgs = document.querySelectorAll('img[src*="googleusercontent"], img[src*="lh3."]');
                    for (const img of imgs) {
                        if (img.naturalWidth > 200 || !img.naturalWidth) {
                            // Get highest resolution
                            let src = img.src;
                            src = src.replace(/=w\d+(-h\d+)?(-[a-z]+)?$/, '=w1200');
                            result.image = src;
                            break;
                        }
                    }

                    return result;
                });

                const artwork = {
                    id,
                    sourceUrl: item.url,
                    title: details.title,
                    artist: formatArtistName(details.artist),
                    year: details.year,
                    medium: details.medium,
                    dimensions: details.dimensions,
                    category: 'Painting',
                    image: details.image || item.thumbnail
                };

                if (artwork.title || artwork.image) {
                    artworks.push(artwork);
                    seenIds.add(id);
                    log(`   ✓ ${artwork.title} | ${artwork.artist} | ${artwork.year}`);
                }

                if (artworks.length % SAVE_INTERVAL === 0) {
                    saveCheckpoint(config.id, config, artworks);
                    log(`   💾 Checkpoint saved: ${artworks.length} items`);
                }

                await delay(800 + Math.random() * 400);
            } catch (e) {
                log(`   ⚠️ Error: ${e.message}`);
            }
        }
    } catch (e) {
        log(`❌ Fatal error: ${e.message}`);
    } finally {
        await context.close();
    }

    return artworks;
}

/**
 * Save final results
 */
function saveResults(config, artworks) {
    const output = {
        museum: config.name,
        museumId: config.id,
        location: config.location,
        collection: config.collection || '',
        type: 'permanent',
        scrapedAt: new Date().toISOString(),
        totalArtworks: artworks.length,
        artworksWithImage: artworks.filter(a => a.image).length,
        artworksWithTitle: artworks.filter(a => a.title).length,
        artworksWithArtist: artworks.filter(a => a.artist).length,
        artworksWithYear: artworks.filter(a => a.year).length,
        objects: artworks
    };

    const outputPath = path.join(OUTPUT_DIR, config.outputFile);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

    console.log(`\n✅ [${config.id}] Saved ${artworks.length} artworks to ${config.outputFile}`);
    console.log(`   📊 Stats: Images=${output.artworksWithImage}, Titles=${output.artworksWithTitle}, Artists=${output.artworksWithArtist}, Years=${output.artworksWithYear}`);

    return output;
}

/**
 * Main function - runs all scrapers in parallel
 */
async function main() {
    const args = process.argv.slice(2);
    const testMode = args.includes('--test');

    console.log('═'.repeat(60));
    console.log('🏛️  ITALIAN MUSEUMS PARALLEL SCRAPER v2');
    console.log(`   Mode: ${testMode ? 'TEST (limited items)' : 'FULL'}`);
    console.log('═'.repeat(60));

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox']
    });

    try {
        // Run all scrapers in parallel
        const results = await Promise.all([
            // Novecento collections (HTTP-based, no browser needed)
            scrapeNovecento(MUSEUMS.della_ragione, testMode),
            scrapeNovecento(MUSEUMS.rosai, testMode),
            // Browser-based scrapers
            scrapeAmbrosiana(MUSEUMS.ambrosiana, browser, testMode),
            scrapeGAC(MUSEUMS.gac_novecento, browser, testMode)
        ]);

        // Save all results
        const [dellaRagioneArt, rosaiArt, ambrosianaArt, gacArt] = results;

        const outputs = [
            saveResults(MUSEUMS.della_ragione, dellaRagioneArt),
            saveResults(MUSEUMS.rosai, rosaiArt),
            saveResults(MUSEUMS.ambrosiana, ambrosianaArt),
            saveResults(MUSEUMS.gac_novecento, gacArt)
        ];

        // Final summary
        console.log('\n' + '═'.repeat(60));
        console.log('📊 FINAL SUMMARY');
        console.log('═'.repeat(60));

        let totalArtworks = 0;
        outputs.forEach(output => {
            console.log(`\n${output.museum}:`);
            console.log(`   Total: ${output.totalArtworks} artworks`);
            console.log(`   With images: ${output.artworksWithImage}`);
            console.log(`   With artists: ${output.artworksWithArtist}`);
            console.log(`   With years: ${output.artworksWithYear}`);
            totalArtworks += output.totalArtworks;
        });

        console.log(`\n📦 GRAND TOTAL: ${totalArtworks} artworks scraped`);

    } finally {
        await browser.close();
    }
}

// Export for individual testing
module.exports = {
    scrapeNovecento,
    scrapeAmbrosiana,
    scrapeGAC,
    MUSEUMS
};

main().catch(console.error);
