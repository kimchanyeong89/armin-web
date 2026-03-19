const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/data/louisiana-test.json'); // Adjusted path
const raw = fs.readFileSync(filePath, 'utf8');

try {
    const data = JSON.parse(raw);
    const updated = data.map(item => {
        if (item.image) {
            // Replace { with %7B and } with %7D only in the image URL
            item.image = item.image.replace(/{/g, '%7B').replace(/}/g, '%7D');
        }
        return item;
    });
    
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
    console.log('Successfully encoded image URLs in louisiana-test.json');
} catch (e) {
    console.error('Failed to parse or write JSON:', e);
}
