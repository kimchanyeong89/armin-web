const axios = require('axios');

async function checkType(term) {
    try {
        const url = `https://api-zbiory.mnk.pl/api/search/Object/page/1?maxPerPage=1&filter[phrase]=${encodeURIComponent(term)}`;
        const resp = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (resp.data.data.items.length > 0) {
            const types = resp.data.data.items[0].types;
            console.log(`Term: "${term}" -> Types:`, JSON.stringify(types));
        } else {
            console.log(`Term: "${term}" -> No results`);
        }
    } catch (e) { console.error(e.message); }
}

(async () => {
    await checkType('rysunek');
    await checkType('plakat');
    await checkType('fotografia');
    await checkType('grafika'); // Print/Graphic
    await checkType('pastel');
    await checkType('szkic'); // Sketch
    await checkType('akwarela'); // Watercolor
})();
