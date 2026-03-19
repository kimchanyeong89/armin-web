const axios = require('axios');

(async () => {
    // Maybe we need ALL of them?
    const url = 'https://my.tretyakov.ru/api/items?compilationId=153332&page=1&page_size=20&lang=en';
    try {
        const res = await axios.get(url, { validateStatus: () => true });
        console.log(`[${res.status}] ${url}`);
        if (res.status === 200) {
            console.log('   Keys:', Object.keys(res.data));
            if (res.data.data && res.data.data.items) {
                console.log('   Items:', res.data.data.items.length);
                if (res.data.data.items.length > 0) {
                    console.log('   Sample:', JSON.stringify(res.data.data.items[0], null, 2).substring(0, 300));
                }
            }
        }
    } catch (e) {
        console.log(e.message);
    }
})();
