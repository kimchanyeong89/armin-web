const fs = require('fs');
const path = require('path');
const data = require('../public/data/namoc-collection.json');

const counts = {};
const unmapped = {};

data.forEach(item => {
    const cat = item.category;
    const channel = item.raw.channelCode;
    const keyword = item.raw.keyword;

    // Count categories
    counts[cat] = (counts[cat] || 0) + 1;

    // Inspect unmapped
    if (cat === "Artwork") {
        const key = `Channel: ${channel}, Keyword: ${keyword}`;
        unmapped[key] = (unmapped[key] || 0) + 1;
    }
});

console.log("Current Categories:", counts);
console.log("\nUnmapped 'Artwork' Distribution:");
Object.keys(unmapped).forEach(k => console.log(`${k}: ${unmapped[k]}`));
