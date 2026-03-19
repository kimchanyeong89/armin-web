/**
 * Scrape MNK Collection
 * Categories: Painting, Drawing, Poster, Photography
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Dynamic import for p-limit
const pLimitImport = import('p-limit');

const OUTPUT_FILE = path.join(__dirname, '../public/data/mnk-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/mnk-scrape-progress.json');

const BASE_URL = 'https://api-zbiory.mnk.pl/api/search/Object/page/';
const HEADERS = {
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    'Referer': 'https://zbiory.mnk.pl/'
};

// Type IDs identified
const TARGET_TYPES = [
    100489, // painting
    113913, // painting
    100566, // drawning
    99988,  // posters
    100453, // negatives (photographs)
];

let collection = [];
let progress = { pages: {} }; // pages processed per type

if (fs.existsSync(OUTPUT_FILE)) {
    try {
        collection = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    } catch (e) {}
}

if (fs.existsSync(PROGRESS_FILE)) {
    try {
        progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    } catch (e) {}
}

async function scrapeType(typeId, limit) {
    let page = 1;
    let totalPages = 1;
    
    // Check if we already did some work
    if (progress.pages[typeId]) {
        page = progress.pages[typeId] + 1;
        console.log(`Resuming Type ${typeId} from page ${page}...`);
    }

    // First fetch to get total pages
    try {
        const firstRes = await axios.get(`${BASE_URL}${page}`, {
            params: { 'filter[types][]': typeId, maxPerPage: 20 },
            headers: HEADERS
        });
        totalPages = firstRes.data.data.paginatorDetails.totalPagesCount;
        console.log(`Type ${typeId}: Found ${firstRes.data.data.paginatorDetails.totalItemsCount} items (${totalPages} pages)`);
        
        // Process first page
        processItems(firstRes.data.data.items, typeId);
        progress.pages[typeId] = page;
        page++;
    } catch (e) {
        console.error(`Error initializing Type ${typeId}: ${e.message}`);
        return;
    }

    // Process remaining pages
    const pageQueue = [];
    for (let p = page; p <= totalPages; p++) {
        pageQueue.push(p);
    }

    await Promise.all(pageQueue.map(p => limit(async () => {
        try {
            const res = await axios.get(`${BASE_URL}${p}`, {
                params: { 'filter[types][]': typeId, maxPerPage: 20 },
                headers: HEADERS,
                timeout: 20000 
            });
            processItems(res.data.data.items, typeId);
            
            // Update highest page done (rough check)
            if (p > (progress.pages[typeId] || 0)) {
                progress.pages[typeId] = p;
            }
            
            if (p % 10 === 0) {
                console.log(`  Type ${typeId}: Processed page ${p}/${totalPages}`);
                saveData();
            }
        } catch (err) {
            console.error(`  Type ${typeId} Page ${p} failed: ${err.message}`);
        }
    })));
}

function processItems(items, typeId) {
    if (!items) return;
    items.forEach(item => {
        // Avoid duplicates
        if (!collection.find(c => c.id === item.id)) {
            // Normalize data a bit
            const cleanItem = {
                _id: String(item.id),
                id: item.id,
                title: item.title,
                image: item.image ? `https://zbiory.mnk.pl/media/catalog/${item.image.filePath}.${item.image.extension}` : null,
                authors: item.authors,
                date: item.createDates ? item.createDates.map(d => d.name).join(', ') : '',
                medium: null, // Need to verify if this exists in detail
                dimensions: null, 
                typeId: typeId,
                raw: item
            };
            collection.push(cleanItem);
        }
    });
}

function saveData() {
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2));
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function main() {
    const { default: pLimit } = await pLimitImport;
    const limit = pLimit(5); // 5 concurrent requests

    console.log('Starting MNK Scrape...');

    for (const typeId of TARGET_TYPES) {
        await scrapeType(typeId, limit);
    }

    saveData();
    console.log(`Scrape Complete! Total items: ${collection.length}`);
}

main().catch(console.error);
