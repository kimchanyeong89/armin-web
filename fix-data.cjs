const fs = require('fs');
const vgPath = 'public/data/vangogh-museum-collection.json';
const vgData = JSON.parse(fs.readFileSync(vgPath, 'utf8'));

const cleaned = [];
const seenKey = new Set();
for (const item of vgData) {
    let baseId = item.id;
    if (baseId && (baseId.endsWith('r') || baseId.endsWith('v'))) {
       baseId = baseId.slice(0, -1);
    }
    const key = baseId || item.title + (item.original_imageUrl || item.imageUrl);
    if (!seenKey.has(key)) {
        seenKey.add(key);
        cleaned.push(item);
    }
}
fs.writeFileSync(vgPath, JSON.stringify(cleaned, null, 2));
console.log('VG before:', vgData.length, 'After:', cleaned.length);

