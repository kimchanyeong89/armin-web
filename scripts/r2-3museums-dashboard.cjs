const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const collections = [
  'carnavalet-the-collection.json',
  'musee-conde-collection.json',
  'musee-grenoble-collection.json'
];

collections.forEach(file => {
  const p = path.join(__dirname, '../public/data', file);
  if (fs.existsSync(p)) {
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    const len = Array.isArray(d) ? d.length : (d.objects || d.artworks || []).length;
    console.log(`${file}: ${len} items`);
  } else {
    console.log(`${file}: not found`);
  }
});
