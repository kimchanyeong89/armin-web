const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '../public/data/tepapa-collection.json');
const OUTPUT_FILE = path.join(__dirname, '../public/data/search-index-part-tepapa.json');

if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Input file not found: ${INPUT_FILE}`);
    process.exit(1);
}

const items = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));

const transformed = items.map(item => {
    // extract year
    let year = '';
    if (item.date) {
        const match = item.date.match(/(\d{4})/);
        if (match) year = match[1];
    }
    
    // image
    const image = item.image_large || item.thumbnail || '';
    
    return {
        id: `tepapa-${item.api_id}`,
        n: item.title,
        a: item.artist || item.artist_guess || 'Unknown',
        d: year,
        i: image,
        m: "Te Papa Tongarewa",
        e: "", // No exhibition ID
        u: item.url
    };
});

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(transformed, null, 0)); // Minified
console.log(`Transformed ${items.length} items to ${OUTPUT_FILE}`);
