/*
  Enrich public/data/met-ny-on-view-paintings.json
  by fetching fresh metadata from Met Collection API for each objectID.
  
  API Endpoint: https://collectionapi.metmuseum.org/public/collection/v1/objects/[objectID]
  
  Output: public/data/met-ny-on-view-paintings-enriched.json
*/

const fs = require('fs');
const path = require('path');

const IN_FILE = path.join(process.cwd(), 'public/data/met-ny-on-view-paintings.json');
const OUT_FILE = path.join(process.cwd(), 'public/data/met-ny-on-view-paintings-enriched.json');

const CONCURRENCY = 4; // Lower concurrency to be safe

const fetchObject = async (id) => {
  try {
    const res = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (ArminWeb/1.0)' }
    });
    if (!res.ok) {
       // console.log(`Failed ${id}: ${res.status}`);
       return null;
    }
    return await res.json();
  } catch (e) {
    console.error(`Error ${id}:`, e.message);
    return null;
  }
};

(async () => {
  if (!fs.existsSync(IN_FILE)) {
    console.error('Input file not found:', IN_FILE);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(IN_FILE, 'utf8'));
  console.log(`Loaded ${raw.length} items to enrich.`);

  const results = [];
  let completed = 0;
  
  for (let i = 0; i < raw.length; i += CONCURRENCY) {
    const chunk = raw.slice(i, i + CONCURRENCY);
    const promises = chunk.map(item => fetchObject(item.objectID).then(detail => {
      if (detail && detail.objectID) {
        // Return enriched record
        return {
          objectID: detail.objectID,
          title: detail.title || item.title || '',
          artistDisplayName: detail.artistDisplayName || item.artistDisplayName || '',
          objectDate: detail.objectDate || item.objectDate || '',
          medium: detail.medium || '',
          dimensions: detail.dimensions || '',
          primaryImage: detail.primaryImage || item.primaryImage || '',
          primaryImageSmall: detail.primaryImageSmall || item.primaryImageSmall || '',
          objectURL: detail.objectURL || item.objectURL || '',
          GalleryNumber: detail.GalleryNumber || 'On display',
          classification: detail.classification || '',
          department: detail.department || '',
          isOnView: !!detail.GalleryNumber
        };
      } else {
        return item;
      }
    }));

    const fetched = await Promise.all(promises);
    results.push(...fetched);
    completed += chunk.length;
    if (completed % 50 === 0) process.stdout.write(`\rProgress: ${completed}/${raw.length}`);
    
    // Slight delay
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n');
  fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
  console.log(`Enrichment complete. Saved ${results.length} items.`);
  
  // Overwrite
  if (results.length > 1000) {
      fs.writeFileSync(IN_FILE, JSON.stringify(results, null, 2));
      console.log('Overwrote original file.');
  }
})();
