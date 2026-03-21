const fs = require('fs');
(async () => {
  const { exhibitions } = await import('../src/data/exhibitions.js');
  const validFiles = new Set();
  exhibitions.forEach(m => {
    (m.permanentExhibitions || []).forEach(e => {
        if(e.collectionFile) validFiles.add(e.collectionFile);
    });
    (m.temporaryExhibitions || []).forEach(e => {
        if(e.collectionFile) validFiles.add(e.collectionFile);
    });
  });
  
  const allJson = fs.readdirSync('public/data').filter(f => f.endsWith('.json') && f !== 'search-warm-prefix.json' && !f.startsWith('search-index'));
  const orphans = allJson.filter(f => !validFiles.has(f));
  
  console.log('Orphan files (Indexed but not in exhibitions.js):');
  orphans.forEach(o => {
      // Check if it's currently skipped by search index
      const skipped = ['-test.json', '_test.json'].some(s => o.includes(s));
      console.log(` - ${o} (Skipped? ${skipped})`);
  });
})();
