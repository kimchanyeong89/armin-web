const fs = require('fs');
const path = require('path');
const { exhibitions } = require('../src/data/exhibitions.js');

const DATA_DIR = '/Users/kietzsche/armin-web-main/public/data';
const allFiles = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort();

const SKIP_SUBSTRINGS = [
    'search-index-part',
    'search-index.json',
    '.backup',
    'test',
    '-sample',
    '-new.json',
    'museum-ludwig',
    'british-museum-gac',
    'british-museum',
    'the-british-museum',
    'serpentine-gallery',
];

const SKIP_EXACT = new Set([
    'british-museum-collection.json',
    'british-museum-galleries.json',
    'british-museum.json',
    'serpentine-gallery-collection.json',
]);

const DYNAMIC_MAPPINGS = new Map();
for (const ex of exhibitions) {
    for (const perm of (ex.permanentExhibitions || [])) {
        if (perm.collectionFile) DYNAMIC_MAPPINGS.set(perm.collectionFile.replace('.json', ''), ex.name);
    }
    for (const temp of (ex.temporaryExhibitions || [])) {
        if (temp.collectionFile) DYNAMIC_MAPPINGS.set(temp.collectionFile.replace('.json', ''), ex.name);
    }
    for (const past of (ex.pastExhibitions || [])) {
        if (past.collectionFile) DYNAMIC_MAPPINGS.set(past.collectionFile.replace('.json', ''), ex.name);
    }
}

const allowedSplits = new Set([
    'musee-conde-paintings', 'musee-conde-drawings',
    'musee-grenoble-paintings-collection', 'musee-grenoble-drawings-collection', 'musee-grenoble-photography-collection',
    'musba-bordeaux-paintings-collection', 'musba-bordeaux-drawings-collection',
    'mam-painting-collection', 'mam-photography-collection',
    'museum-wales-art', 'museum-wales-industry'
]);

const oldIncludedFiles = [];
const newIncludedFiles = [];

for (const f of allFiles) {
    const lower = f.toLowerCase();

    // Old logic:
    let oldIncluded = true;
    if (SKIP_EXACT.has(lower)) oldIncluded = false;
    if (SKIP_SUBSTRINGS.some(pattern => lower.includes(pattern))) oldIncluded = false;
    if (oldIncluded) oldIncludedFiles.push(f);

    // New logic:
    let newIncluded = false;
    if (oldIncluded) {
        const base = f.replace('.json', '');
        if (DYNAMIC_MAPPINGS.has(base) || allowedSplits.has(base)) {
            newIncluded = true;
        }
    }
    if (newIncluded) newIncludedFiles.push(f);
}

const excludedNowFiles = oldIncludedFiles.filter(f => !newIncludedFiles.includes(f));

console.log(`Old included files count: ${oldIncludedFiles.length}`);
console.log(`New included files count: ${newIncludedFiles.length}`);
console.log(`Files excluded now count: ${excludedNowFiles.length}`);

let totalArtworksExcluded = 0;
const excludedList = [];

for (const f of excludedNowFiles) {
    try {
        const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
        let itemsCount = 0;
        if (Array.isArray(data)) itemsCount = data.length;
        else if (data.items) itemsCount = data.items.length;
        else if (data.objects) itemsCount = data.objects.length;
        else if (data.artworks) itemsCount = data.artworks.length;
        else if (data.rooms) itemsCount = data.rooms.flatMap(room => room.artworks || room.items || []).length;

        totalArtworksExcluded += itemsCount;
        excludedList.push({ file: f, count: itemsCount });
    } catch (e) { }
}

excludedList.sort((a, b) => b.count - a.count);

console.log(`\nTotal artworks excluded: ${totalArtworksExcluded}`);
console.log('\nTop 20 excluded files by artwork count:');
console.log(excludedList.slice(0, 20));

let sumTop20 = 0;
for (const i of excludedList.slice(0, 20)) sumTop20 += i.count;
console.log('\nSum of top 20 excluded: ' + sumTop20);
