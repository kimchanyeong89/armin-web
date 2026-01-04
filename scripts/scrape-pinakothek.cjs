/**
 * Bavarian State Painting Collections (Pinakothek) Scraper
 * 
 * Uses the official API: https://www.sammlung.pinakothek.de/api/search
 * 
 * Collections:
 *   - AP: Alte Pinakothek (Old Masters)
 *   - NP: Neue Pinakothek (19th Century)
 *   - PdM: Pinakothek der Moderne (Modern Art)
 *   - SS: Sammlung Schack
 *   - SG: Staatsgalerien (State Galleries)
 * 
 * Usage:
 *   node scripts/scrape-pinakothek.cjs --test        # Test mode (1 page per collection)
 *   node scripts/scrape-pinakothek.cjs               # Full scrape
 *   node scripts/scrape-pinakothek.cjs --collection AP  # Single collection
 */

const fs = require('fs');
const path = require('path');

// Configuration
const API_BASE = 'https://www.sammlung.pinakothek.de/api/search';
const OUTPUT_DIR = path.join(__dirname, '../public/data');
const DOWNLOADS_DIR = path.join(__dirname, '../downloads');
const PROGRESS_FILE = path.join(DOWNLOADS_DIR, 'pinakothek-progress.json');
const PER_PAGE = 100; // Max items per API request

const COLLECTIONS = {
    'AP': { name: 'Alte Pinakothek', file: 'alte-pinakothek-collection.json' },
    'NP': { name: 'Neue Pinakothek', file: 'neue-pinakothek-collection.json' },
    'PdM': { name: 'Pinakothek der Moderne', file: 'pinakothek-moderne-collection.json' },
    'SS': { name: 'Sammlung Schack', file: 'sammlung-schack-collection.json' },
    'SG': { name: 'Staatsgalerien', file: 'staatsgalerien-collection.json' }
};

const delay = ms => new Promise(r => setTimeout(r, ms));
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const log = msg => console.log(`[${timestamp()}] [PINAKOTHEK] ${msg}`);

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
    return { completedCollections: [], artworksByCollection: {} };
}

function saveProgress(progress) {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function saveCollection(locationCode, artworks) {
    const config = COLLECTIONS[locationCode];
    const output = {
        museum: config.name,
        museumId: locationCode.toLowerCase(),
        collectionName: `${config.name} Collection`,
        location: 'Munich, Germany',
        scrapedAt: new Date().toISOString(),
        totalObjects: artworks.length,
        coverImage: artworks.find(a => a.image)?.image || null,
        objects: artworks
    };
    fs.writeFileSync(path.join(OUTPUT_DIR, config.file), JSON.stringify(output, null, 2));
    log(`   💾 Saved ${artworks.length} items to ${config.file}`);
}

async function fetchPage(locationCode, page, retries = 3) {
    const filters = {
        yearRange: { min: 1300, max: 2026 },
        artist: "",
        title: "",
        inventoryId: "",
        origin: "",
        material: "",
        locationCode: locationCode,
        department: "",
        genre: "",
        year: "",
        onDisplay: false,
        onHidden: false,
        withPicture: true,
        publicDomain: false
    };

    const url = `${API_BASE}?page=${page}&perPage=${PER_PAGE}&filters=${encodeURIComponent(JSON.stringify(filters))}`;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                    'Accept': 'application/json',
                    'Referer': 'https://www.sammlung.pinakothek.de/en/extendedsearch'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            return data;

        } catch (error) {
            if (attempt === retries) {
                log(`   ❌ Failed to fetch page ${page}: ${error.message}`);
                return null;
            }
            log(`   ⚠️ Attempt ${attempt}/${retries} failed, retrying...`);
            await delay(2000 * attempt);
        }
    }
    return null;
}

function transformArtwork(item, locationCode) {
    // Extract best image URL
    let imageUrl = '';
    if (item.image) {
        // Use retina version for higher quality, or regular
        // Note: Cloudinary URLs are authenticated, higher sizes may not work
        imageUrl = item.image.urlRetina || item.image.url || '';
    }

    // Extract artist name
    let artist = '';
    if (item.artistInfo) {
        artist = item.artistInfo.fullName || item.artistInfo.name || '';
    }

    // Build dimensions string
    let dimensions = '';
    if (item.dimensions) {
        const d = item.dimensions;
        if (d.height && d.width) {
            dimensions = `${d.height} × ${d.width}`;
            if (d.unit) dimensions += ` ${d.unit}`;
        }
    }

    return {
        id: `pinakothek-${locationCode.toLowerCase()}-${item.inventoryId || item.id}`.replace(/[^a-zA-Z0-9-]/g, '-'),
        title: item.title || 'Untitled',
        artist: artist || 'Unknown',
        year: item.date || null,
        dateStr: item.date || null,
        medium: item.material || '',
        dimensions: dimensions,
        inventoryNumber: item.inventoryId || '',
        genre: item.genre || '',
        department: item.department || '',
        origin: item.origin || '',
        onDisplay: item.onDisplay || false,
        image: imageUrl,
        source: COLLECTIONS[locationCode].name,
        url: `https://www.sammlung.pinakothek.de/en/artwork/${item.inventoryId || item.id}`,
        locationCode: locationCode
    };
}

