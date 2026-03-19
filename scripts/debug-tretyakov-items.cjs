const axios = require('axios');

(async () => {
    // It seems `api/compilation/items` just lists compilations, and ignores the ID param or treats it as a filter that isn't working as expected (returning list of 20).
    
    // Let's go back to the browser trace idea.
    // The browser requests: `https://my.tretyakov.ru/api/compilation/items/?show_on_main=y...`
    
    // If we click on a compilation in the UI, what request does it make?
    // We can't see that without a browser.
    
    // However, we saw `api/items` returned 400. This usually means missing parameters.
    // Let's try to guess the parameters for `api/items`.
    
    const base = 'https://my.tretyakov.ru/api/items';
    const paramsList = [
        '?compilationId=153332',
        '?compilation_id=153332',
        '?id=153332', // Unlikely
        '?section_id=153332',
        '?category=153332',
        '?type=artworks',
        '?q=repin', // Search?
        '?sort=name',
        '?page=1',
        '?page_size=10'
    ];
    
    for (const p of paramsList) {
        const url = `${base}${p}&lang=en`;
        try {
            const res = await axios.get(url, { validateStatus: () => true });
            console.log(`[${res.status}] ${url}`);
            if (res.status === 200) {
                 console.log('   Success!');
                 console.log('   Keys:', Object.keys(res.data));
            }
        } catch (e) {
            console.log(`[ERR] ${url}`);
        }
    }
})();
