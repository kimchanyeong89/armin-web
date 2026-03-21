const fs = require('fs');
const path = require('path');

const dir = 'public/data';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('search-index') && !f.includes('metadata') && !f.includes('counts'));

let totalSaved = 0;

for (const file of files) {
  const filePath = path.join(dir, file);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    
    if (Array.isArray(data)) {
      const uniqueData = [];
      const seenUrls = new Set();
      let hadDuplicates = false;
      
      for (const item of data) {
        // try to catch duplicates by exact image url. Sometimes museums return overlapping lists with different IDs
        // for Van Gogh we prefer original_imageUrl because imageUrl includes ID hash
        let imgKey = item.original_imageUrl;
        if (!imgKey) {
             imgKey = item.imageUrl || item.image || item.thumbnail;
        }

        // Sometimes image is an array (like met)
        if (Array.isArray(imgKey) && imgKey.length > 0) {
            imgKey = imgKey[0];
        } else if (typeof imgKey !== 'string') {
            imgKey = null;
        }
        
        if (!imgKey || imgKey === "" || imgKey.includes("no-image") || imgKey.includes("placeholder")) {
            uniqueData.push(item);
            continue;
        }
        
        if (!seenUrls.has(imgKey)) {
          uniqueData.push(item);
          seenUrls.add(imgKey);
        } else {
          hadDuplicates = true;
        }
      }
      
      if (hadDuplicates) {
        fs.writeFileSync(filePath, JSON.stringify(uniqueData, null, 2));
        console.log(`[Fixed Images] ${file}: ${data.length} -> ${uniqueData.length}`);
        totalSaved += (data.length - uniqueData.length);
      }
    }
  } catch (e) {
    // skip
  }
}
console.log(`Done. Saved ${totalSaved} visual duplicates total across all files.`);
