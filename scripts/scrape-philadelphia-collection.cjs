const fs = require('fs');
const path = require('path');
const https = require('https');

// Config
const APP_ID = 'X6LQJKEE40';
const API_KEY = 'f42fa6c68b53c57e31423969d0dc6cbf';
const HOST = `${APP_ID}-dsn.algolia.net`;

const CATEGORIES = ['Paintings', 'Drawings', 'Film/Video'];
const OUTPUT_FILE = path.join(__dirname, '../public/data/philadelphia-collection.json');

const HITS_PER_PAGE = 1000; 

async function fetchAlgolia(indexName, filters, page) {
    return new Promise((resolve, reject) => {
        const query = {
            requests: [
                {
                    indexName: indexName,
                    params: `filters=${encodeURIComponent(filters)}&hitsPerPage=${HITS_PER_PAGE}&page=${page}`
                }
            ]
        };

        const postData = JSON.stringify(query);

        const options = {
            hostname: HOST,
            path: '/1/indexes/*/queries?x-algolia-agent=Node.js',
            method: 'POST',
            headers: {
                'X-Algolia-Application-Id': APP_ID,
                'X-Algolia-API-Key': API_KEY,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        const json = JSON.parse(data);
                        resolve(json.results[0]);
                    } catch (e) {
                        reject(e);
                    }
                } else {
                    reject(new Error(`Algolia Error: ${res.statusCode} ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

function mapItem(hit) {
    let image = null;
    if (hit.media && hit.media.url) {
        image = hit.media.url;
    }
    
    let itemUrl = '';
    if (hit.objectNumber) {
        itemUrl = `https://www.philamuseum.org/collection/object/${hit.objectNumber}`;
    } else if (hit.href) {
        itemUrl = `https://www.philamuseum.org${hit.href}`;
    } else {
        itemUrl = `https://www.philamuseum.org/collection/object/${hit.objectID}`;
    }

    return {
        id: hit.objectNumber || hit.objectID,
        title: hit.title,
        artist: hit.artist,
        date: hit.dated || (hit.dateBegin ? String(hit.dateBegin) : ''),
        medium: hit.medium,
        classification: hit.classification,
        image: image,
        url: itemUrl,
        source: 'Philadelphia Museum of Art'
    };
}

let allItems = [];

async function scrapeRange(category, startYear, endYear) {
    const filters = `classification:"${category}" AND dateBegin >= ${startYear} AND dateBegin < ${endYear}`;
    
    // First, check count
    const result = await fetchAlgolia('collection', filters, 0);
    const count = result.nbHits;
    
    if (count === 0) return;

    if (count > 1000) {
        if (endYear - startYear <= 1) {
             console.warn(`  ! Range ${startYear}-${endYear} has ${count} items (>1000) but cannot be split further. Fetching what we can.`);
        } else {
            // console.log(`  Split: ${startYear}-${endYear} (${count} items)`);
            const mid = Math.floor((startYear + endYear) / 2);
            await scrapeRange(category, startYear, mid);
            await scrapeRange(category, mid, endYear);
            return;
        }
    }

    // Fetch all pages (likely 1)
    const totalPages = result.nbPages; 
    
    for (let p = 0; p < totalPages; p++) {
        let pageRes = (p === 0) ? result : await fetchAlgolia('collection', filters, p);
        const hits = pageRes.hits.map(mapItem);
        allItems = allItems.concat(hits);
        process.stdout.write(`  Fetched ${hits.length} items (${startYear}-${endYear}) [Total: ${allItems.length}]\r`);
    }
}

(async () => {
    
    for (const category of CATEGORIES) {
        console.log(`\n--- Scraping Category: ${category} ---`);
        
        // Items with dates
        await scrapeRange(category, 0, 2030); 
        await scrapeRange(category, -5000, 0);

        // Undated items
        const undatedFilters = `classification:"${category}" AND NOT dateBegin >= -10000`;
        const undatedRes = await fetchAlgolia('collection', undatedFilters, 0);
        if (undatedRes.nbHits > 0) {
             console.log(`\n  Fetching undated items (${undatedRes.nbHits})...`);
             const hits = undatedRes.hits.map(mapItem);
             allItems = allItems.concat(hits);
        }
        console.log(''); // newline
    }

    // Deduplicate
    const uniqueItems = [];
    const ids = new Set();
    let duplicates = 0;
    for (const item of allItems) {
        if (!ids.has(item.id)) {
            ids.add(item.id);
            uniqueItems.push(item);
        } else {
            duplicates++;
        }
    }

    console.log(`\n Total Raw: ${allItems.length}`);
    console.log(`Duplicates Removed: ${duplicates}`);
    console.log(`Unique Collected: ${uniqueItems.length}`);
    
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(uniqueItems, null, 2));
    console.log(`Saved to ${OUTPUT_FILE}`);

})();
