const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../public/data/sweden-collection.json');

try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    console.log(`Original count: ${data.length}`);

    // Filter for items where type includes "Painting" but NOT "Miniature"
    const paintings = data.filter(item => {
        const type = (item.type || "").toLowerCase();
        return (type.includes('painting') || type.includes('måleri')) && !type.includes('miniature');
    });

    console.log(`Filtered count: ${paintings.length}`);

    // Analysis of filtered types
    const types = {};
    paintings.forEach(p => {
        types[p.type] = (types[p.type] || 0) + 1;
    });
    console.log("Included types:", types);

    fs.writeFileSync(DATA_FILE, JSON.stringify(paintings, null, 2));
    console.log(`Updated ${DATA_FILE} with only paintings.`);

} catch (e) {
    console.error(e);
}
