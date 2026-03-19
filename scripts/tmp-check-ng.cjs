// tmp-check-ng.cjs
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('public/data/national-gallery-permanent.json', 'utf8'));
const arr = Array.isArray(d) ? d : (d.items || d.artworks || []);
console.log('type:', typeof d, Array.isArray(d) ? 'array' : 'obj');
if (!Array.isArray(d)) console.log('keys:', Object.keys(d));
console.log('items count:', arr.length);
const s = arr[0];
if (s) {
  console.log('keys[0]:', Object.keys(s));
  console.log('category:', s.category, 'type:', s.type, 'medium:', s.medium);
  console.log('sample:', JSON.stringify(s, null, 2).substring(0, 400));
}

// Count with/without category
const withCat = arr.filter(a => a.category && a.category.trim());
const noCat = arr.filter(a => !a.category || !a.category.trim());
console.log('\nWith category:', withCat.length, 'Without category:', noCat.length);
if (withCat.length > 0) {
  const cats = {};
  withCat.forEach(a => { cats[a.category] = (cats[a.category] || 0) + 1; });
  console.log('Category distribution:', JSON.stringify(cats, null, 2).substring(0, 300));
}
