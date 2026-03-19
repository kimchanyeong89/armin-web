const fs = require('fs');

// Load the temporary file if it exists, otherwise the merged file then filter
let items = [];
if (fs.existsSync('public/data/nga-prints-temp.json')) {
    const data = JSON.parse(fs.readFileSync('public/data/nga-prints-temp.json', 'utf8'));
    items = data.items;
} else {
    const data = JSON.parse(fs.readFileSync('public/data/nga-collection.json', 'utf8'));
    items = data.items.filter(i => i.classification === 'Print');
}

console.log(`Analyzing ${items.length} items...`);

// 1. Check for ID duplicates (should be none if script works right)
const idMap = new Map();
items.forEach(i => {
    idMap.set(i.objectID, (idMap.get(i.objectID) || 0) + 1);
});
const dupIds = [...idMap.entries()].filter(x => x[1] > 1);
console.log(`Duplicate IDs: ${dupIds.length}`);

// 2. Check for Title + Artist duplicates (Conceptually same work?)
const titleArtistMap = new Map();
items.forEach(i => {
    const key = `${i.title}|${i.attribution}`;
    if (!titleArtistMap.has(key)) titleArtistMap.set(key, []);
    titleArtistMap.get(key).push(i);
});

console.log('\n--- Potential Content Duplicates (Same Title + Artist) ---');
let contentDups = 0;
[...titleArtistMap.entries()].filter(x => x[1].length > 1).sort((a,b) => b[1].length - a[1].length).slice(0, 10).forEach(([k, list]) => {
    contentDups += list.length - 1;
    console.log(`"${k}" (${list.length} copies)`);
    // Print first 2 to see differences
    const A = list[0]; 
    const B = list[1];
    console.log(`   A: ID=${A.objectID} Date=${A.displayDate} Med=${A.medium}`);
    console.log(`   B: ID=${B.objectID} Date=${B.displayDate} Med=${B.medium}`);
});

console.log(`Total groups with duplicates: ${[...titleArtistMap.entries()].filter(x => x[1].length > 1).length}`);

// 3. Analyze Date Range Distribution near the cutoff
console.log('\n--- Date Distribution near 1850 ---');
const years = items.map(i => i.beginYear).filter(y => y !== null).sort((a,b) => a-b);
let pre1850count = items.filter(i => (i.beginYear || i.endYear || 0) < 1850).length;
console.log(`Items with Begin/End < 1850 (should be 0 if filtered correctly): ${pre1850count}`);

const counts = {};
for (let y = 1840; y <= 1860; y++) {
    counts[y] = items.filter(i => i.beginYear === y).length;
}
console.log(JSON.stringify(counts, null, 2));
