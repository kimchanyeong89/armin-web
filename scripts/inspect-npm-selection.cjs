const cheerio = require('cheerio');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const URL = "https://theme.npm.edu.tw/selection/Category.aspx?sNo=03000117&lang=2";

async function main() {
    const res = await fetch(URL, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
        }
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    const items = $('.item');
    console.log(`Found ${items.length} items on page 1.`);

    // Check pagination
    // Usually pagination is in .pager or similar, or just numbered links
    const pages = $('.pagination a, .pages a, a[href*="page="]').length;
    console.log(`Found ${pages} pagination links?`);

    // Print first item details
    if (items.length > 0) {
        const first = $(items[0]);
        const link = first.find('a').attr('href');
        const title = first.find('.title').text().trim();
        const owner = first.find('.owner').text().trim(); // Artist?
        console.log(`Reference Item: ${title} (${owner}) -> ${link}`);
    }
}

main();