async function scrapeCollection(locationCode, testMode = false) {
    const config = COLLECTIONS[locationCode];
    log(`\n🎨 Scraping ${config.name} (${locationCode})...`);

    // First, get total count
    const firstPage = await fetchPage(locationCode, 1);
    if (!firstPage || !firstPage.search) {
        log(`   ❌ Failed to get data for ${locationCode}`);
        return [];
    }

    const totalCount = firstPage.search.totalCount || 0;
    const totalPages = Math.ceil(totalCount / PER_PAGE);
    const pagesToScrape = testMode ? 1 : totalPages;

    log(`   📊 Total: ${totalCount} items across ${totalPages} pages`);
    log(`   📄 Scraping ${pagesToScrape} page(s)...`);

    const artworks = [];

    // Process first page - items are at ROOT level, not under search
    if (firstPage.items && Array.isArray(firstPage.items)) {
        for (const item of firstPage.items) {
            artworks.push(transformArtwork(item, locationCode));
        }
    }
    log(`   ✅ Page 1/${pagesToScrape} - ${artworks.length} items`);

    // Fetch remaining pages
    for (let page = 2; page <= pagesToScrape; page++) {
        const data = await fetchPage(locationCode, page);
        if (data && data.items && Array.isArray(data.items)) {
            for (const item of data.items) {
                artworks.push(transformArtwork(item, locationCode));
            }
            log(`   ✅ Page ${page}/${pagesToScrape} - ${artworks.length} items total`);
        }

        // Small delay between requests
        await delay(200);
    }

    log(`   🎉 ${config.name}: ${artworks.length} artworks collected`);
    return artworks;
}

async function main() {
    const args = process.argv.slice(2);
    const testMode = args.includes('--test');
    const singleCollection = args.find(a => a.startsWith('--collection='))?.split('=')[1]?.toUpperCase();

    log('🏛️ Bavarian State Painting Collections Scraper');
    log('   Munich, Germany');
    log(`   Mode: ${testMode ? 'TEST' : 'FULL'}`);
    if (singleCollection) log(`   Collection: ${singleCollection}`);

    const progress = loadProgress();
    const collectionsToScrape = singleCollection
        ? [singleCollection]
        : Object.keys(COLLECTIONS);

    const allArtworks = {};

    try {
        for (const locationCode of collectionsToScrape) {
            if (!COLLECTIONS[locationCode]) {
                log(`⚠️ Unknown collection: ${locationCode}`);
                continue;
            }

            // Skip if already completed (unless single collection mode)
            if (!singleCollection && progress.completedCollections.includes(locationCode)) {
                log(`\n⏭️ Skipping ${COLLECTIONS[locationCode].name} (already completed)`);
                allArtworks[locationCode] = progress.artworksByCollection[locationCode] || [];
                continue;
            }

            const artworks = await scrapeCollection(locationCode, testMode);
            allArtworks[locationCode] = artworks;

            // Save individual collection
            if (artworks.length > 0) {
                saveCollection(locationCode, artworks);
            }

            // Update progress
            if (!testMode) {
                progress.completedCollections.push(locationCode);
                progress.artworksByCollection[locationCode] = artworks.length;
                saveProgress(progress);
            }

            // Delay between collections
            await delay(1000);
        }

        // Summary
        log('\n' + '='.repeat(50));
        log('📊 SCRAPING COMPLETE');
        log('='.repeat(50));

        let grandTotal = 0;
        for (const [code, artworks] of Object.entries(allArtworks)) {
            const count = Array.isArray(artworks) ? artworks.length : artworks;
            log(`   ${COLLECTIONS[code].name}: ${count} items`);
            grandTotal += count;
        }
        log(`   ${'─'.repeat(30)}`);
        log(`   TOTAL: ${grandTotal} artworks`);
        log('');

    } catch (error) {
        log(`❌ Error: ${error.message}`);
        console.error(error);
    }
}

main().catch(console.error);
