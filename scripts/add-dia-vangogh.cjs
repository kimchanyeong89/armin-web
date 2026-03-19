const cheerio = require('cheerio');
const https = require('https');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/dia-collection.json');

// Targeted search for Van Gogh
const BASE_URL = "https://dia.org/search/collection?keys=Vincent+van+Gogh&with_image=1&sort_by=relevance&on_view=0&f%5B0%5D=classification%3A4205";

async function fetchPage(page) {
    return new Promise((resolve, reject) => {
        const url = `${BASE_URL}&page=${page}`;
        console.log(`Fetching ${url}`);
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
                const parts = srcset.split(',');
                const last = parts[parts.length - 1].trim(); 
                const urlPart = last.split(' ')[0];
                img = urlPart;
            }
        }
        
        let artist = $(el).find('.carousel_item_body p').first().text().trim();
        const date = $(el).find('.field--name-field-date').text().trim();
        
        if (!title || !link) return;
        
        const id = link.split('-').pop(); 
        
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
    let existingItems = [];
    try {
        if (fs.existsSync(OUTPUT_FILE)) {
            existingItems = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
            console.log(`Loaded ${existingItems.length} existing items.`);
        }
    } catch (e) {
        console.log('No existing file found or error reading it.');
    }

    const startCount = existingItems.length;

    // Fetch targeted Van Gogh items
    let page = 0;
    const MAX_PAGES = 5; 
    let hasNext = true;
    let foundNew = 0;

    console.log('Starting targeted scrape for Vincent van Gogh...');

    while (hasNext && page < MAX_PAGES) {
        try {
            const html = await fetchPage(page);
            const items = parseItems(html);
            
            if (items.length === 0) {
                console.log('No items found on this page. Stopping.');
                hasNext = false;
                break;
            }
            
            // Deduplicate and Add
            for (const item of items) {
                // Check exact ID match or title+artist match
                const exists = existingItems.some(ex => ex.id === item.id || (ex.title === item.title && ex.artist === item.artist));
                
                if (!exists) {
                     // Check if it's really Van Gogh (search might be fuzzy)
                     if (item.artist.includes('Gogh')) {
                        console.log(`Adding new item: ${item.title}`);
                        existingItems.push(item);
                        foundNew++;
                     } else {
                         console.log(`Skipping non-Gogh item: ${item.artist} - ${item.title}`);
                     }
                } else {
                    // Update image if better?
                    // console.log(`Item exists: ${item.title}`);
                }
            }
            
            page++;
            if (items.length < 10) { // Default page size is likely 10-20
                // hasNext = false; 
            }
            
            if (!html.includes('Go to next page') && !html.includes('rel="next"')) {
                hasNext = false;
            }

            // Be nice
            await new Promise(r => setTimeout(r, 1000));

        } catch (e) {
            console.error('Error fetching page:', e);
            hasNext = false;
        }
    }

    console.log(`Added ${foundNew} new items.`);
    if (foundNew > 0) {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(existingItems, null, 2));
        console.log(`Updated ${OUTPUT_FILE} with total ${existingItems.length} items.`);
    } else {
        console.log('No new items to save.');
    }

})();