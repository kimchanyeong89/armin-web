const axios = require('axios');

(async () => {
    try {
        // Try filtering by filtering by type ID for 'obraz' (100489)
        const url = 'https://api-zbiory.mnk.pl/api/search/Object/page/1?maxPerPage=1&filter[types][]=100489';
        console.log('Fetching:', url);
        const resp = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
            }
        });
        
        console.log('Total Items for "obraz":', resp.data.data.paginatorDetails.totalItemsCount);

    } catch (e) {
        console.error(e.response ? e.response.status : e.message);
    }
})();
