const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/data/nasjonal-collection.json');

try {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const initialCount = data.length;

  console.log(`Loaded ${initialCount} items.`);

  const filtered = data.filter(item => {
    // Check for valid image URL
    // The example shows: "https://ms01.nasjonalmuseet.no/iip/?iiif=/tif/NMK.2025.0207%20%2020250829.tif/full/1200,/0/default.jpg"
    // Sometimes it might be null or undefined.
    return item.image && item.image.trim().length > 0 && !item.image.includes('placeholder') && !item.image.includes('undefined');
  });

  const finalCount = filtered.length;
  console.log(`Filtered down to ${finalCount} items. (Removed ${initialCount - finalCount})`);

  fs.writeFileSync(filePath, JSON.stringify(filtered, null, 2));
  console.log('Saved cleaned data.');

} catch (error) {
  console.error('Error processing file:', error);
}
