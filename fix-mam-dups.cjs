const fs = require('fs');

const file = 'public/data/mam-collection.json';
let data = JSON.parse(fs.readFileSync(file, 'utf8'));

const uniqueUrlData = [];
const seenUrls = new Set();
let removed = 0;

for (const item of data) {
    // some artworks have the exact same original_imageUrl or imageUrl?
    const imgKey = item.imageUrl || item.image || item.thumbnail;
    
    // allow items with NO image
    if (imgKey && imgKey !== "") {
        if (seenUrls.has(imgKey)) {
            removed++;
            continue;
        }
        seenUrls.add(imgKey);
    }
    
    uniqueUrlData.push(item);
}

fs.writeFileSync(file, JSON.stringify(uniqueUrlData, null, 2));
console.log(`MAM removed by identical image: ${removed}\nRemaining: ${uniqueUrlData.length}`);
