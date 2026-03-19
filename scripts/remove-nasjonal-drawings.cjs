const fs = require('fs');

const FILE = 'public/data/nasjonal-collection.json';

function removeDrawings() {
    const data = JSON.parse(fs.readFileSync(FILE));
    console.log(`Loaded ${data.length} items.`);

    // Count before
    const drawingCount = data.filter(i => i.category === 'Drawing').length;
    console.log(`Found ${drawingCount} Drawing items to remove.`);

    // Remove all Drawing items
    const filtered = data.filter(i => i.category !== 'Drawing');

    console.log(`Remaining items: ${filtered.length}`);

    // Show category distribution
    const stats = {};
    filtered.forEach(i => { stats[i.category] = (stats[i.category] || 0) + 1; });
    console.log('Category Distribution after removal:', stats);

    fs.writeFileSync(FILE, JSON.stringify(filtered, null, 2));
    console.log('Saved updated file.');
}

removeDrawings();
