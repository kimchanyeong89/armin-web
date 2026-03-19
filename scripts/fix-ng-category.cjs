// fix-ng-category.cjs — Add "Painting" category to all National Gallery items
const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '../public/data/national-gallery-permanent.json');
const BAK = FILE + '.bak-' + new Date().toISOString().replace(/[:.]/g, '-');

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const items = data.items || [];

let added = 0;
const updated = items.map(item => {
  if (!item.category || !item.category.trim()) {
    added++;
    return { ...item, category: 'Painting', type: '2D' };
  }
  return item;
});

fs.copyFileSync(FILE, BAK);
fs.writeFileSync(FILE, JSON.stringify({ ...data, items: updated }, null, 2));
console.log(`Done: ${added}/${items.length} items updated with category=Painting`);
console.log(`Backup: ${BAK}`);
