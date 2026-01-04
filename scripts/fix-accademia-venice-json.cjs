const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '../public/data/gallerie-accademia-venice-collection.json');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// Filter out non-artwork entries (no title)
const validArtworks = data.objects.filter(obj => obj.title && obj.title.trim() !== '');

console.log('Before:', data.objects.length);
console.log('After:', validArtworks.length);
console.log('Removed:', data.objects.length - validArtworks.length);

// Show removed items
const removed = data.objects.filter(obj => !obj.title || obj.title.trim() === '');
console.log('\nRemoved items:');
removed.forEach(r => console.log('  -', r.slug));

// Update data
data.objects = validArtworks;
data.totalArtworks = validArtworks.length;
data.artworksWithImage = validArtworks.filter(a => a.image).length;
data.artworksWithTitle = validArtworks.filter(a => a.title).length;
data.artworksWithArtist = validArtworks.filter(a => a.artist).length;

fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
console.log('\n✅ JSON updated!');
