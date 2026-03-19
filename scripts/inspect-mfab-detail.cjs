const axios = require('axios');
const cheerio = require('cheerio');

const ID = "21";
const URL = `https://www.mfab.hu/artworks/${ID}/`;

async function run() {
    try {
        const { data } = await axios.get(URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const $ = cheerio.load(data);
        
        console.log('Title:', $('h1').text().trim());
        
        // Dump all text in main container to see structure
        // Assuming main content is in main or article
        const main = $('main');
        if (main.length) {
            console.log('Main content text sample:', main.text().substring(0, 500).replace(/\s+/g, ' '));
        }

        // Look for metadata keys
        const keys = ['Artist', 'Date', 'Medium', 'Material', 'Technique', 'Dimensions', 'Inventory number', 'Collection', 'Subject'];
        
        keys.forEach(k => {
            // Find elements containing the key
            // often dt, strong, b, or just text
            const el = $(`*:contains("${k}")`).last();
            if (el.length) {
                console.log(`Found "${k}":`, el.text().trim().substring(0, 100));
                console.log(`  Parent HTML:`, el.parent().html().substring(0, 200).replace(/\s+/g, ' '));
                console.log(`  Next Sibling Text:`, el.next().text().trim());
                console.log(`  Parent Text:`, el.parent().text().trim());
            }
        });

        // Image
        const img = $('meta[property="og:image"]').attr('content');
        console.log('OG Image:', img);

    } catch (e) {
        console.error(e);
    }
}

run();
