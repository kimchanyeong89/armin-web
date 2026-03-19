const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://fine-arts-museum.be/fr/la-collection';
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

async function research() {
    console.log("=== 1. Checking Total Count text ===");
    try {
        const { data: homeHtml } = await axios.get(BASE_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(homeHtml);
        const bodyText = $('body').text();
        const match = bodyText.match(/recense actuellement plus de ([\d\s\.]+)/);
        if (match) {
            console.log(`[Confirmed] Site claims to have: ${match[1]} items.`);
        } else {
            console.log("[Warning] Could not find total count text.");
        }
    } catch(e) { console.error("Home fetch failed:", e.message); }

    console.log("\n=== 2. Probing Deep Pagination ===");
    const testPages = [50, 51, 100, 200];
    for(const p of testPages) {
        try {
            const url = `${BASE_URL}?page=${p}`;
            const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const $ = cheerio.load(data);
            const items = $('a.artwork').length;
            console.log(`Page ${p}: Found ${items} items.`);
            if (items > 0) {
                 const first = $('a.artwork').first().attr('href');
                 console.log(`   Sample: ${first}`);
            }
        } catch(e) {
            console.log(`Page ${p}: Error ${e.message}`);
        }
    }

    console.log("\n=== 3. Checking Letter 'A' ===");
    try {
        const url = `${BASE_URL}/letter/a`;
        const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(data);
        
        // Count items on page 1 of A
        const items = $('a.artwork').length;
        console.log(`Letter 'A' Page 1: ${items} items.`);
        
        // Check pagination for A
        let maxPageA = 1;
        $('.pagination a').each((i, el) => {
             const href = $(el).attr('href');
             if(href && href.includes('page=')) {
                 const m = href.match(/page=(\d+)/);
                 if(m) maxPageA = Math.max(maxPageA, parseInt(m[1]));
             }
        });
        console.log(`Letter 'A' max detected page: ${maxPageA}`);
        
    } catch(e) { console.error("Letter A check failed:", e.message); }
}

research();
