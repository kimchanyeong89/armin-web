const axios = require('axios');

const BASE_URL = 'https://api-zbiory.mnk.pl/api/search/Object/page/1';
const HEADERS = {
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    'Referer': 'https://zbiory.mnk.pl/'
};

async function getCount(params) {
    try {
        const res = await axios.get(BASE_URL, { params: { ...params, maxPerPage: 1 }, headers: HEADERS });
        return res.data.data.paginatorDetails.totalItemsCount;
    } catch (e) {
        console.error('Error fetching count:', e.message);
        return -1;
    }
}

(async () => {
    console.log('--- Sampling random pages for Types ---');
    const typeMap = new Map();
    // Pre-populate with known IDs/names to check
    typeMap.set(100489, 'painting');
    typeMap.set(100003, 'sculpture');

    // Fetch pages 1, 10, 100, 1000 to get variety
    const pages = [1, 10, 100, 500, 1000];
    
    for (const page of pages) {
        try {
            console.log(`Fetching page ${page}...`);
            const url = `https://api-zbiory.mnk.pl/api/search/Object/page/${page}`;
            const res = await axios.get(url, { 
                params: { maxPerPage: 20, 'Accept-Language': 'en' }, 
                headers: HEADERS 
            });
            const items = res.data.data.items;
            if(items) {
                items.forEach(item => {
                    if(item.types) {
                        item.types.forEach(t => typeMap.set(t.id, t.name));
                    }
                });
            }
        } catch(e) { console.error(e.message); }
    }

    console.log('Types found:', Object.fromEntries(typeMap));
    
    // Check counts for each found type
    for (const [id, name] of typeMap.entries()) {
        const c = await getCount({ 'filter[types][]': id });
        console.log(`Type: ${name} (${id}) -> Count: ${c}`);
    }

})();
