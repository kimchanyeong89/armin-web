const axios = require('axios');

(async () => {
    try {
        // Guessing detail endpoint
        const endpoints = [
            'https://api-zbiory.mnk.pl/api/object/157417',
            'https://api-zbiory.mnk.pl/api/catalog/Object/157417',
            'https://api-zbiory.mnk.pl/api/search/Object/157417'
        ];

        for (const url of endpoints) {
            try {
                console.log('Trying:', url);
                const resp = await axios.get(url, { headers: { 'User-Agent': 'Bot' } });
                console.log('SUCCESS:', url);
                console.log(resp.data);
                break;
            } catch (e) {
                console.log('Failed:', url, e.response ? e.response.status : e.message);
            }
        }
    } catch (e) { console.error(e); }
})();
