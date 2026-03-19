const fs = require('fs');
const path = require('path');
const uiData = require('./parse_exhibitions.cjs');

// Get all files in public/data
const dataDir = path.join(__dirname, 'public', 'data');
const allJsonFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));

// Get mapped files
const mappedFiles = new Set();
for (const venue of uiData) {
    for (const coll of venue.collections) {
        if (coll.dataFile) {
            mappedFiles.add(coll.dataFile);
        }
    }
}

console.log("=== UNMAPPED JSON FILES ===");
allJsonFiles.forEach(file => {
    if (!mappedFiles.has(file)) {
        try {
            const raw = fs.readFileSync(path.join(dataDir, file), 'utf8');
            const data = JSON.parse(raw);
            const count = Array.isArray(data) ? data.length : (data.items ? data.items.length : 0);
            console.log(`- ${file} (Items: ${count})`);
        } catch (e) {
            console.log(`- ${file} (Error parsing or reading: ${e.message})`);
        }
    }
});
