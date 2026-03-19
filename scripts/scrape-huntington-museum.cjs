const fs = require('fs');
const path = require('path');
const https = require('https');

const OUTPUT_FILE = path.join(__dirname, '../public/data/huntington-collection.json');
const API_URL = 'https://www.huntington.org/api/search/collections';
const PAGE_SIZE = 100; // Algolia usually allows up to 1000, but let's stick to safe 100
const DELAY_MS = 200;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchPage(page) {
    return new Promise((resolve, reject) => {
        const payload = [{
            indexName: "huntington",
            params: {
                facetFilters: [
                    ["division:museum"],
                    ["type:Paintings"],
                    ["hasImage:Results with images"]
                ],
                hitsPerPage: PAGE_SIZE,
                page: page,
                query: ""
            }
        }];

        const dataInfo = JSON.stringify(payload);
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
            }
        };

        const req = https.request(API_URL, options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        const json = JSON.parse(body);
                        resolve(json);
                    } catch (e) {
                        reject(e);
                    }
                } else {
                    reject(new Error(`Status ${res.statusCode}: ${body}`));
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(dataInfo);
        req.end();
    });
}

(async () => {
    let allItems = [];
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            console.log('Loading existing data...');
            allItems = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
            console.log(`Loaded ${allItems.length} items.`);
        } catch (e) {
            console.warn('Could not load existing file, starting fresh.');
        }
    }

    // Determine start page. If we have N items, and page size is P, we've likely fetched ceil(N/P) pages.
    // However, since we are doing a "fresh" simplistic scrape logic (append new), 
    // real resumability without overlapping dupes would require checking IDs.
    // For now, let's just start from page 0 and filter duplicates at the end, or overwrite if requested.
    // Given the request, I'll support a simple "start from scratch" or "continue from page X" if I implemented arguments,
    // but the safest for this size (7000 items) is to just run it through.
    
    // To implement robust resume: map existing IDs.
    const existingIds = new Set(allItems.map(i => i.objectID));
    
    // We'll just fetch everything and update/add. 70 pages is fast.
    let page = 0;
    let totalPages = 1; // provisional

    while (page < totalPages) {
        console.log(`Fetching page ${page}...`);
        try {
            const response = await fetchPage(page);
            const result = response.results[0];
            
            if (!result) {
                console.error('Invalid response format');
                break;
            }

            totalPages = result.nbPages;
            const hits = result.hits;
            
            console.log(`  Got ${hits.length} hits (Total pages: ${totalPages})`);

            for (const hit of hits) {
                // Determine if we need to update or add
                if (existingIds.has(hit.objectID)) {
                    // Start update logic if needed, or just ignore. 
                    // Let's replace the item in the array for freshness
                    const idx = allItems.findIndex(i => i.objectID === hit.objectID);
                    if (idx !== -1) {
                         allItems[idx] = hit;
                    }
                } else {
                    allItems.push(hit);
                    existingIds.add(hit.objectID);
                }
            }

            // Save periodically
            if (page % 5 === 0) {
                fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
                console.log(`  Saved ${allItems.length} items to disk.`);
            }

            page++;
            await sleep(DELAY_MS);

        } catch (e) {
            console.error(`Error fetching page ${page}:`, e);
            console.log('Retrying in 5 seconds...');
            await sleep(5000);
            // Don't increment page, try again
        }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
    console.log(`Done. Total items: ${allItems.length}`);

})();
