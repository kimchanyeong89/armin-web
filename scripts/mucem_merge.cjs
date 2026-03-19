const fs = require('fs');

let mainData = JSON.parse(fs.readFileSync('public/data/mucem-collection.json'));
let fineArtsData = JSON.parse(fs.readFileSync('public/data/mucem-fine-arts-collection.json'));

let mainItems = Array.isArray(mainData) ? mainData : (mainData.objects || mainData.items || mainData.artworks || []);
let fineArtsItems = Array.isArray(fineArtsData) ? fineArtsData : (fineArtsData.objects || fineArtsData.items || fineArtsData.artworks || []);

// Merge
let merged = [...mainItems];

// Dedup tracking by ID
let seenIds = new Set(merged.map(i => i.id || i.objectID));

for(let item of fineArtsItems) {
    if(!seenIds.has(item.id || item.objectID)) {
        merged.push(item);
        seenIds.add(item.id || item.objectID);
    }
}

console.log(`Original main: ${mainItems.length}, Fine Arts: ${fineArtsItems.length}, Merged total: ${merged.length}`);

// Write back to main file
fs.writeFileSync('public/data/mucem-collection.json', JSON.stringify(merged, null, 2));
