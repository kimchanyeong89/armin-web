const axios = require('axios');

(async () => {
    // Try to get the "active blocks" which worked before.
    // It returned items with "code": "block2", etc.
    // Maybe one of these blocks contains the list of artworks?
    
    // Also, let's try to get the "banner" items.
    
    const urls = [
        'https://my.tretyakov.ru/api/activeblocks/?code=home-en&lang=en',
        'https://my.tretyakov.ru/api/v1/banner/get/?pageSize=10&lang=en',
        'https://my.tretyakov.ru/api/compilation/items/?show_on_main=y&page_size=10&lang=en&sort=index&order=asc'
    ];
    
    for (const url of urls) {
        try {
            const res = await axios.get(url);
            console.log(`\n[${res.status}] ${url}`);
            if (res.data && res.data.data) {
                const d = res.data.data;
                if (d.items) {
                    console.log(`Items: ${d.items.length}`);
                    if (d.items.length > 0) {
                        console.log('Sample:', JSON.stringify(d.items[0], null, 2).substring(0, 300));
                    }
                }
            }
        } catch (e) {
            console.log(`[ERR] ${url}: ${e.message}`);
        }
    }
})();
