const fs = require('fs');

// Restore from the enriched source + highlights we already have
const src = JSON.parse(fs.readFileSync('public/data/met-ny-on-view-paintings-enriched.json', 'utf8'));
const hlIds = new Set(JSON.parse(fs.readFileSync('/tmp/met-highlight-ids.json', 'utf8')).map(String));
const pdIds = new Set(JSON.parse(fs.readFileSync('/tmp/met-pd-ids.json', 'utf8')).map(String));

// Also load any good data from batch result
let batchItems = [];
try {
    batchItems = JSON.parse(fs.readFileSync('/tmp/met-batch-result.json', 'utf8'));
    console.log('Batch items with full metadata:', batchItems.length);
} catch { }

const batchMap = new Map(batchItems.map(x => [x.id, x]));

const result = src
    .filter(item => item.primaryImageSmall || item.primaryImage)
    .map(item => {
        const id = String(item.objectID);
        // If we have a full-metadata version from the batch, prefer it
        if (batchMap.has(id)) return batchMap.get(id);

        const image = item.primaryImageSmall || item.primaryImage || '';
        return {
            id,
            title: item.title || '',
            artist: item.artistDisplayName || '',
            date: item.objectDate || '',
            image,
            medium: item.medium || '',
            dimension: item.dimensions || '',
            url: item.objectURL || '',
            isPublicDomain: pdIds.has(id),
            isHighlight: hlIds.has(id),
            isOnView: true,
            galleryNumber: item.GalleryNumber || '',
            repository: 'Metropolitan Museum of Art, New York, NY',
            objectName: item.objectName || '',
            classification: item.classification || 'Paintings',
            department: item.department || '',
            culture: item.culture || '',
        };
    });

// Add highlight-only items from batch (not in source)
const srcIds = new Set(result.map(x => x.id));
const hlOnly = batchItems.filter(x => !srcIds.has(x.id) && hlIds.has(x.id));
result.push(...hlOnly);

console.log('Total:', result.length);
console.log('isHighlight:', result.filter(x => x.isHighlight).length);
console.log('isPublicDomain:', result.filter(x => x.isPublicDomain).length);
console.log('With artist:', result.filter(x => x.artist && x.artist.trim()).length);
console.log('web-large images:', result.filter(x => x.image.includes('web-large')).length);

fs.writeFileSync('public/data/met-ny-collection.json', JSON.stringify(result, null, 2));
console.log('Written -> public/data/met-ny-collection.json');
