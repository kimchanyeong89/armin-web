const fs = require('fs');
const path = require('path');

const files = [
    'albertina-drawings-prints-100.json',
    'albertina-objects-installations-media-art-100.json',
    'albertina-paintings-100.json',
    'albertina-paintings-sculpture-100.json',
    'albertina-sculptures-100.json'
];

let mergedObjects = [];

for (const f of files) {
    const p = path.join(__dirname, '../public/data', f);
    if (fs.existsSync(p)) {
        const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (d.objects && Array.isArray(d.objects)) {
            mergedObjects = mergedObjects.concat(d.objects);
        } else if (Array.isArray(d)) {
            mergedObjects = mergedObjects.concat(d);
        }
        console.log(`Loaded ${f}, total items so far: ${mergedObjects.length}`);
    } else {
        console.warn(`Missing file: ${f}`);
    }
}

const outPath = path.join(__dirname, '../public/data/albertina-permanent-collection.json');
fs.writeFileSync(outPath, JSON.stringify({
    museum: "ALBERTINA Museum Vienna",
    museumId: "albertina",
    groupName: "Permanent Collection",
    objects: mergedObjects
}, null, 2));

console.log(`Saved ${outPath} with ${mergedObjects.length} objects.`);
