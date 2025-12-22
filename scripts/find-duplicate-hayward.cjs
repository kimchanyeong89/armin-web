const { exhibitions } = require('../src/data/exhibitions.js');
const https = require('https');
const crypto = require('crypto');

const hayward = exhibitions.find(e => e.id === 'hayward-gallery');
const pastExhibitions = hayward.pastExhibitions || [];

console.log('Checking', pastExhibitions.length, 'past exhibitions for duplicate images...\n');

function fetchImage(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        resolve({ status: res.statusCode, hash: null, size: 0 });
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const hash = crypto.createHash('md5').update(buffer).digest('hex');
        resolve({ status: 200, hash, size: buffer.length });
      });
    }).on('error', () => resolve({ status: 0, hash: null, size: 0 }));
  });
}

(async () => {
  const results = [];
  const hashCount = {};
  
  for (let i = 0; i < pastExhibitions.length; i++) {
    const ex = pastExhibitions[i];
    const url = ex.coverImage;
    process.stdout.write(`\r[${i+1}/${pastExhibitions.length}] Checking ${ex.id}...`);
    
    if (!url) {
      results.push({ id: ex.id, name: ex.name, status: 'NO_URL', hash: null });
      continue;
    }
    
    const { status, hash, size } = await fetchImage(url);
    results.push({ id: ex.id, name: ex.name.substring(0, 35), status, hash, size });
    
    if (hash) {
      hashCount[hash] = (hashCount[hash] || 0) + 1;
    }
  }
  
  console.log('\n');
  
  // Find the most common hash (likely the placeholder)
  const sortedHashes = Object.entries(hashCount).sort((a, b) => b[1] - a[1]);
  const placeholderHash = sortedHashes.length > 0 && sortedHashes[0][1] > 3 ? sortedHashes[0][0] : null;
  
  if (placeholderHash) {
    console.log('=== PLACEHOLDER HASH (appears ' + sortedHashes[0][1] + ' times) ===');
    console.log(placeholderHash);
    console.log('');
  }
  
  const duplicates = results.filter(r => r.hash === placeholderHash);
  const unique = results.filter(r => r.hash && r.hash !== placeholderHash);
  const failed = results.filter(r => !r.hash);
  
  console.log('=== UNIQUE IMAGES (' + unique.length + ') ===');
  unique.forEach(r => console.log('✓', r.id));
  
  console.log('\n=== DUPLICATE/PLACEHOLDER IMAGES (' + duplicates.length + ') - TO REMOVE ===');
  duplicates.forEach(r => console.log('✗', r.id, '-', r.name));
  
  console.log('\n=== FAILED TO LOAD (' + failed.length + ') ===');
  failed.forEach(r => console.log('?', r.id, '-', r.name, '- status:', r.status));
  
  // Output IDs to remove
  const toRemove = [...duplicates, ...failed].map(r => r.id);
  console.log('\n=== IDs TO REMOVE ===');
  console.log(JSON.stringify(toRemove));
})();
