const fs = require('fs');

const file = 'public/data/tate-modern-collection.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

console.log('Original count:', data.length);
const filtered = data.filter(item => item.image && item.image.trim() !== '');
console.log('Filtered count:', filtered.length);

fs.writeFileSync(file, JSON.stringify(filtered, null, 2));
