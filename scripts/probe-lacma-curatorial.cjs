const https = require('https');

const AREAS = [
    { id: 41, name: 'European Painting?' }, 
    { id: 39, name: 'Decorative Arts?' },
    { id: 33, name: 'Southeast Asian' },
    { id: 49, name: 'Modern' },
    { id: 32, name: 'American' }
];

async function getCount(aid) {
    return new Promise((resolve) => {
        // Just Use url with curatorial area filter
        // Note: Removing classification filter
        const url = `https://collections.lacma.org/search/site/?f[0]=bm_field_has_image:true&f[1]=im_field_curatorial_area:${aid}`;
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                const mk = data.match(/search-total">([\d,]+)/);
                resolve({ aid, count: mk ? mk[1] : '?', url });
            });
        });
    });
}

(async () => {
    for (const area of AREAS) {
        const res = await getCount(area.id);
        console.log(`Area ${area.id} (${area.name}): ${res.count}`);
    }
})();
