const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'public', 'data', 'ateneum-collection.json');

const items = JSON.parse(fs.readFileSync(FILE, 'utf8'));

let count = 0;
items.forEach(item => {
    // Fix specific item reported
    if (item.id === '2878034') {
        item.category = 'Sculpture';
        item.medium = 'Sculpture';
        item.type = '3D';
        count++;
    }

    // Fix other likely sculptures by Essi Renvall
    if (item.artist === 'Essi Renvall') {
        if (item.title.includes('Head') || item.title.includes('Bust') || item.medium === 'Artwork') {
            // Essi Renvall is primarily a sculptor
            item.category = 'Sculpture';
            item.medium = 'Bronze' || 'Sculpture'; // Default to Sculpture if material unknown
            item.type = '3D';
            if (item.dimensions && !item.dimensions.includes('x') && item.dimensions.includes('cm')) {
                // heuristic
            }
            count++;
        }
    }
});

fs.writeFileSync(FILE, JSON.stringify(items, null, 2));
console.log(`Patched ${count} items.`);
