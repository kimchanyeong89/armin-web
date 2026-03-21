const fs = require('fs');
(async () => {
  const { exhibitions } = await import('./src/data/exhibitions.js');
  const valid = new Set();
  exhibitions.forEach(m => {
    (m.permanentExhibitions||[]).forEach(e => e.collectionFile && valid.add(e.collectionFile));
    (m.temporaryExhibitions||[]).forEach(e => e.collectionFile && valid.add(e.collectionFile));
  });
  const all = fs.readdirSync('public/data').filter(f => f.endsWith('.json') && !f.startsWith('search-') && !valid.has(f));
  console.log('Unreferenced (but possibly indexed) JSON files:');
  console.log(all);
})();
