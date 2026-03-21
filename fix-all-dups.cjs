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
      const seenIds = new Set();
      let hadDuplicates = false;
      
      for (const item of data) {
        if (!item.id) {
          uniqueData.push(item);
          continue;
        }
        
        if (!seenIds.has(item.id)) {
          uniqueData.push(item);
          seenIds.add(item.id);
        } else {
          hadDuplicates = true;
        }
      }
      
      if (hadDuplicates) {
        fs.writeFileSync(filePath, JSON.stringify(uniqueData, null, 2));
        console.log(`[Fixed] ${file}: ${data.length} -> ${uniqueData.length}`);
        totalSaved += (data.length - uniqueData.length);
      }
    }
  } catch (e) {
    // console.log(`Skipping ${file}`);
  }
}
console.log(`Done. Saved ${totalSaved} duplicate items total across all files.`);
