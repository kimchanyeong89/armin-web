import fs from 'fs';

// Merge met-ny-on-view-paintings.json (2496 items) + the old highlights (86 items)
// Both contain painting/artwork objects but with differing field names

const onView = JSON.parse(fs.readFileSync('./public/data/met-ny-on-view-paintings.json', 'utf8'));
const highlights = JSON.parse(fs.readFileSync('./public/data/met-ny-collection.json', 'utf8'));

const merged = new Map();

// Process on-view file first (larger, primary dataset)
for (const item of onView) {
    const img = item.primaryImageSmall || item.primaryImage || item.imageUrl || item.image;
    if (!img) continue;
    const id = String(item.objectID || item.objectId || item.id || '');
    if (!id) continue;
    merged.set(id, {
        id,
        title: item.title || item.name || '',
        artist: item.artistDisplayName || item.artist || '',
        date: item.objectDate || item.date || '',
        image: img,
        medium: item.medium || '',
        dimension: item.dimensions || item.dimension || '',
        url: item.objectURL || item.url || '',
        isPublicDomain: item.isPublicDomain || false,
        isHighlight: item.isHighlight || false,
        isOnView: item.isOnView !== false,  // default true since it's in on-view file
        galleryNumber: item.GalleryNumber || item.galleryNumber || '',
        repository: item.repository || '',
        objectName: item.objectName || '',
        classification: item.classification || '',
        department: item.department || ''
    });
}

// Add highlights-only items (not already in on-view)
for (const item of highlights) {
    const img = item.image || item.primaryImageSmall || item.primaryImage || item.imageUrl;
    if (!img) continue;
    const id = String(item.objectID || item.objectId || item.id || '');
    if (!id) continue;

    if (merged.has(id)) {
        // Update isHighlight flag if already exists
        merged.get(id).isHighlight = merged.get(id).isHighlight || item.isHighlight;
    } else {
        merged.set(id, {
            id,
            title: item.title || '',
            artist: item.artist || item.artistDisplayName || '',
            date: item.date || item.objectDate || '',
            image: img,
            medium: item.medium || '',
            dimension: item.dimension || item.dimensions || '',
            url: item.url || item.objectURL || '',
            isPublicDomain: item.isPublicDomain || false,
            isHighlight: item.isHighlight || false,
            isOnView: item.isOnView || !!item.galleryNumber || !!item.GalleryNumber,
            galleryNumber: item.galleryNumber || item.GalleryNumber || '',
            repository: item.repository || '',
            objectName: item.objectName || '',
            classification: item.classification || '',
            department: item.department || ''
        });
    }
}

const finalArr = Array.from(merged.values());
console.log(`Writing ${finalArr.length} items to met-ny-collection.json`);
console.log(`On-view total: ${onView.length}, Highlights total: ${highlights.length}`);
fs.writeFileSync('./public/data/met-ny-collection.json', JSON.stringify(finalArr, null, 2));
