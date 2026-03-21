const fs = require('fs');

const reals = [
  { p: 'public/data/aic-collection.json', m: 'Art Institute of Chicago' },
  { p: 'public/data/albertina-photography.json', m: 'Albertina' },
  { p: 'public/data/albertina-poster.json', m: 'Albertina' },
  { p: 'public/data/fine-arts-be-collection.json', m: 'Fine Arts Belgium' },
  { p: 'public/data/leopold-museum-collection.json', m: 'Leopold Museum' },
  { p: 'public/data/louisiana-collection.json', m: 'Louisiana Museum of Modern Art' },
  { p: 'public/data/ngprague-collection.json', m: 'National Gallery Prague' },
  { p: 'public/data/novecento-collection.json', m: 'Museo del Novecento' },
  { p: 'public/data/humboldt-forum-collection.json', m: 'Humboldt Forum (SMB)' },
  { p: 'public/data/ambrosiana-collection.json', m: 'Pinacoteca Ambrosiana' }
];

const table = [];

for (const real of reals) {
   let data = [];
   try {
     data = JSON.parse(fs.readFileSync(real.p, 'utf8'));
     if (data.items) data = data.items;
     if (data.objects) data = data.objects;
   } catch(e) {
     continue;
   }
   table.push({
     realFile: real.p.replace('public/data/', ''),
     museumName: real.m,
     realCount: data.length || 0
   });
}
console.table(table);
