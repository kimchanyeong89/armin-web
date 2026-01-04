const data = require('../public/data/castello-di-rivoli-collection.json');

console.log('=== Castello di Rivoli Scraping Statistics ===');
console.log('Total artworks:', data.length);
console.log('With artist:', data.filter(d => d.artist && d.artist.length > 0).length);
console.log('With date:', data.filter(d => d.date && d.date.length > 0).length);
console.log('With medium:', data.filter(d => d.medium && d.medium.length > 0).length);
console.log('With image:', data.filter(d => d.imageUrl && d.imageUrl.length > 0).length);
console.log('');
console.log('=== Missing artist ===');
const missingArtist = data.filter(d => !d.artist || d.artist === '');
missingArtist.slice(0, 15).forEach(d => console.log('  -', d.title));
console.log(`Total missing artist: ${missingArtist.length}`);
