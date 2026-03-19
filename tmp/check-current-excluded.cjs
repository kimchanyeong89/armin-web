const fs = require('fs');
const path = require('path');
const { exhibitions } = require('../src/data/exhibitions.js'); // Assuming running from tmp/

const DATA_DIR = path.join(__dirname, '../public/data');
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
for (const museum of exhibitions) {
    for (const key of ['permanentExhibitions', 'temporaryExhibitions', 'pastExhibitions']) {
        if (museum[key] && Array.isArray(museum[key])) {
            for (const show of museum[key]) {
                const fileKey = (show.collectionFile || show.id).replace('.json', '');
                DYNAMIC_MAPPINGS.set(fileKey, { museumName: museum.name });
            }
        }
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

console.log(`\nFiles excluded by the new strict mapping rules:`);
console.log(`Total artworks dropped: ${totalArtworksExcluded}`);
console.log('\nTop 30 excluded files by artwork count:');
console.log(excludedList.slice(0, 30));
