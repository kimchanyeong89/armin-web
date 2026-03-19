const fs = require('fs');

async function testApi() {
    const url = "https://musee-matisse.opacweb.io/api/v2/notices/search?onlineFilter=online&items_per_page=10&page=1&query=&onlyHasImage=true";
    console.log(`Fetching ${url}...`);

    try {
        const response = await fetch(url);
        const data = await response.json();
        console.log("Total items:", data.total_items); // Guessing field name
        console.log("Items count:", data.items ? data.items.length : data.length);
        fs.writeFileSync('matisse-api-sample.json', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
}

testApi();
