const { exhibitions } = require('../src/data/exhibitions.js');
const https = require('https');
const crypto = require('crypto');

const hayward = exhibitions.find(e => e.id === 'hayward-gallery');
const past = hayward.pastExhibitions || [];

async function getHash(url) {
  return new Promise(resolve => {
    https.get(url, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const hash = crypto.createHash('md5').update(Buffer.concat(chunks)).digest('hex');
        resolve(hash);
      });
    }).on('error', () => resolve(null));
  });
}

(async () => {
  console.log('Checking', past.length, 'exhibitions for duplicates...');
  
  const hashMap = {};
  for (const ex of past) {
    if (!ex.coverImage) {
      console.log('NO COVER:', ex.id);
      continue;
    }
    const h = await getHash(ex.coverImage);
    if (!hashMap[h]) hashMap[h] = [];
    hashMap[h].push({ id: ex.id, name: ex.name });
  }
  
  console.log('\n=== DUPLICATES ===');
  let hasDupes = false;
  Object.entries(hashMap).forEach(([h, items]) => {
    if (items.length > 1) {
      hasDupes = true;
      console.log('\nHash:', h, '(' + items.length + ' items)');
      items.forEach(i => console.log('  -', i.id, '-', i.name?.substring(0, 40)));
    }
  });
  
  if (!hasDupes) {
    console.log('No duplicates found!');
  }
})();
