/**
 * Merge scraped Pitti data with existing uffizi collection data
 */

const fs = require('fs');
const path = require('path');

// Read existing uffizi collection (has better metadata)
const uffiziData = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/data/uffizi-collection.json'), 'utf8'));
const uffiziMap = new Map();
uffiziData.objects.forEach(obj => {
    const slug = obj.sourceUrl ? obj.sourceUrl.split('/').pop() : null;
    if (slug) uffiziMap.set(slug, obj);
});

// Read new scraped pitti data
const pittiData = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/data/pitti-palace-collection.json'), 'utf8'));

// Merge: prefer uffizi data if exists, else use scraped data
const mergedObjects = pittiData.objects.map(scrapedArt => {
    const slug = scrapedArt.slug;
    const existingArt = uffiziMap.get(slug);

    if (existingArt) {
        // Use existing data but mark as Pitti Palace
        return { ...existingArt, museum: 'Pitti Palace' };
    }
    return scrapedArt;
});

// Count how many have good data
const withArtist = mergedObjects.filter(o => o.artist).length;
const withLocation = mergedObjects.filter(o => o.location).length;
const withImage = mergedObjects.filter(o => o.image).length;

console.log('Merged Pitti Palace Collection:');
console.log('  Total:', mergedObjects.length);
console.log('  With image:', withImage);
console.log('  With artist:', withArtist);
console.log('  With location:', withLocation);

// Save merged data
const output = {
    museum: 'Pitti Palace',
    museumId: 'pitti-palace',
    location: 'Florence, Italy',
    type: 'permanent',
    totalArtworks: mergedObjects.length,
    objects: mergedObjects
};
fs.writeFileSync(path.join(__dirname, '../public/data/pitti-palace-collection.json'), JSON.stringify(output, null, 2));
console.log('\n✅ Saved merged pitti-palace-collection.json');

// Now remove Pitti artworks from uffizi collection
const pittiSlugs = new Set(mergedObjects.map(o => o.slug || (o.sourceUrl ? o.sourceUrl.split('/').pop() : null)).filter(Boolean));
const uffiziOnly = uffiziData.objects.filter(obj => {
    const slug = obj.sourceUrl ? obj.sourceUrl.split('/').pop() : null;
    return !pittiSlugs.has(slug);
});

const uffiziOutput = {
    museum: 'Uffizi Gallery',
    museumId: 'uffizi-gallery',
    location: 'Florence, Italy',
    type: 'permanent',
    totalArtworks: uffiziOnly.length,
    objects: uffiziOnly
};
fs.writeFileSync(path.join(__dirname, '../public/data/uffizi-gallery-collection.json'), JSON.stringify(uffiziOutput, null, 2));
console.log('✅ Saved uffizi-gallery-collection.json with', uffiziOnly.length, 'artworks');

// Show samples
console.log('\nSample Pitti artworks (with full data):');
mergedObjects.filter(o => o.artist).slice(0, 5).forEach(o =>
    console.log('  -', o.title, '|', o.artist)
);
