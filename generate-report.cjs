const fs = require('fs');

const fakes = [
  'public/data/aic-test.json',
  'public/data/albertina-photography-100.json',
  'public/data/albertina-poster-100.json',
  'public/data/ambrosiana-test.json',
  'public/data/fine-arts-be-100.json',
  'public/data/fine-arts-be-urls-temp.json',
  'public/data/leopold-museum-collection-test.json',
  'public/data/louisiana-test.json',
  'public/data/ngprague-collection-test.json',
  'public/data/novecento-della-ragione-test.json',
  'public/data/novecento-rosai-test.json',
  'public/data/smb-test-collection.json'
];

let allArtworks = new Set();
for (let i = 0; i <= 21; i++) {
   try {
     const chunk = JSON.parse(fs.readFileSync(`public/data/search-index-part-${i}.json`, 'utf8'));
     chunk.forEach(t => {
       if (t.i) allArtworks.add(t.i);
       if (t.id) allArtworks.add(t.id);
     });
   } catch(e) {}
}

const table = [];

for (const fake of fakes) {
   let data = [];
   try {
     data = JSON.parse(fs.readFileSync(fake, 'utf8'));
     if (data.items) data = data.items; else if (data.objects) data = data.objects; else if (data.artworks) data = data.artworks;
   } catch(e) {
     continue;
   }
   
   let count = data.length || 0;
   let overlaps = 0;
   let mNames = new Set();
   
   if (Array.isArray(data)) {
     for (let item of data) {
       const hasId = item.id || item.artworkId || '';
       const image = typeof item.image === 'string' ? item.image : (item.images && item.images.length > 0 ? item.images[0] : item.i);
       if (allArtworks.has(hasId) || allArtworks.has(image)) {
         overlaps++;
       }
       if (item.museumName || item.m || item.museum) {
         mNames.add(item.museumName || item.m || item.museum);
       } else {
           // fallback logic
           const p = typeof item.description === 'string' ? item.description : '';
           if (p.includes('Albertina')) mNames.add('Albertina');
           if (p.includes('Louisiana')) mNames.add('Louisiana Museum of Modern Art');
           if (hasId.includes('aic')) mNames.add('Art Institute of Chicago');
           if (hasId.includes('fine-arts-be')) mNames.add('Fine Arts Belgium');
           if (hasId.includes('smb')) mNames.add('Staatliche Museen zu Berlin');
           if (hasId.includes('ambrosiana')) mNames.add('Pinacoteca Ambrosiana');
           
           if (typeof fake === 'string') {
                if (fake.includes('albertina')) mNames.add('Albertina');
                if (fake.includes('aic')) mNames.add('Art Institute of Chicago');
           }
       }
     }
   }
   table.push({
     fakeFile: fake.replace('public/data/', ''),
     museumName: Array.from(mNames).join(', ') || 'Unknown',
     fakeCount: count,
     overlapsWithReal: overlaps
   });
}

console.table(table);