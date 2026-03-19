#!/usr/bin/env node
// Fetch Met highlight-only paintings (not already in the on-view dataset)
// and merge them in with isHighlight=true
const fs = require('fs');
const { execSync } = require('child_process');

function curl(url) {
    try {
        const out = execSync(
            `curl -s -m 20 -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" "${url}"`,
            { maxBuffer: 5 * 1024 * 1024 }
        ).toString().trim();
        return JSON.parse(out);
    } catch (e) {
        return null;
    }
}

// Load existing data
const existing = JSON.parse(fs.readFileSync('./public/data/met-ny-collection.json', 'utf8'));
const existingIds = new Set(existing.map(x => x.id));
console.log('Existing items:', existing.length, '| Existing IDs:', existingIds.size);

// Load all highlight IDs
const highlightIds = JSON.parse(fs.readFileSync('/tmp/met-highlight-ids.json', 'utf8')).map(String);
console.log('Total highlight IDs:', highlightIds.length);

// Find highlights NOT already in existing data
const missingHighlightIds = highlightIds.filter(id => !existingIds.has(id));
console.log('Missing highlight paintings to fetch:', missingHighlightIds.length);

// Fetch each missing one using curl (small enough set)
const newItems = [];
let i = 0;
for (const id of missingHighlightIds) {
    const url = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`;
    const d = curl(url);
    i++;
    if (!d) {
        console.log(`  [${i}/${missingHighlightIds.length}] id=${id} → null`);
        continue;
    }
    const image = d.primaryImageSmall || d.primaryImage || '';
    if (!image) {
        console.log(`  [${i}/${missingHighlightIds.length}] id=${id} → no image`);
        continue;
    }
    newItems.push({
        id: String(d.objectID),
        title: d.title || '',
        artist: d.artistDisplayName || '',
        date: d.objectDate || '',
        image,
        medium: d.medium || '',
        dimension: d.dimensions || '',
        url: d.objectURL || '',
        isPublicDomain: !!d.isPublicDomain,
        isHighlight: true,
        isOnView: d.isOnView || false,
        galleryNumber: d.GalleryNumber || '',
        repository: d.repository || 'Metropolitan Museum of Art, New York, NY',
        objectName: d.objectName || '',
        classification: d.classification || 'Paintings',
        department: d.department || '',
        culture: d.culture || '',
        period: d.period || '',
        artistNationality: d.artistNationality || '',
        artistBeginDate: d.artistBeginDate || '',
        artistEndDate: d.artistEndDate || '',
        creditLine: d.creditLine || '',
        accessionNumber: d.accessionNumber || '',
        tags: (d.tags || []).map(t => t.term).join(', '),
    });
    if (i % 20 === 0) console.log(`  [${i}/${missingHighlightIds.length}] saved so far: ${newItems.length}`);
}

// Merge
const merged = [...existing, ...newItems];
console.log('\nFinal total:', merged.length);
console.log('Added highlights:', newItems.length);
console.log('isHighlight total:', merged.filter(x => x.isHighlight).length);

fs.writeFileSync('./public/data/met-ny-collection.json', JSON.stringify(merged, null, 2));
console.log('Written → public/data/met-ny-collection.json');
