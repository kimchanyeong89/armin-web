const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../public/data/kanazawa-all.json');

if (!fs.existsSync(FILE)) {
  console.error(`File not found: ${FILE}`);
  process.exit(1);
}

try {
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  console.log(`\n--- Kanazawa Scraper Verification ---`);
  console.log(`Total Items: ${data.length}`);
  
  const withImage = data.filter(i => i.imageUrl).length;
  console.log(`With Image: ${withImage} (${((withImage/data.length)*100).toFixed(1)}%)`);

  const withArtist = data.filter(i => i.artist).length;
  console.log(`With Artist: ${withArtist} (${((withArtist/data.length)*100).toFixed(1)}%)`);

  const withDate = data.filter(i => i.date).length;
  console.log(`With Date: ${withDate} (${((withDate/data.length)*100).toFixed(1)}%)`);

  console.log(`\nSample Item:`);
  console.log(JSON.stringify(data[0], null, 2));

  // Check image URL format
  if (data[0] && data[0].imageUrl) {
     console.log(`\nSample Image URL: ${data[0].imageUrl}`);
     // Check if it's the high res 'files' one or the 'pict.html' one
     if (data[0].imageUrl.includes('pict.html')) {
        console.warn('WARNING: Using proxied pict.html URL instead of direct file!');
     } else {
        console.log('OK: Using direct file URL (likely).');
     }
  }

} catch (err) {
  console.error('Error reading JSON:', err);
}
