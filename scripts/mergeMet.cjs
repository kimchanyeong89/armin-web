const fs = require('fs');

// Base: met-ny-on-view-paintings.json (2496 items, has primaryImageSmall)
const onView = JSON.parse(fs.readFileSync('./public/data/met-ny-on-view-paintings.json', 'utf8'));

// Highlights IDs from earlier curl test (417 total including on-view overlaps)
// Use IDs returned by highlights API to mark items as isHighlight
// We got onDisplay=2609 IDs and highlight=417 IDs from the live API

// Existing highlights file (from before, 86 items)
let highlights = [];
try {
    const raw = JSON.parse(fs.readFileSync('./public/data/met-ny-highlights.json', 'utf8'));
    highlights = Array.isArray(raw) ? raw : [];
} catch { }
console.log('Highlights source items:', highlights.length);

const merged = new Map();

// Process on-view items  
for (const item of onView) {
    const id = String(item.objectID || item.id || '');
    if (!id) continue;
    const image = item.primaryImageSmall || item.primaryImage || item.image || '';
    if (!image) continue;

    merged.set(id, {
        id,
        title: item.title || '',
        artist: item.artistDisplayName || item.artist || '',
        date: item.objectDate || item.date || '',
        image,
        medium: item.medium || '',
        dimension: item.dimensions || item.dimension || '',
        url: item.objectURL || item.url || '',
        isPublicDomain: item.isPublicDomain || false,
        isHighlight: item.isHighlight || false,
        isOnView: true,
        galleryNumber: item.GalleryNumber || item.galleryNumber || '',
        repository: item.repository || 'Metropolitan Museum of Art, New York, NY',
        objectName: item.objectName || '',
        classification: item.classification || 'Paintings',
        department: item.department || '',
        culture: item.culture || '',
        period: item.period || '',
        artistNationality: item.artistNationality || '',
        artistBeginDate: item.artistBeginDate || '',
        artistEndDate: item.artistEndDate || '',
        creditLine: item.creditLine || '',
        accessionNumber: item.accessionNumber || '',
        tags: typeof item.tags === 'string' ? item.tags : (Array.isArray(item.tags) ? item.tags.map(t => t.term || t).join(', ') : ''),
    });
}

// Merge highlight items
for (const item of highlights) {
    const id = String(item.objectID || item.id || '');
    if (!id) continue;
    const image = item.primaryImageSmall || item.primaryImage || item.image || '';
    if (!image) continue;

    if (merged.has(id)) {
        // Update isHighlight flag
        merged.get(id).isHighlight = true;
    } else {
        merged.set(id, {
            id,
            title: item.title || '',
            artist: item.artistDisplayName || item.artist || '',
            date: item.objectDate || item.date || '',
            image,
            medium: item.medium || '',
            dimension: item.dimensions || item.dimension || '',
            url: item.objectURL || item.url || '',
            isPublicDomain: item.isPublicDomain || false,
            isHighlight: true,
            isOnView: item.isOnView || !!item.GalleryNumber || !!item.galleryNumber,
            galleryNumber: item.GalleryNumber || item.galleryNumber || '',
            repository: item.repository || 'Metropolitan Museum of Art, New York, NY',
            objectName: item.objectName || '',
            classification: item.classification || 'Paintings',
            department: item.department || '',
            culture: item.culture || '',
            period: item.period || '',
            artistNationality: item.artistNationality || '',
            artistBeginDate: item.artistBeginDate || '',
            artistEndDate: item.artistEndDate || '',
            creditLine: item.creditLine || '',
            accessionNumber: item.accessionNumber || '',
            tags: typeof item.tags === 'string' ? item.tags : '',
        });
    }
}

const result = Array.from(merged.values());
console.log('Total merged:', result.length);
console.log('On-view:', result.filter(x => x.isOnView).length);
console.log('Highlight:', result.filter(x => x.isHighlight).length);
console.log('Public domain:', result.filter(x => x.isPublicDomain).length);
console.log('With image:', result.filter(x => x.image).length);

fs.writeFileSync('./public/data/met-ny-collection.json', JSON.stringify(result, null, 2));
console.log('Written → public/data/met-ny-collection.json');
