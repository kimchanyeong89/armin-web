const fs = require('fs');
const path = require('path');

function flattenIfNeeded(filename) {
    const file = path.join('public/data', filename);
    if (!fs.existsSync(file)) return;
    
    let data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(data) && data.items && Array.isArray(data.items)) {
        fs.writeFileSync(file, JSON.stringify(data.items, null, 2));
        console.log(`Flattened ${filename}`);
    }
}

['lacma-classification-22.json', 'picasso-paris-collection.json', 'vam-permanent-exhibitions.json'].forEach(flattenIfNeeded);
