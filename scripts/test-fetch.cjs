
const fs = require('fs');

async function test() {
    const url = "https://www.wikidata.org/w/api.php?action=wbsearchentities&search=Pablo%20Picasso&language=en&limit=1&format=json&origin=*";
    console.log("Fetching:", url);
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'ArminWebBot/1.0 (armin@example.com)' }
        });
        console.log("Status:", res.status);
        const text = await res.text();
        console.log("Body:", text.substring(0, 200));
        const json = JSON.parse(text);
        console.log("Search results:", json.search ? json.search.length : "No search field");
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}

test();
