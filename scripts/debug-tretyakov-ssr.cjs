const axios = require('axios');
const fs = require('fs');
const path = require('path');

// We have a compilation ID: 153332
// We know `api/compilation/items?id=153332` returns the compilation metadata itself (count: 50).
// We need the ITEMS.

// Let's try to fetch the compilation page HTML and look for embedded JSON.
// Since Puppeteer failed (timeout/404?), let's try simple Axios GET on the page URL.

const URL = 'https://my.tretyakov.ru/compilations/exhibitions/153332/?lang=en';
const OUTPUT_FILE = path.join(__dirname, '../downloads/tretyakov-compilation.html');

(async () => {
    try {
        console.log(`Fetching ${URL}...`);
        const response = await axios.get(URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        fs.writeFileSync(OUTPUT_FILE, response.data);
        console.log(`Saved HTML to ${OUTPUT_FILE}`);
        
        // Check for __NEXT_DATA__
        if (response.data.includes('__NEXT_DATA__')) {
            console.log('✅ Found __NEXT_DATA__ in HTML!');
            const match = response.data.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/);
            if (match) {
                const json = JSON.parse(match[1]);
                console.log('Keys:', Object.keys(json));
                console.log('Props keys:', Object.keys(json.props));
                if (json.props.pageProps) {
                    console.log('PageProps keys:', Object.keys(json.props.pageProps));
                    // Look for items
                    const pp = json.props.pageProps;
                    if (pp.items) console.log('Items found in PageProps:', pp.items.length);
                    if (pp.compilation && pp.compilation.items) console.log('Items found in Compilation:', pp.compilation.items.length);
                    if (pp.data && pp.data.items) console.log('Items found in Data:', pp.data.items.length);
                }
            }
        } else {
            console.log('❌ __NEXT_DATA__ not found.');
        }
        
    } catch (e) {
        console.error(`Error: ${e.message}`);
    }
})();
