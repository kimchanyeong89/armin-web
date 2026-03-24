const fs = require('fs');
const file = 'public/data/albertina-permanent-collection.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const getCategory = (medium) => {
  if (!medium) return 'Drawing & Print';
  const m = medium.toLowerCase();
  
  if (m.includes('foto') || m.match(/photo|gelatine|albumin|negativ|kollodium|daguerreotypie|print|autochrom|diapositiv|lichtdruck|salzpapier|polaroid|bromsilber|kalotypie|cyanotypie/)) return 'Photography';
  if (m.match(/öl|acryl|gemälde|tempera|gouache|leinwand/)) return 'Painting';
  if (m.match(/lithograph|radierung|holzschnitt|kupferstich|siebdruck|aquatinta|linolschnitt|kaltnadel|druck|stich|heliogravüre|serigraphie|monotypie|graphik/)) return 'Print';
  if (m.match(/zeichnung|aquarell|bleistift|kohle|tusche|stift|kreide|pastell|feder|skizze|rötel|sepia/)) return 'Drawing';
  if (m.match(/skulptur|bronze|gips|holzfigur|plastik|keramik|marmor|terrakotta/)) return 'Sculpture';
  if (m.match(/plakat|poster/)) return 'Poster';
  
  return 'Drawing & Print';
};

let updated = 0;
const items = data.items || data.objects || data;
items.forEach(item => {
  const newCat = getCategory(item.medium);
  if (item.category !== newCat) {
    item.category = newCat;
    updated++;
  }
});

console.log('Categories updated:', updated);
fs.writeFileSync(file, JSON.stringify(data, null, 2));
