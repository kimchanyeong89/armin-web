const fs = require('fs');
const path = require('path');

const RAW_FILE = path.join(process.cwd(), 'public/data/met-ny-on-view-paintings.json');
const ENRICHED_FILE = path.join(process.cwd(), 'public/data/met-ny-on-view-paintings-enriched.json');

const fetchObject = async (id) => {
  try {
    const res = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) {
        if (res.status === 404) return { notFound: true };
        return null;
    }
    return await res.json();
  } catch (e) {
    return null;
  }
};

(async () => {
    if (!fs.existsSync(RAW_FILE)) {
        console.error("Raw file not found:", RAW_FILE);
        process.exit(1);
    }

    const raw = JSON.parse(fs.readFileSync(RAW_FILE, 'utf8'));
    console.log(`Input raw items: ${raw.length}`);
    
    // Load existing enriched data to skip calls
    const existingMap = new Map();
    if(fs.existsSync(ENRICHED_FILE)) {
        try {
            const existing = JSON.parse(fs.readFileSync(ENRICHED_FILE));
            console.log(`Loaded ${existing.length} existing enriched items.`);
            for (const item of existing) {
                if (item && item.objectID && item.title) {
                    existingMap.set(Number(item.objectID), item);
                }
            }
        } catch (e) {
            console.warn("Failed to load existing enriched file, starting fresh.");
        }
    }
    console.log(`Valid cache hit candidates: ${existingMap.size}`);

    const results = [];
    let fetchedCount = 0;
    
    for (let i = 0; i < raw.length; i++) {
        const item = raw[i];
        const id = Number(item.objectID);
        
        let finalItem = item;

        if (existingMap.has(id)) {
            finalItem = existingMap.get(id);
            // Verify it has the fields we want, just in case
            if (!finalItem.title) {
                // re-fetch if bad data
                finalItem = null; 
            }
        } else {
             finalItem = null;
        }

        if (!finalItem) {
            // Needs fetch
            // Rate limit
            await new Promise(r => setTimeout(r, 80)); // 80ms => ~12 req/sec

            const detail = await fetchObject(id);
            if (detail && detail.objectID) {
               finalItem = {
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
                    isOnView: !!detail.GalleryNumber,
                    isHighlight: detail.isHighlight || false,
                    isPublicDomain: detail.isPublicDomain || false
               };
            } else {
                // usage of original item if fetch fails
                 finalItem = item; 
            }
            fetchedCount++;
            if (fetchedCount % 10 === 0) process.stdout.write(`.`);
        }

        results.push(finalItem);
        
        if (i > 0 && i % 50 === 0) {
            fs.writeFileSync(ENRICHED_FILE, JSON.stringify(results, null, 2));
            process.stdout.write(`\r${i}/${raw.length} (fetched ${fetchedCount}) `);
        }
    }
    
    fs.writeFileSync(ENRICHED_FILE, JSON.stringify(results, null, 2));
    
    // Also overwrite the main file so the app sees it immediately
    fs.writeFileSync(RAW_FILE, JSON.stringify(results, null, 2));
    
    console.log(`\nFinalized. Total: ${results.length}, Fetched new: ${fetchedCount}`);
})();
