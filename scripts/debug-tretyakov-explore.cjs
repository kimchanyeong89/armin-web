const axios = require('axios');

(async () => {
    // We found "Great Masters of Russian Art" [140149] but count is 0?
    // "Art Without Borders" [153332] has 50 items.
    
    // Let's try to get the items for 153332 again, but inspect the response structure more closely.
    // Maybe the items are nested differently or we need to query `api/compilation/get?id=...` to get the list of item IDs?
    
    // Actually, earlier `api/compilation/items?id=153332` returned 20 items which looked like sub-compilations (count: 50).
    // Wait, the Sample Item for `api/compilation/items?id=153332` was:
    // { "id": 153332, "name": "Art Without Borders...", "count": 50 }
    // This means the endpoint returned the compilation ITSELF as an item in a list?
    
    // If `api/compilation/items` searches for compilations, then `api/items` should search for items?
    // But `api/items` returned 400 Bad Request.
    
    // Let's try to find an endpoint that lists items by compilation ID.
    
    const id = 153332;
    const urls = [
        `https://my.tretyakov.ru/api/compilation/items?id=${id}&lang=en`, // Returns list of compilations?
        `https://my.tretyakov.ru/api/compilation/items?parent_id=${id}&lang=en`,
        `https://my.tretyakov.ru/api/compilation/items?compilation=${id}&lang=en`
    ];
    
    for (const url of urls) {
        try {
            const res = await axios.get(url);
            console.log(`\nURL: ${url}`);
            const items = res.data?.data?.items || [];
            console.log(`Items: ${items.length}`);
            if (items.length > 0) {
                console.log('Sample:', JSON.stringify(items[0], null, 2).substring(0, 300));
            }
        } catch (e) {
            console.log(`Error ${url}: ${e.message}`);
        }
    }

})();
