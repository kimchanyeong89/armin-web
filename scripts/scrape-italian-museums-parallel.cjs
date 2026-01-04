/**
 * Italian Museums Parallel Scraper
 * 
 * Scrapes 4 museum collections in parallel:
 * 1. Pinacoteca Ambrosiana (Milan)
 * 2. Google Arts & Culture - Museo del Novecento
 * 3. Museo del Novecento - Alberto Della Ragione Collection
 * 4. Museo del Novecento - Ottone Rosai Collection
 * 
 * Each collection is saved as a separate permanent exhibition.
 * Saves every 50 items as checkpoint.
 * 
 * Usage:
 *   node scripts/scrape-italian-museums-parallel.cjs --test   # Test mode (3 pages/loads each)
 *   node scripts/scrape-italian-museums-parallel.cjs          # Full scrape
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
        url: 'https://artsandculture.google.com/explore/collections/museo-del-novecento?c=assets&hl=en',
        type: 'gac',
        outputFile: 'museo-novecento-gac-collection.json'
    },
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
    name = name.replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();

    // Handle "Last, First" format
    if (name.includes(',')) {
        const parts = name.split(',').map(p => p.trim());
        if (parts.length === 2) {
            return `${parts[1]} ${parts[0]}`;
        }
    }
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
 * Load checkpoint if exists
 */
function loadCheckpoint(museumId) {
    const checkpointFile = path.join(DOWNLOADS_DIR, `${museumId}-checkpoint.json`);
    if (fs.existsSync(checkpointFile)) {
        try {
            const data = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
            console.log(`[${museumId}] Loaded checkpoint with ${data.artworks?.length || 0} artworks`);
            return data;
        } catch (e) {
            console.log(`[${museumId}] Failed to load checkpoint`);
        }
    }
    return null;
}

/**
 * Scrape Museo Novecento collections (Della Ragione or Rosai)
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
 * Extract details from Museo Novecento artwork page
 */
function extractNovecentoDetails(html, url, config) {
    const artwork = {
        sourceUrl: url,
        id: url.split('/').filter(Boolean).pop(),
        category: config.collection || 'Painting',
        room: config.room || ''
    };

    // Title - h1 with entry-title class or just h1
    const titleMatch = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([^<]+)<\/h1>/i) ||
        html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    artwork.title = titleMatch ? titleMatch[1].trim() : '';

    // Artist - from meta or author elements
    const artistMatch = html.match(/<span[^>]*class="[^"]*autore[^"]*"[^>]*>([^<]+)<\/span>/i) ||
        html.match(/<h2[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)<\/h2>/i) ||
        html.match(/<p[^>]*class="[^"]*artista[^"]*"[^>]*>([^<]+)<\/p>/i) ||
        html.match(/<meta[^>]+name="author"[^>]+content="([^"]+)"/i);
    artwork.artist = artistMatch ? formatArtistName(artistMatch[1]) : '';

    // Year - look for date patterns
    const yearMatch = html.match(/<span[^>]*class="[^"]*anno[^"]*"[^>]*>([^<]+)<\/span>/i) ||
        html.match(/<span[^>]*class="[^"]*date[^"]*"[^>]*>([^<]+)<\/span>/i) ||
        html.match(/(\d{4})\s*(?:–\s*\d{4})?(?:\s*ca\.?)?/i);
    artwork.year = yearMatch ? yearMatch[1].trim() : '';

    // Medium/Technique
    const mediumMatch = html.match(/<span[^>]*class="[^"]*tecnica[^"]*"[^>]*>([^<]+)<\/span>/i) ||
        html.match(/tecnic[ao][:\s]*([^<,]+)/i);
    artwork.medium = mediumMatch ? mediumMatch[1].trim() : '';

    // Dimensions
    const dimMatch = html.match(/(\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?(?:\s*[x×]\s*\d+(?:[.,]\d+)?)?(?:\s*cm)?)/i) ||
        html.match(/<span[^>]*class="[^"]*dimensioni[^"]*"[^>]*>([^<]+)<\/span>/i);
    artwork.dimensions = dimMatch ? dimMatch[1].trim() : '';

    // Image - og:image or featured image
    const imgMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) ||
        html.match(/<img[^>]+class="[^"]*wp-post-image[^"]*"[^>]+src="([^"]+)"/i) ||
        html.match(/<img[^>]+src="([^"]+)"[^>]+class="[^"]*featured[^"]*"/i);
    artwork.image = imgMatch ? imgMatch[1].trim() : '';

    return artwork;
}

