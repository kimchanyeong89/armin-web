const fs = require('fs');
const path = require('path');

const IN_FILE = path.join(process.cwd(), 'public/data/met-ny-on-view-paintings.json');
const OUT_FILE = path.join(process.cwd(), 'public/data/met-ny-on-view-paintings-enriched.json');

const fetchObject = async (id) => {
  try {
    const res = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
};

(async () => {
    const raw = JSON.parse(fs.readFileSync(IN_FILE, 'utf8'));
    console.log(`Processing ${raw.length} items...`);
    
    // Resume if output exists
    let results = [];
    if(fs.existsSync(OUT_FILE)) {
        try {
            results = JSON.parse(fs.readFileSync(OUT_FILE));
            // Check if results are just partial or empty items
            // If valid, keep them.
        } catch {}
    }

    if (results.length === 0) {
        // Start fresh
    } else {
        console.log(`Resuming? loaded ${results.length}`);
        // If the file was full but empty fields, we should probably restart. 
        // Let's just restart to be safe.
        results = [];
    }

    for (let i = 0; i < raw.length; i++) {
        const item = raw[i];
        // Skip if already processed? (not modifying in place)
        
        await new Promise(r => setTimeout(r, 60)); // 60ms delay -> ~16 req/sec. Conservative.

        const detail = await fetchObject(item.objectID);
        let enriched = item;
        
        if (detail && detail.objectID) {
           enriched = {
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
        }
        results.push(enriched);
        
        if (i % 20 === 0) {
            process.stdout.write(`\r${i}/${raw.length}`);
            fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2)); // Valid JSON checkpoint
        }
    }
    
    fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
    
    // Done. Overwrite Input
    if (results.length > 2000) {
        fs.writeFileSync(IN_FILE, JSON.stringify(results, null, 2));
        console.log('\nFinalized.');
    }
})();
