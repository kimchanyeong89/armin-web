const fs = require('fs');

const file = 'public/data/vangogh-museum-collection.json';
let data = JSON.parse(fs.readFileSync(file, 'utf8'));

// The user suspects that the same actual painting is appearing twice due to translation 
// or duplicate entries in vanguard data. Wait, earlier we checked 'id' and they were all unique (3994/3994).
// Let's examine the identical 'imageUrls'.

const uniqueUrlData = [];
const seenUrls = new Set();
// some ids also might be duplicated by translation like s0004V1962, let's keep track by original image url since our scrape gives unique imageUrls to each item
let removed = 0;

for (const item of data) {
    const imgKey = item.original_imageUrl;
    
    // We want to skip if the original_image URL is the same. 
    // This handles duplicates scraped from different endpoints that point to the exact same image
    if (imgKey && seenUrls.has(imgKey)) {
        removed++;
        continue;
    }
    
    if (imgKey) seenUrls.add(imgKey);
    uniqueUrlData.push(item);
}

fs.writeFileSync(file, JSON.stringify(uniqueUrlData, null, 2));
console.log(`Van Gogh removed by identical image: ${removed}\nRemaining: ${uniqueUrlData.length}`);
