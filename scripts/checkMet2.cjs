const fs = require('fs');
const d = JSON.parse(fs.readFileSync('public/data/met-ny-collection.json', 'utf8'));
// Check what image URLs look like that aren't web-large
const sample = d.filter(x => x.image && !x.image.includes('web-large')).slice(0, 3);
console.log('Non-web-large samples:');
sample.forEach(x => console.log(' ', x.id, x.image.slice(0, 100)));

// Also check the source file
const src = JSON.parse(fs.readFileSync('public/data/met-ny-on-view-paintings-enriched.json', 'utf8'));
console.log('\nSource file sample:', JSON.stringify(src[10]).slice(0, 400));
console.log('\nTotal in source:', src.length);
const srcWithArtist = src.filter(x => x.artistDisplayName && x.artistDisplayName.trim());
console.log('Source with artist:', srcWithArtist.length, '/', src.length);
