const axios = require('axios');

(async () => {
    try {
        const url = 'https://api-zbiory.mnk.pl/api/search/Object/page/1?maxPerPage=100';
        console.log('Fetching:', url);
        const resp = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
            }
        });
        
        console.log('Total Items:', resp.data.data.paginatorDetails.totalItemsCount);
        console.log('Sample Item:', JSON.stringify(resp.data.data.items[0], null, 2));
        
        // Check for filters/facets in response if any
        if (resp.data.data.extraData) {
            console.log('Extra Data:', JSON.stringify(resp.data.data.extraData, null, 2));
        }

    } catch (e) {
        console.error(e);
    }
})();
