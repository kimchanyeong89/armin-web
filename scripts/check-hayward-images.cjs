const { exhibitions } = require('../src/data/exhibitions.js');
const https = require('https');

const hayward = exhibitions.find(e => e.id === 'hayward-gallery');
const pastExhibitions = hayward.pastExhibitions || [];

console.log('Checking R2 images for all', pastExhibitions.length, 'past exhibitions...\n');

async function checkUrl(url) {
  return new Promise((resolve) => {
    https.get(url, { method: 'HEAD' }, (res) => {
      resolve(res.statusCode);
    }).on('error', () => resolve(0));
  });
}

(async () => {
  const results = [];
  
  for (const ex of pastExhibitions) {
    const url = ex.coverImage;
    if (!url) {
      results.push({ id: ex.id, name: ex.name, status: 'NO_URL' });
      continue;
    }
    const status = await checkUrl(url);
    results.push({ id: ex.id, name: ex.name.substring(0, 35), status, url: url.substring(0, 70) });
  }
  
  const missing = results.filter(r => r.status !== 200);
  const ok = results.filter(r => r.status === 200);
  
  console.log('=== WORKING (' + ok.length + ') ===');
  ok.forEach(r => console.log('✓', r.id, '-', r.name));
  
  console.log('\n=== MISSING/FAILED (' + missing.length + ') ===');
  missing.forEach(r => console.log('✗', r.id, '-', r.name, '- status:', r.status));
})();
