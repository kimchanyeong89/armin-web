const fs = require('fs');

const SKIP_EXACT = new Set([
    'artists.json', 'artist-birthpaths.json', 'search-warm-prefix.json',
    'sitemaps.json', 'top-museums.json', 'all_slugs.json',
    'db.json', '_routes.json', 'package.json', 'manifest.json'
]);
const SKIP_SUBSTRINGS = [
    'search-index-part', 'search-index.json', '.backup', 'test', '-sample', '-new.json', 'museum-ludwig', 'british-museum-gac', 'british-museum', 'the-british-museum'
];

(async () => {
  const { exhibitions } = await import('./src/data/exhibitions.js');
  const validFiles = new Set();
  exhibitions.forEach(m => {
    (m.permanentExhibitions||[]).forEach(e => e.collectionFile && validFiles.add(e.collectionFile));
    (m.temporaryExhibitions||[]).forEach(e => e.collectionFile && validFiles.add(e.collectionFile));
  });

  const allJson = fs.readdirSync('./public/data').filter(f => f.endsWith('.json'));
  
  const indexedFiles = allJson.filter(f => {
      const lower = f.toLowerCase();
      if (SKIP_EXACT.has(lower)) return false;
      return !SKIP_SUBSTRINGS.some(pattern => lower.includes(pattern));
  });

  const indexedButNotValid = indexedFiles.filter(f => !validFiles.has(f));
  
  console.log('--- FILES BEING INDEXED BUT NOT IN EXHIBITIONS.JS ---');
  indexedButNotValid.forEach(f => console.log(f));
})();
