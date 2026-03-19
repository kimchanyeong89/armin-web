const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const limit = require('p-limit').default || require('p-limit');

const FILE = 'public/data/nasjonal-collection.json';

async function enrich() {
    if (!fs.existsSync(FILE)) {
        console.error("File not found: " + FILE);
        return;
    }
    const raw = JSON.parse(fs.readFileSync(FILE));
    
    // Filter duplicates and valid
    const clean = [];
    const seen = new Set();
    for(const r of raw) {
        if(!seen.has(r.url) && r.url) {
            seen.add(r.url);
            clean.push(r);
        }
    }
    
    console.log(`Enriching ${clean.length} items...`);
    const limiter = limit(20); // Parallel 20
    let completed = 0;
    
    const tasks = clean.map((item, i) => limiter(async () => {
        // Skip if already enriched
        if (item.dimensions || (item.medium && item.date)) {
            completed++;
            if (completed % 500 === 0) console.log(`[${completed}/${clean.length}] Already enriched.`);
            return;
        }

        try {
            console.log(`[${i+1}/${clean.length}] Fetching ${item.url}`);
            const { data } = await axios.get(item.url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 30000
            });
            const $ = cheerio.load(data);
            
            // 1. Refine Title
            // Remove subtitle spans (e.g. " other", " original title")
            const h1 = $('h1').first();
            h1.find('.subtitle').remove();
            const pageTitle = h1.text().trim();
            if (pageTitle) item.title = pageTitle;
            
            // 2. Artist 
            // Often in a 'dl' with 'Artist' or separate link
            // Try specific link for producer first
            let artist = $('a[href*="/collection/producer/"]').first().text().trim();
            if (!artist) {
                // Try finding dd for dt 'Artist' or 'Kunstner'
                artist = getDtValue($, ['Artist', 'Kunstner', 'Maker']);
            }
            if (artist) item.artist = artist;

            // 3. Date
            const date = getDtValue($, ['Creation date', 'Datering', 'Date']);
            if (date) item.date = date;
            
            // 4. Material / Medium
            const material = getDtValue($, ['Materials and techniques', 'Material/Technique', 'Materiale/teknikk', 'Technique', 'Teknikk', 'Medium', 'Material']);
            if (material) {
                item.medium = material;
            }

            // 5. Dimensions
            const dims = getDtValue($, ['Dimensions', 'Mål']);
            if (dims) item.dimensions = dims;

            // 6. Type (Correcting 'Painting' default)
            const type = getDtValue($, ['Object type', 'Betegnelse', 'Type']);
            if (type) item.type = type;

            // 7. Fallback for description/meta
            item.description = $('meta[property="og:description"]').attr('content') || '';

        } catch(e) {
            console.error(`Error ${item.url}: ${e.message}`);
        } finally {
            completed++;
            if (completed % 50 === 0) {
                console.log(`Saving progress at ${completed}/${clean.length}...`);
                fs.writeFileSync(FILE, JSON.stringify(clean, null, 2));
            }
        }
    }));
    
    await Promise.all(tasks);
    
    fs.writeFileSync(FILE, JSON.stringify(clean, null, 2));
    console.log(`Done. Saved ${clean.length} items to ${FILE}`);
}

// Helper to find DD siblings of DT headers
function getDtValue($, candidates) {
    for (const term of candidates) {
        // Find dt that contains term
        const dt = $('dt').filter((i, el) => $(el).text().trim().includes(term));
        if (dt.length) {
            return dt.next('dd').text().trim().replace(/\s+/g, ' ');
        }
    }
    return '';
}

enrich();
