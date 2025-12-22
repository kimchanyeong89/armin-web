const { exhibitions } = require('../src/data/exhibitions.js');
const https = require('https');
const crypto = require('crypto');

// UK galleries to check
const ukGalleryIds = [
  'hayward-gallery', 'tate-modern', 'tate-britain', 'tate-st-ives',
  'national-gallery', 'national-portrait-gallery', 'royal-academy',
  'serpentine-gallery', 'british-museum', 'courtauld-gallery',
  'dulwich-picture-gallery', 'walker-art-gallery', 'scottish-national-gallery',
  'scottish-national-portrait-gallery', 'scottish-national-gallery-of-modern-art',
  'victoria-albert-museum', 'whitechapel-gallery', 'barbican', 'saatchi-gallery'
];

function fetchImage(url) {
  return new Promise((resolve) => {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      resolve({ status: 0, hash: null, size: 0 });
      return;
    }
    const client = url.startsWith('https') ? https : require('http');
    client.get(url, (res) => {
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
  const allResults = [];
  const hashCount = {};
  
  for (const gallery of exhibitions) {
    // Check if UK gallery
    const isUK = gallery.country === 'United Kingdom' || 
                 gallery.region === 'London' ||
                 gallery.location?.includes('London') ||
                 gallery.location?.includes('UK') ||
                 gallery.location?.includes('Edinburgh') ||
                 gallery.location?.includes('Liverpool') ||
                 ukGalleryIds.some(id => gallery.id.includes(id));
    
    if (!isUK) continue;
    
    console.log(`\nChecking ${gallery.name || gallery.id}...`);
    
    // Check permanent exhibitions
    for (const ex of (gallery.permanentExhibitions || [])) {
      const img = ex.coverImage || ex.image;
      if (!img) {
        allResults.push({ galleryId: gallery.id, type: 'permanent', id: ex.id, name: ex.name, issue: 'NO_IMAGE' });
        continue;
      }
      const { status, hash, size } = await fetchImage(img);
      if (status !== 200) {
        allResults.push({ galleryId: gallery.id, type: 'permanent', id: ex.id, name: ex.name, issue: 'FETCH_FAILED', status });
      } else if (hash) {
        hashCount[hash] = (hashCount[hash] || 0) + 1;
        allResults.push({ galleryId: gallery.id, type: 'permanent', id: ex.id, name: ex.name, hash, size, status: 200 });
      }
    }
    
    // Check temporary exhibitions
    for (const ex of (gallery.temporaryExhibitions || [])) {
      const img = ex.coverImage || ex.image;
      if (!img) {
        allResults.push({ galleryId: gallery.id, type: 'temporary', id: ex.id, name: ex.name, issue: 'NO_IMAGE' });
        continue;
      }
      const { status, hash, size } = await fetchImage(img);
      if (status !== 200) {
        allResults.push({ galleryId: gallery.id, type: 'temporary', id: ex.id, name: ex.name, issue: 'FETCH_FAILED', status });
      } else if (hash) {
        hashCount[hash] = (hashCount[hash] || 0) + 1;
        allResults.push({ galleryId: gallery.id, type: 'temporary', id: ex.id, name: ex.name, hash, size, status: 200 });
      }
    }
    
    // Check past exhibitions
    for (const ex of (gallery.pastExhibitions || [])) {
      const img = ex.coverImage || ex.image;
      if (!img) {
        allResults.push({ galleryId: gallery.id, type: 'past', id: ex.id, name: ex.name, issue: 'NO_IMAGE' });
        continue;
      }
      const { status, hash, size } = await fetchImage(img);
      if (status !== 200) {
        allResults.push({ galleryId: gallery.id, type: 'past', id: ex.id, name: ex.name, issue: 'FETCH_FAILED', status });
      } else if (hash) {
        hashCount[hash] = (hashCount[hash] || 0) + 1;
        allResults.push({ galleryId: gallery.id, type: 'past', id: ex.id, name: ex.name, hash, size, status: 200 });
      }
    }
  }
  
  console.log('\n\n=== ANALYSIS ===\n');
  
  // Find placeholder hashes (appearing 5+ times with same hash)
  const placeholderHashes = Object.entries(hashCount)
    .filter(([h, c]) => c >= 5)
    .map(([h]) => h);
  
  console.log('Suspected placeholder hashes:', placeholderHashes.length);
  placeholderHashes.forEach(h => console.log('  -', h, '(' + hashCount[h] + ' occurrences)'));
  
  // Find problematic exhibitions
  const problems = allResults.filter(r => 
    r.issue === 'NO_IMAGE' || 
    r.issue === 'FETCH_FAILED' ||
    placeholderHashes.includes(r.hash)
  );
  
  console.log('\n=== PROBLEMATIC EXHIBITIONS (' + problems.length + ') ===\n');
  
  // Group by gallery
  const byGallery = {};
  problems.forEach(p => {
    if (!byGallery[p.galleryId]) byGallery[p.galleryId] = [];
    byGallery[p.galleryId].push(p);
  });
  
  Object.entries(byGallery).forEach(([gid, items]) => {
    console.log(`\n${gid} (${items.length} issues):`);
    items.forEach(p => {
      const reason = p.issue || (placeholderHashes.includes(p.hash) ? 'PLACEHOLDER' : 'UNKNOWN');
      console.log(`  [${p.type}] ${p.id} - ${(p.name || '').substring(0, 40)} - ${reason}`);
    });
  });
  
  // Output IDs to remove grouped by gallery
  console.log('\n\n=== IDs TO REMOVE (JSON) ===\n');
  const toRemove = {};
  problems.forEach(p => {
    if (!toRemove[p.galleryId]) toRemove[p.galleryId] = { permanent: [], temporary: [], past: [] };
    toRemove[p.galleryId][p.type].push(p.id);
  });
  console.log(JSON.stringify(toRemove, null, 2));
})();
