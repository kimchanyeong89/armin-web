const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/mah-collection.json');
const BACKUP_FILE = path.join(__dirname, `../public/data/mah-collection-${Date.now()}.json`);

// Configuration
const BASE_URL = 'https://www.mahmah.ch/views/ajax';
const INITIAL_URL = 'https://www.mahmah.ch/collection/recherche';
const MAX_PAGES = 50; // 50 pages * ~20 items = 1000 items. Adjust as needed.
const DELAY_MS = 1000;

// Default Params (fallbacks, will try to scrape fresh ones)
let VIEW_DOM_ID = 'b15d35bd49faf2834d21d6a11c2954dbb5d747024bc1aef8e3a937c163b71441';
const VIEW_NAME = 'search_results';
const VIEW_DISPLAY_ID = 'page_4';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchInitialParams() {
    console.log(`Fetching initial page: ${INITIAL_URL}...`);
    try {
        const response = await axios.get(INITIAL_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const html = response.data;
        
        // Regex to find view_dom_id inside drupalSettings
        // Pattern: "view_dom_id":"(hash)"
        const match = html.match(/"view_dom_id":"([a-f0-9]+)"/);
        if (match && match[1]) {
            VIEW_DOM_ID = match[1];
            console.log(`Found VIEW_DOM_ID: ${VIEW_DOM_ID}`);
        } else {
            console.warn('Could not extract VIEW_DOM_ID from HTML, using default/fallback.');
        }
        return response.headers['set-cookie'];
    } catch (error) {
        console.error('Error fetching initial page:', error.message);
        return null;
    }
}

async function scrapePage(pageIndex, cookies) {
    console.log(`Scraping page ${pageIndex}...`);
    const params = new URLSearchParams({
        view_name: VIEW_NAME,
        view_display_id: VIEW_DISPLAY_ID,
        view_dom_id: VIEW_DOM_ID,
        page: pageIndex.toString(),
        _drupal_ajax: '1'
    });

    try {
        const response = await axios.post(BASE_URL, params.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': cookies ? cookies.join('; ') : ''
            }
        });

        const commands = response.data;
        if (!Array.isArray(commands)) {
            console.warn('Response is not an array of commands');
            return [];
        }

        // Find insert command
        const insertCmd = commands.find(c => c.command === 'insert' && c.method === 'replaceWith' && c.data && c.data.includes('mah-artwork'));
        // Fallback: sometimes method might differ or selector?
        // In debug, method was 'replaceWith' and selector matched view-dom-id.
        // Also look for any insert with mah-artwork
        
        const contentCmd = commands.find(c => c.command === 'insert' && c.data && typeof c.data === 'string' && c.data.includes('mah-artwork'));

        if (!contentCmd) {
            console.warn('No content insert command found.');
            return [];
        }

        const $ = cheerio.load(contentCmd.data);
        const items = [];

        $('.mah-artwork').each((i, el) => {
            const $el = $(el);
            const id = $el.attr('data-id');
            const title = $el.find('.artwork-title a').text().trim();
            const link = $el.find('.artwork-title a').attr('href'); // e.g. /collection/oeuvres/...
            const image = $el.find('img.mah-picture__image').attr('src');
            const author = $el.find('.author').text().trim();
            const date = $el.find('.mah-artwork-content .date').text().trim().replace(/\s+/g, ' ');

            if (id && title) {
                // Construct full URLs
                const fullLink = link ? `https://www.mahmah.ch${link}` : '';
                const fullImage = image ? `https://www.mahmah.ch${image}` : '';

                items.push({
                    id,
                    title: title, // Keep clean
                    artist: author,
                    date: date, // Rename dateString -> date
                    image: fullImage,
                    link: fullLink,
                    source: 'Musée d\'Art et d\'Histoire Genève'
                });
            }
        });

        return items;

    } catch (error) {
        console.error(`Error scraping page ${pageIndex}:`, error.message);
        return [];
    }
}

async function main() {
    const cookies = await fetchInitialParams();
    let allItems = [];

    for (let page = 0; page < MAX_PAGES; page++) {
        const items = await scrapePage(page, cookies);
        if (items.length === 0) {
            console.log('No items found on page', page, '- stopping.');
            break;
        }
        console.log(`Found ${items.length} items on page ${page}.`);
        allItems = allItems.concat(items);
        await sleep(DELAY_MS);
    }

    console.log(`Total items scraped: ${allItems.length}`);

    // Save
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(allItems, null, 2));
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2)); // Overwrite main file
    console.log(`Saved to ${OUTPUT_FILE}`);
}

main();
