// tmp-check-soane-index.cjs
const fs = require('fs');
const path = require('path');

const DATA_DIR = 'public/data';

// Check search index files for soane
const idxFiles = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('search-index-part'));
let soaneCount = 0;
for (const f of idxFiles) {
  const content = fs.readFileSync(path.join(DATA_DIR, f), 'utf8');
  const data = JSON.parse(content);
  const arr = Array.isArray(data) ? data : [];
  const soane = arr.filter(a => a.e && a.e.toLowerCase().includes('soane'));
  soaneCount += soane.length;
  if (soane.length > 0) console.log('Found in', f, 'count:', soane.length, 'sample:', JSON.stringify(soane[0]));
}
console.log('Total soane in search index:', soaneCount);

// Check exhibitions.js for national-gallery collectionFile
const exh = fs.readFileSync('src/data/exhibitions.js', 'utf8');
const ngMatch = exh.match(/id:\s*"national-gallery"[\s\S]{0,2000}/);
if (ngMatch) {
  console.log('\nNational Gallery entry snippet:');
  console.log(ngMatch[0].substring(0, 500));
}
