const axios = require('axios');

(async () => {
    // Try to get items INSIDE the compilation (which seems to be a list of compilations itself??)
    // The previous result showed items with "count": 50, which suggests it's a list of sub-collections or exhibitions.
    
    // Let's try to find how to get the ACTUAL artworks from one of these items.
    // The link is "/compilations/exhibitions/153332/?lang=en"
    
    // Maybe the ID 153332 is the compilation ID, and we need to fetch items FOR that compilation.
    // But we just did that: `api/compilation/items?id=153332` returned a list of compilations (including itself??).
    
    // Wait, the sample item has ID 153332, which MATCHES the ID we queried.
    // This means `api/compilation/items?id=X` returns a list of compilations related to X or just X itself in a list?
    // And "count": 50 implies there are 50 artworks inside.
    
    // We need to find the endpoint that returns the 50 artworks for ID 153332.
    
    const id = 153332;
    const base = 'https://my.tretyakov.ru/api';
    
    const patterns = [
        `${base}/compilation/items/${id}?lang=en`,
        `${base}/compilation/${id}/artworks?lang=en`,
        `${base}/compilation/${id}/items?lang=en`,
        `${base}/items?compilation=${id}&lang=en`,
        `${base}/items?compilationId=${id}&lang=en`,
        // Maybe the endpoint we found IS the right one but we need different params to get artworks?
        `${base}/compilation/items?id=${id}&type=artworks&lang=en`,
        // Maybe we need to query a specific "exhibition" endpoint
        `${base}/exhibition/items?id=${id}&lang=en`
    ];

    for (const url of patterns) {
        try {
            const response = await axios.get(url, { validateStatus: () => true });
            console.log(`[${response.status}] ${url}`);
            if (response.status === 200 && response.data.data) {
                const d = response.data.data;
                if (d.items && d.items.length > 0) {
                    console.log('   First item keys:', Object.keys(d.items[0]));
                    // Check if it looks like an artwork (has "author", "year", etc instead of "count")
                    if (!d.items[0].count) {
                        console.log('   >>> FOUND ARTWORKS? <<<');
                        console.log('   Sample:', JSON.stringify(d.items[0], null, 2).substring(0, 200));
                    }
                }
            }
        } catch (e) {
            console.log(`[ERR] ${url}`);
        }
    }
})();
