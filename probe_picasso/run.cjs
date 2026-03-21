const fs = require('fs');

const d = JSON.parse(fs.readFileSync('../public/data/picasso-bcn-collection.json', 'utf8'));
const arr = d.artworks || d.items;
let num = 0;
for (const x of arr) {
    if ((x.image || (x.images && x.images[0] && x.images[0].url)) && (x.title || x.name) !== 'Untitled') {
         num++;
    }
}
console.log(num);
