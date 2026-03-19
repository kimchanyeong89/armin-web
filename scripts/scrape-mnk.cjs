/**
 * Scraper for National Museum in Krakow (MNK)
 * Target: 2D works (Paintings, Drawings, Posters, Photos) with full metadata.
 * Strategy:
 * 1. Fetch all Object IDs via Search API (filtered by type keywords).
 * 2. Fetch full details for each ID via Object API.
 * 3. Save to public/data/mnk-collection.json.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
// const pLimit = require('p-limit'); // ESM only

// ------------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------------
const SEARCH_API_BASE = 'https://api-zbiory.mnk.pl/api/search/Object/page';
const DETAIL_API_BASE = 'https://api-zbiory.mnk.pl/api/object';
const MAX_PER_PAGE = 100;
const CONCURRENCY_SEARCH = 5;
const CONCURRENCY_DETAIL = 20;

const OUTPUT_DIR = path.join(__dirname, '../downloads');
const IDS_FILE = path.join(OUTPUT_DIR, 'mnk-ids.json');
const FINAL_FILE = path.join(__dirname, '../public/data/mnk-collection.json');

// Keywords to identify 2D works in `types[].name` or `department.name`? 
// Focusing on types.
const TYPE_KEYWORDS = [
    'obraz', 'malarstwo', 'painting', 
    'rysunek', 'drawing', 
    'szkic', 'sketch', 
    'pastel', 
    'akwarela', 'watercolor', 
    'grafika', 'print', 'graphic',
    'plakat', 'poster', 'afisz',
    'fotografia', 'photo', 'zdjęcie',
    'litografia', 'lithograph',
    'drzeworyt', 'woodcut',
    'miedzioryt', 'copperplate',
    'akwaforta', 'etching',
    'staloryt', 'steel engraving',
    'sucha igła', 'drypoint',
    'monotypia', 'monotype',
    'technika własna'
];

const EXCLUDE_KEYWORDS = [
    'rzeźba', 'sculpture', 
    'rzemiosło', 'craft', 
    'mebel', 'furniture',
    'broń', 'weapon',
    'ubiór', 'clothing',
    'moneta', 'coin',
    'medal'
];

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function is2DWork(item) {
    if (!item.types || item.types.length === 0) return false;
    
    // Check types
    const typeNames = item.types.map(t => t.name.toLowerCase());
    const match = typeNames.some(name => TYPE_KEYWORDS.some(k => name.includes(k)));
    const exclude = typeNames.some(name => EXCLUDE_KEYWORDS.some(k => name.includes(k)));
    
    return match && !exclude;
}

// ------------------------------------------------------------------
// STEP 1: HARVEST IDs
// ------------------------------------------------------------------
async function harvestIds() {
    console.log('--- Phase 1: Harvesting IDs ---');
    const pLimit = (await import('p-limit')).default;
    
    let allItems = [];
    if (fs.existsSync(IDS_FILE)) {
        allItems = JSON.parse(fs.readFileSync(IDS_FILE, 'utf8'));
        console.log(`Loaded ${allItems.length} existing items.`);
    }

    // Get total pages
    const initialUrl = `${SEARCH_API_BASE}/1?maxPerPage=1`;
    const initResp = await axios.get(initialUrl);
    const totalItems = initResp.data.data.paginatorDetails.totalItemsCount;
    const totalPages = Math.ceil(totalItems / MAX_PER_PAGE);
    
    console.log(`Total items in DB: ${totalItems}, Total pages: ${totalPages}`);

    // Create a set of processed pages to skip
    // We can't easily skip pages if we filter, unless we saved which pages we did.
    // For simplicity, we might just re-scan or assume if we have X items we are good?
    // No, better to scan all pages. If list exists, we merge.
    // Given the speed (1400 reqs), we can just re-run or rely on ID filtering.
    // Let's just create a list of pages to fetch.
    
    const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
    const limit = pLimit(CONCURRENCY_SEARCH);
    
    // Track seen IDs to avoid duplicates
    const seenIds = new Set(allItems.map(i => i.id));
    let newItemsCount = 0;

    const pageTasks = pages.map(page => limit(async () => {
        try {
            // Simple logging to reduce noise
            if (page % 50 === 0) console.log(`Scanning page ${page}/${totalPages}...`);
            
            const url = `${SEARCH_API_BASE}/${page}?maxPerPage=${MAX_PER_PAGE}`;
            const resp = await axios.get(url, { headers: { 'User-Agent': 'Bot' }, timeout: 10000 });
            
            const items = resp.data.data.items || [];
            
            for (const item of items) {
                if (seenIds.has(item.id)) continue;
                if (is2DWork(item)) {
                    // Minimal object to save memory
                    const minimal = {
                        id: item.id,
                        title: item.title,
                        rawDetails: null, // Will be filled in phase 2
                        scraped_at: new Date().toISOString()
                    };
                    allItems.push(minimal);
                    seenIds.add(item.id);
                    newItemsCount++;
                }
            }
        } catch (err) {
            console.error(`Error page ${page}: ${err.message}`);
        }
    }));

    await Promise.all(pageTasks);
    
    console.log(`Phase 1 Complete. Found ${newItemsCount} new 2D items. Total: ${allItems.length}`);
    fs.writeFileSync(IDS_FILE, JSON.stringify(allItems, null, 2));
    return allItems;
}

// ------------------------------------------------------------------
// STEP 2: FETCH DETAILS
// ------------------------------------------------------------------
async function fetchDetails(items) {
    console.log('--- Phase 2: Fetching Details ---');
    const pLimit = (await import('p-limit')).default;
    
    const limit = pLimit(CONCURRENCY_DETAIL);
    let itemsProcessed = 0;
    
    const detailTasks = items.map(item => limit(async () => {
        if (item.rawDetails) {
            // Already has details
            return;
        }

        try {
            const url = `${DETAIL_API_BASE}/${item.id}`;
            const resp = await axios.get(url, { headers: { 'User-Agent': 'Bot' }, timeout: 15000 });
            
            if (resp.data && resp.data.data) {
                item.rawDetails = resp.data.data;
            } else {
                console.error(`No data for ${item.id}`);
            }
            
            itemsProcessed++;
            if (itemsProcessed % 100 === 0) {
                console.log(`Details fetched: ${itemsProcessed}/${items.filter(i => !i.rawDetails).length + itemsProcessed}`);
                // Incremental save
                fs.writeFileSync(IDS_FILE, JSON.stringify(items, null, 2));
            }
        } catch (err) {
            console.error(`Failed detail ${item.id}: ${err.message}`);
        }
    }));

    await Promise.all(detailTasks);
    
    // Final save
    fs.writeFileSync(IDS_FILE, JSON.stringify(items, null, 2));
    console.log('Phase 2 Complete.');
}

// ------------------------------------------------------------------
// STEP 3: FORMAT & EXPORT
// ------------------------------------------------------------------
function transformToArminFormat(rawItem) {
    const d = rawItem.rawDetails;
    if (!d) return null;

    // Image URL construction
    // e.g., https://cdn-zbiory.mnk.pl/upload/multimedia/45/dd/45dda2c7ff6223406de33f557fcd4233.jpg
    let imageUrl = null;
    let imageWidth = 0;
    let imageHeight = 0;

    if (d.image && d.image.filePath) {
        imageUrl = `https://cdn-zbiory.mnk.pl/upload/multimedia/${d.image.filePath}.${d.image.extension || 'jpg'}`;
        // MNK doesn't provide width/height in API explicitly in main object, sometimes in sizes array but it's complex.
        // We'll leave 0 unless it's available.
    }

    // Artist
    let authors = [];
    if (d.authors) {
        authors = d.authors.map(a => ({
            name: a.name,
            role: a.role
        }));
    }

    // Date
    let date = '';
    if (d.createDates && d.createDates.length > 0) {
        date = d.createDates.map(cd => cd.name).join(', ');
    }

    // Dimensions
    const dimensions = d.dimensionText || '';

    // Technique/Material
    const materials = d.materials ? d.materials.map(m => m.name).join(', ') : '';
    const techniques = d.techniques ? d.techniques.map(t => t.name).join(', ') : '';
    const medium = [materials, techniques].filter(Boolean).join('; ');

    // Type
    const type = d.types ? d.types.map(t => t.name).join(', ') : '';

    return {
        id: `mnk-${d.id}`,
        source_id: d.id,
        title: d.title,
        artist: authors.length > 0 ? authors[0].name : 'Unknown', // Primary artist
        date: date,
        medium: medium || type,
        dimensions: dimensions,
        image_url: imageUrl,
        source_url: `https://zbiory.mnk.pl/en/catalog/${d.id}`,
        institution: 'National Museum in Krakow'
    };
}

async function exportData(items) {
    console.log('--- Phase 3: Exporting ---');
    const formatted = items
        .map(transformToArminFormat)
        .filter(i => i && i.image_url); // Only with images
    
    fs.writeFileSync(FINAL_FILE, JSON.stringify(formatted, null, 2));
    console.log(`Saved ${formatted.length} items to ${FINAL_FILE}`);
}

// ------------------------------------------------------------------
// MAIN
// ------------------------------------------------------------------
(async () => {
    // Phase 1: IDs
    const items = await harvestIds();
    
    // Phase 2: Details
    // Filter out items that already have rawDetails
    const itemsToFetch = items.filter(i => !i.rawDetails);
    
    // If we have too many, maybe process in chunks or strict limit?
    // User wants "all metadata".
    console.log(`Need to fetch details for ${itemsToFetch.length} items.`);
    
    await fetchDetails(items);
    
    // Phase 3: Export
    await exportData(items);
})();