/**
 * Scrape Pinacoteca Ambrosiana using Playwright
 */
async function scrapeAmbrosiana(config, browser, testMode = false) {
    const log = msg => console.log(`[${timestamp()}] [${config.id}] ${msg}`);
    log(`🎨 Starting scrape of ${config.name}...`);

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    const artworks = [];
    const scrapedIds = new Set();

    try {
        log(`📄 Loading catalog page...`);
        await page.goto(config.url, { waitUntil: 'networkidle', timeout: 60000 });
        await delay(3000);

        // Wait for catalog to render
        await page.waitForSelector('.artwork-item, .collection-item, [class*="item"], [class*="card"], article', { timeout: 30000 }).catch(() => { });

        // Scroll to load more items
        const maxScrolls = testMode ? 3 : 20;
        for (let s = 0; s < maxScrolls; s++) {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await delay(1000);
        }

        // Extract item links
        const links = await page.evaluate(() => {
            const items = [];
            const elements = document.querySelectorAll('a[href*="/en/opere/"], a[href*="/opere/"]');
            const seen = new Set();

            elements.forEach(el => {
                const href = el.getAttribute('href');
                if (!href || seen.has(href)) return;
                seen.add(href);

                const fullUrl = href.startsWith('http') ? href : 'https://www.ambrosiana.it' + href;
                const img = el.querySelector('img');

                items.push({
                    url: fullUrl,
                    thumbnail: img ? (img.src || img.dataset.src) : ''
                });
            });

            return items;
        });

        log(`   Found ${links.length} artwork links`);
        const limit = testMode ? Math.min(10, links.length) : links.length;

        for (let i = 0; i < limit; i++) {
            const item = links[i];
            const id = item.url.split('/').filter(Boolean).pop();
            if (scrapedIds.has(id)) continue;

            try {
                log(`🖼️ [${i + 1}/${limit}] Fetching: ${id}`);
                await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await delay(1500);

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

                    // Artist
                    const artistEl = document.querySelector('.artist, .author, [class*="artist"], [class*="author"], h2');
                    if (artistEl) result.artist = artistEl.textContent.trim();

                    // Look for metadata fields
                    const getField = (labels) => {
                        for (const label of labels) {
                            const boldEls = document.querySelectorAll('b, strong, dt, .label');
                            for (const el of boldEls) {
                                if (el.textContent.toLowerCase().includes(label.toLowerCase())) {
                                    const next = el.nextElementSibling || el.parentElement?.nextElementSibling;
                                    if (next) return next.textContent.trim();
                                }
                            }
                        }
                        return '';
                    };

                    result.year = getField(['date', 'data', 'dating', 'datazione', 'year', 'anno']);
                    result.medium = getField(['medium', 'technique', 'tecnica', 'material', 'materiale']);
                    result.dimensions = getField(['dimensions', 'size', 'dimensioni', 'misure']);
                    result.room = getField(['room', 'sala', 'location', 'collocazione']);

                    // Image
                    const imgSelectors = [
                        'img[src*="/uploads/"]',
                        'img[src*="/files/"]',
                        '.artwork-image img',
                        'article img',
                        'main img'
                    ];

                    for (const sel of imgSelectors) {
                        const img = document.querySelector(sel);
                        if (img && img.src && !img.src.includes('logo') && !img.src.includes('icon')) {
                            result.image = img.src;
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
 * Scrape Google Arts & Culture collection
 */
async function scrapeGAC(config, browser, testMode = false) {
    const log = msg => console.log(`[${timestamp()}] [${config.id}] ${msg}`);
    log(`🎨 Starting scrape of ${config.name}...`);

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    const artworks = [];
    const seenIds = new Set();

    try {
        log(`📄 Loading GAC collection page...`);
        await page.goto(config.url, { waitUntil: 'networkidle', timeout: 60000 });
        await delay(3000);

        // Scroll to load items
        const maxScrolls = testMode ? 3 : 50;
        let prevCount = 0;

        for (let s = 0; s < maxScrolls; s++) {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await delay(1500);

            const currentCount = await page.evaluate(() => {
                return document.querySelectorAll('[data-ogsr], [class*="asset"], [class*="item"]').length;
            });

            if (currentCount === prevCount && s > 3) break;
            prevCount = currentCount;

            if (s % 10 === 0) log(`   Scrolled ${s + 1} times, found ${currentCount} items`);
        }

        // Extract items
        const items = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('[data-ogsr], [class*="asset-card"], a[href*="/asset/"]');

            cards.forEach(card => {
                const link = card.tagName === 'A' ? card : card.querySelector('a');
                if (!link) return;

                const href = link.getAttribute('href');
                if (!href || !href.includes('/asset/')) return;

                const fullUrl = href.startsWith('http') ? href : 'https://artsandculture.google.com' + href;
                const img = card.querySelector('img');
                const titleEl = card.querySelector('[class*="title"], h3, h4, span');

                results.push({
                    url: fullUrl,
                    thumbnail: img ? img.src : '',
                    title: titleEl ? titleEl.textContent.trim() : ''
                });
            });

            return results;
        });

        log(`   Found ${items.length} artwork items`);
        const limit = testMode ? Math.min(10, items.length) : items.length;

        for (let i = 0; i < limit; i++) {
            const item = items[i];
            const id = item.url.split('/asset/')[1]?.split('?')[0] || `gac-${i}`;
            if (seenIds.has(id)) continue;

            try {
                log(`🖼️ [${i + 1}/${limit}] Fetching: ${id.substring(0, 30)}...`);
                await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await delay(2000);

                const details = await page.evaluate(() => {
                    const result = {
                        title: '',
                        artist: '',
                        year: '',
                        medium: '',
                        dimensions: '',
                        image: ''
                    };

                    // Title
                    const titleEl = document.querySelector('h1, [class*="title"]');
                    if (titleEl) result.title = titleEl.textContent.trim();

                    // Look for metadata
                    const metaItems = document.querySelectorAll('[class*="metadata"], [class*="detail"], dl, .info');
                    metaItems.forEach(meta => {
                        const text = meta.textContent.toLowerCase();

                        if (text.includes('artist') || text.includes('creator') || text.includes('by')) {
                            const artistEl = meta.querySelector('a, span:last-child, dd');
                            if (artistEl) result.artist = artistEl.textContent.trim();
                        }

                        if (text.includes('date') || text.includes('year') || text.includes('created')) {
                            const dateMatch = meta.textContent.match(/(\d{4})/);
                            if (dateMatch) result.year = dateMatch[1];
                        }

                        if (text.includes('medium') || text.includes('material')) {
                            const mediumEl = meta.querySelector('span:last-child, dd');
                            if (mediumEl) result.medium = mediumEl.textContent.trim();
                        }

                        if (text.includes('dimensions') || text.includes('size')) {
                            const dimEl = meta.querySelector('span:last-child, dd');
                            if (dimEl) result.dimensions = dimEl.textContent.trim();
                        }
                    });

                    // High-res image
                    const img = document.querySelector('img[src*="googleusercontent"], img[src*="lh3."], [class*="image"] img');
                    if (img) result.image = img.src.replace(/=w\d+$/, '=w1200');

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
    console.log('🏛️  ITALIAN MUSEUMS PARALLEL SCRAPER');
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
