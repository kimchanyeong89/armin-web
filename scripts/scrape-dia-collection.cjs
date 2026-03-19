const cheerio = require('cheerio');
const https = require('https');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/dia-collection.json');
// f[0]=classification:4205 -> Paintings
const BASE_URL = "https://dia.org/search/collection?keys=&with_image=1&sort_by=relevance&on_view=0&f%5B0%5D=classification%3A4205";

async function fetchPage(page) {
    return new Promise((resolve, reject) => {
        const url = `${BASE_URL}&page=${page}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function parseItems(html) {
    const $ = cheerio.load(html);
    const items = [];
    
    $('.views-row').each((i, el) => {
        const title = $(el).find('.title span').text().trim() || $(el).find('.title').text().trim();
        const link = $(el).find('.image a').attr('href');
        let img = $(el).find('.image img').attr('src');
        
        if (!img) {
            const srcset = $(el).find('.image img').attr('srcset');
            if (srcset) {
                // e.g. "url 1x, url 2x"
                // take the last one (biggest) or first one
                const parts = srcset.split(',');
                const last = parts[parts.length - 1].trim(); // "url 2x"
                const urlPart = last.split(' ')[0];
                img = urlPart;
            }
        }
        
        // Handle srcset/widen.net
        // e.g. https://dia.widen.net/content/od2lr1erzf/webp/2009.87-d1.webp?w=450&quality=50
        // We probably want a larger one if possible, but the src is usually fine.
        
        let artist = $(el).find('.carousel_item_body p').first().text().trim();
        const date = $(el).find('.field--name-field-date').text().trim();
        
        if (!title || !link) return;
        
        const id = link.split('-').pop(); // e.g. /collection/title-12345 -> 12345
        
        items.push({
            id: id,
            title: title,
            artist: artist,
            date: date,
            medium: 'Painting',
            classification: 'Paintings',
            image: img,
            url: `https://dia.org${link}`,
            source: 'Detroit Institute of Arts'
        });
    });
    return items;
}

(async () => {
    let allItems = [];
    let page = 0;
    const MAX_PAGES = 1000; // Increase limit significantly
    let hasNext = true;

    while (hasNext && page < MAX_PAGES) {
        process.stdout.write(`Fetching page ${page}... `);
        try {
            const html = await fetchPage(page);
            const items = parseItems(html);
            
            if (items.length === 0) {
                console.log('No items found. Stopping.');
                hasNext = false;
                break;
            }
            
            allItems = allItems.concat(items);
            console.log(`Found ${items.length} items.`);
            
            page++;
            // Check for next link? 
            // If items < 10 (or whatever page size), we are probably done.
            // Page size seems to be 30.
            if (items.length < 10) {
                // hasNext = false; // unsafe assumption?
            }
            
            // Simple check: if "Go to next page" link exists
            if (!html.includes('Go to next page') && !html.includes('rel="next"')) {
                console.log('No next page link found.');
                hasNext = false;
            }
            
        } catch (e) {
            console.error(e);
            break;
        }
        
        // Polite delay
        await new Promise(r => setTimeout(r, 500));
    }

    // Dedup
    const unique = [];
    const ids = new Set();
    for (const item of allItems) {
        if (!ids.has(item.id)) {
            ids.add(item.id);
            unique.push(item);
        }
    }
    
    console.log(`Total Scraped: ${allItems.length}`);
    console.log(`Unique: ${unique.length}`);
    
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(unique, null, 2));
    console.log(`Saved to ${OUTPUT_FILE}`);
    
})();
