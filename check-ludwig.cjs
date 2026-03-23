const fs = require('fs');
const d = fs.readFileSync('public/data/museum-ludwig-paintings.json', 'utf8');
const j = JSON.parse(d);
console.log('Array?', Array.isArray(j));
if(!Array.isArray(j)) console.log('Keys:', Object.keys(j));
const items = Array.isArray(j) ? j : (j.items || j.objects || j.artworks || j.painting || []);
console.log('Items length:', items.length);
if(items.length > 0) console.log('Sample item:', items[0]);
