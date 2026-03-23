const fs = require('fs');

let itemsMap = new Map();

const loadFile = (file) => {
  try {
    let d = JSON.parse(fs.readFileSync('./public/data/' + file));
    let items = Array.isArray(d) ? d : (d.objects || d.items || d.artworks || d.results || d.data || []);
    console.log(file, 'has', items.length, 'items');
    for (const item of items) {
      let id = item.url || item.id || item.objectID || item.image || item.title;
      // To be safe, if we don't have a stable ID, we can just append
      if (id && !itemsMap.has(id)) {
        itemsMap.set(id, item);
      } else if (!id) {
         // just use a random key if none
        itemsMap.set(Math.random().toString(), item);
      }
    }
  } catch(e) { console.log(e.message); }
};

loadFile('albertina-permanent-collection.json');
loadFile('albertina-drawings-prints.json');
loadFile('albertina-photography.json');
loadFile('albertina-poster.json');

console.log('Unique items:', itemsMap.size);
fs.writeFileSync('./public/data/albertina-permanent-collection.json', JSON.stringify(Array.from(itemsMap.values()), null, 2));

// Delete others
try { fs.unlinkSync('./public/data/albertina-drawings-prints.json'); } catch(e){}
try { fs.unlinkSync('./public/data/albertina-photography.json'); } catch(e){}
try { fs.unlinkSync('./public/data/albertina-poster.json'); } catch(e){}
