const fs = require('fs');
const content = fs.readFileSync('./public/data/albertina-paintings-100.json', 'utf8');
const data = JSON.parse(content);
const items = data.objects;
let safeCount = 0;
items.forEach(item => {
    const url = item.imageUrl || item.image || item.image_url || item.thumbnail || (item.images && item.images[0]) || '';
    const uStr = String(url);
    if (uStr.includes('r2.dev') || uStr.includes('armin-r2') || uStr.includes('wsrv.nl')) {
        safeCount++;
    }
});
console.log("safeCount:", safeCount);
