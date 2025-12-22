const { exhibitions } = require('../src/data/exhibitions.js');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const hayward = exhibitions.find(e => e.id === 'hayward-gallery');
const past = hayward.pastExhibitions || [];

// Known placeholder hash
const PLACEHOLDER_HASH = '8069674ae91046c0dfae0e4042a6d129';

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
  console.log('Checking', past.length, 'exhibitions for placeholder hash...\n');
  
  const toRemove = [];
  const toKeep = [];
  
  for (let i = 0; i < past.length; i++) {
    const ex = past[i];
    process.stdout.write(`\r[${i+1}/${past.length}] Checking ${ex.id}...`);
    
    if (!ex.coverImage) {
      toRemove.push(ex.id);
      continue;
    }
    
    const h = await getHash(ex.coverImage);
    if (h === PLACEHOLDER_HASH) {
      toRemove.push(ex.id);
    } else {
      toKeep.push(ex.id);
    }
  }
  
  console.log('\n\n=== TO REMOVE (' + toRemove.length + ') ===');
  toRemove.forEach(id => console.log('  ✗', id));
  
  console.log('\n=== TO KEEP (' + toKeep.length + ') ===');
  // toKeep.forEach(id => console.log('  ✓', id));
  
  // Save removal list
  fs.writeFileSync(
    path.join(__dirname, 'hayward-to-remove.json'),
    JSON.stringify(toRemove, null, 2)
  );
  console.log('\nSaved to hayward-to-remove.json');
})();
