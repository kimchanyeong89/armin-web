const fs = require('fs');

const mergedFile = 'public/data/albertina-permanent-collection.json';
const data = JSON.parse(fs.readFileSync(mergedFile));

const mapping = [
  { name: 'Photography', file: 'albertina-photography-100.json' },
  { name: 'Posters', file: 'albertina-poster-100.json' },
  { name: 'Sculptures', file: 'albertina-sculptures-100.json' },
  { name: 'Objects & Media Art', file: 'albertina-objects-installations-media-art-100.json' }
];

const idToCat = new Map();
for (let m of mapping) {
  const fileData = JSON.parse(fs.readFileSync('public/data/' + m.file));
  const arr = fileData.objects || fileData;
  arr.forEach(d => {
    idToCat.set(d.id, m.name);
  });
}

let modified = 0;
data.objects.forEach(d => {
  if (idToCat.has(d.id)) {
    d.category = idToCat.get(d.id);
  } else {
    d.category = 'Drawings, Prints, and Paintings'; 
  }
  modified++;
});

fs.writeFileSync(mergedFile, JSON.stringify(data, null, 2));
console.log('Done! Modified', modified, 'icoms.');

