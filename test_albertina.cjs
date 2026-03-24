const fs = require('fs');

const data = JSON.parse(fs.readFileSync('public/data/albertina-permanent-collection.json')).objects;
const files = [
  { name: 'Photography', file: 'albertina-photography-100.json' },
  { name: 'Posters', file: 'albertina-poster-100.json' },
  { name: 'Sculptures', file: 'albertina-sculptures-100.json' },
  { name: 'Objects/Media Art', file: 'albertina-objects-installations-media-art-100.json' },
];

let sum = 0;
const known = new Set();
for (let f of files) {
  const c = JSON.parse(fs.readFileSync('public/data/' + f.file)).objects;
  console.log(f.name, c.length);
  sum += c.length;
  c.forEach(x => {
     known.add(x.id);
  });
}
console.log('Total known:', known.size);

const others = data.filter(d => !known.has(d.id));
console.log('Others:', others.length);
if (others.length > 0) {
  const categories = new Set(others.map(d => d.type || d.material || 'Unknown'));
  console.log('Categories in others:', [...categories].slice(0, 10));
  console.log('First other:', others[0]);
}