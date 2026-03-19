const fs = require('fs');
const d = JSON.parse(fs.readFileSync('public/data/met-ny-collection.json', 'utf8'));
const noArtist = d.filter(x => !x.artist || x.artist === '');
console.log('No artist:', noArtist.length, '/', d.length);
console.log('Sample no-artist:', JSON.stringify(noArtist[0]).slice(0, 250));
const webLarge = d.filter(x => x.image && x.image.includes('web-large'));
const original = d.filter(x => x.image && x.image.includes('/original/'));
console.log('web-large images:', webLarge.length, '| original:', original.length);
