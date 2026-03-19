const fs = require('fs');

const rawFile = 'sweden-solr-raw-full.json';
if (!fs.existsSync(rawFile)) {
    console.error(`File ${rawFile} not found! Run fetch-sweden-solr.cjs first.`);
    process.exit(1);
}

const rawData = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
const docs = rawData.response.docs;

console.log(`Total raw items: ${docs.length}`);

// Filter Miniatures
const filtered = docs.filter(doc => {
    const col1 = (doc.collection_en_s || '').toLowerCase();
    const col2 = (doc.new_collection_en_s || '').toLowerCase();
    const type = (doc.type_en_s || '').toLowerCase();
    
    // Strict miniature exclusion
    if (col1.includes('miniat') || col2.includes('miniat') || type.includes('miniat')) {
        return false;
    }
    return true;
});

console.log(`After removing miniatures: ${filtered.length}`);

// Deduplication Map
const seenIds = new Set();
const uniqueItems = [];

filtered.forEach(doc => {
    if (seenIds.has(doc.oid)) return;
    seenIds.add(doc.oid);

    // Determines collection
    let collection = 'Nationalmuseum Sweden'; // Default

    const rawCol = doc.collection_en_s || '';
    const rawNewCol = doc.new_collection_en_s || '';

    if (rawCol.includes('Applied art') || rawNewCol.includes('Applied art')) {
        collection = 'Applied art and design';
    } else if (rawCol.includes('Painting')) {
        collection = 'Painting';
    } else if (rawCol.includes('Drawing')) {
        collection = 'Drawing';
    } else if (doc.collection_en_ss && doc.collection_en_ss.length > 0) {
        collection = doc.collection_en_ss[0];
    } else {
        // clean up hashes like #Glass#
        collection = rawCol.replace(/#/g, '').replace(/\(.*\)/, '').trim();
    }
    
    // Fallback if empty
    if (!collection || collection.length < 2) collection = 'Object';

    // Extract Image URL
    let imageUrl = doc.img_s ? `https://collection.nationalmuseum.se/${doc.img_s}` : null;

    // Filter items without images if required, but query ensured has_picture_s:Yes
    if (!imageUrl) return; 

    uniqueItems.push({
        id: `sweden-${doc.oid}`, // Prefix to avoid global collisions
        title: doc.title_en_s || doc.title_sv_s || 'Untitled',
        artist: (doc.artist_name_en_ss || doc.artist_name_sv_ss || []).join(', '),
        date: doc.date_en_s || doc.date_sv_s || '',
        medium: doc.mat_tech_en_s || doc.mat_tech_sv_s || '',
        dimensions: (doc.dimension_group_en_s || doc.dimension_group_sv_s || '').replace(/\n/g, '; '),
        image: imageUrl,
        collection: collection,
        url: `https://collection.nationalmuseum.se/e/collection/item/${doc.oid}`
    });
});

console.log(`Final unique count: ${uniqueItems.length}`);

fs.writeFileSync('public/data/sweden-collection.json', JSON.stringify(uniqueItems, null, 2));
console.log('Saved to public/data/sweden-collection.json');
