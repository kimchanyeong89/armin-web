const fs = require('fs');
const https = require('https');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/aic-collection.json');
const API_URL = 'https://api.artic.edu/api/v1/artworks/search';

// 1=Painting, 2=Photograph, 14=Drawing and Watercolor
const TARGET_TYPES = [1, 2, 14];

const PAGE_SIZE = 100;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchBatch(lastId = 0, retry = 0) {
    return new Promise(async (resolve, reject) => {
        const body = JSON.stringify({
            query: {
                bool: {
                    must: [
                        { "exists": { "field": "image_id" } },
                        { 
                            "bool": {
                                "should": TARGET_TYPES.map(id => ({ "term": { "artwork_type_id": id } })),
                                "minimum_should_match": 1
                            }
                        },
                        // Cursor-based pagination: fetch items with ID > lastId
                        { "range": { "id": { "gt": lastId } } }
                    ]
                }
            },
            fields: [
                "id", 
                "title", 
                "artist_display", 
                "date_display", 
                "medium_display", 
                "dimensions", 
                "image_id", 
                "thumbnail", 
                "is_on_view", 
                "is_public_domain", 
                "artwork_type_title"
            ],
            limit: PAGE_SIZE,
            sort: [
                { "id": "asc" }
            ]
        });

        const req = https.request(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Mimic browser slightly to avoid strict bot blocks
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', async () => {
                if (res.statusCode === 403 || res.statusCode === 429) {
                    if (retry < 5) {
                        const delay = 5000 * (retry + 1);
                        console.log(`\nRate limited (Status ${res.statusCode}). Waiting ${delay/1000}s then retrying (Attempt ${retry+1}/5)...`);
                        await sleep(delay);
                        return resolve(await fetchBatch(lastId, retry + 1));
                    }
                    console.error(`Error requesting batch (lastId=${lastId}): Status ${res.statusCode} after retries.`);
                    return resolve({ data: [], config: {} });
                }
                if (res.statusCode !== 200) {
                    console.error(`Error requesting batch (lastId=${lastId}): Status ${res.statusCode}`);
                    return resolve({ data: [], config: {} });
                }
                try {
                    const json = JSON.parse(data);
                    resolve(json);
                } catch (e) {
                    console.error('JSON parse error', e);
                    resolve({ data: [], config: {} });
                }
            });
        });

        req.on('error', (e) => {
            console.error('Request error', e);
            resolve({ data: [], config: {} });
        });

        req.write(body);
        req.end();
    });
}

function cleanArtist(artist) {
    if (!artist) return "Unknown Artist";
    // AIC artist_display often has newlines or dates.
    // e.g. "Vincent van Gogh\nDutch, 1853-1890"
    // We strictly want the NAME only for the main display, usually line 1.
    return artist.split('\n')[0].trim();
}

(async () => {
    console.log('Fetching Art Institute of Chicago collection (Deep Fetch Strategy)...');
    
    let allItems = [];
    let iiifUrl = "https://www.artic.edu/iiif/2"; 
    let lastId = 0;
    let pageCount = 0;

    while (true) {
        pageCount++;
        process.stdout.write(`Batch ${pageCount} (Last ID: ${lastId})... `);
        
        const res = await fetchBatch(lastId);
        
        if (res.config && res.config.iiif_url) {
            iiifUrl = res.config.iiif_url;
        }

        const items = res.data || [];
        if (items.length === 0) {
            console.log('\nNo more items. Download complete.');
            break;
        }
        
        const mapped = items.map(i => ({
            id: String(i.id),
            title: i.title,
            artist: cleanArtist(i.artist_display),
            date: i.date_display,
            medium: i.medium_display,
            dimensions: i.dimensions,
            // Construct IIIF URL. full/843,/0/default.jpg is a good standard size.
            imageUrl: `${iiifUrl}/${i.image_id}/full/843,/0/default.jpg`,
            // Also store thumbnail info if needed later
            thumbnail: i.thumbnail,
            category: i.artwork_type_title,
            onView: i.is_on_view,
            publicDomain: i.is_public_domain,
            sourceUrl: `https://www.artic.edu/artworks/${i.id}`
        }));

        allItems = allItems.concat(mapped);
        
        // Update cursor
        lastId = items[items.length - 1].id;
        
        console.log(`+${mapped.length} items. Total: ${allItems.length}`);
        
        // Delay to prevent rate limiting
        await sleep(500); 
    }

    console.log(`\nSaving ${allItems.length} items to ${OUTPUT_FILE}...`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
    
    // Stats
    console.log('Stats:');
    console.log('Total:', allItems.length);
    console.log('On View:', allItems.filter(i => i.onView).length);
    console.log('Public Domain:', allItems.filter(i => i.publicDomain).length);
    
})();