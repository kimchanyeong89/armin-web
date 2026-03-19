const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/Users/kietzsche/armin-web-main/public/data/museum-wales-art.json', 'utf8'));
const TARGET_CATS = ['Drawing', 'Watercolour', 'Painting'];
const filtered = d.objects.filter(function(o) {
  const cats = o.categories || [];
  return cats.some(function(c) { return TARGET_CATS.indexOf(c) !== -1; });
}).map(function(o) {
  // Set category to the most specific target category found
  const targetCat = (o.categories || []).find(function(c) { return TARGET_CATS.indexOf(c) !== -1; });
  return Object.assign({}, o, { category: targetCat || (o.categories && o.categories[0]) || 'Painting' });
});
const catCount = {};
filtered.forEach(function(o) {
  const cats = (o.categories || []).filter(function(c) { return TARGET_CATS.indexOf(c) !== -1; });
  cats.forEach(function(c) { catCount[c] = (catCount[c] || 0) + 1; });
});
console.log('Filtered total:', filtered.length);
console.log('By category:', JSON.stringify(catCount));
console.log('Has image:', filtered.filter(function(o) { return !!o.image; }).length);
var out = {
  museum: 'National Museum Wales',
  museumId: 'museum-wales',
  collection: 'Paintings, Drawings & Watercolours',
  collectionId: 'museum-wales-paintings',
  location: 'Cardiff, Wales, UK',
  type: 'permanent',
  filteredFrom: d.objects.length,
  targetCategories: TARGET_CATS,
  totalArtworks: filtered.length,
  objects: filtered
};
fs.writeFileSync('/Users/kietzsche/armin-web-main/public/data/museum-wales-paintings.json', JSON.stringify(out, null, 2));
console.log('Saved museum-wales-paintings.json');
