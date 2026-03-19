const axios = require('axios');
const cheerio = require('cheerio');

const URL = 'https://www.nasjonalmuseet.no/en/collection/search/?object-name=painting';

async function research() {
    console.log("Fetching Nasjonalmuseet search page...");
    try {
        const { data } = await axios.get(URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(data);
        const articles = $('article').length;
        const links = $('a').length;
        
        console.log(`HTML Length: ${data.length}`);
        console.log(`Found ${articles} <article> elements.`);
        
        // Check for specific "painting" items
        const paintingLinks = [];
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.includes('/collection/object/')) {
                paintingLinks.push(href);
            }
        });
        
        console.log(`Found ${paintingLinks.length} object links.`);
        if (paintingLinks.length > 0) {
            console.log("Sample links:", paintingLinks.slice(0, 3));
        }

        // Check for client-side data
        const scripts = $('script').map((i, el) => $(el).html()).get();
        const nextData = scripts.find(s => s.includes('__NEXT_DATA__') || s.includes('initialState'));
        
        if (nextData) {
            console.log("Found embedded JSON data (React/Next.js/Redux)!");
            console.log(nextData.substring(0, 200) + "...");
        } else {
            console.log("No obvious embedded JSON found.");
        }
        
    } catch (e) {
        console.error("Error fetching:", e.message);
    }
}

research();
