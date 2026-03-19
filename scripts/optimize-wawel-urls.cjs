const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '../public/data/wawel-collection.json');
const TARGET_WIDTH = 1200;

function main() {
  console.log('Optimizing Wawel IIIF URLs...');
  
  if (!fs.existsSync(INPUT_FILE)) {
    console.error('File not found:', INPUT_FILE);
    return;
  }

  const data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  console.log(`Processing ${data.length} items...`);

  let modifiedCount = 0;

  const optimized = data.map(item => {
    let url = item.generated_image_url || item.image || '';
    
    // Check if it is a Wawel IIIF URL
    // Format: https://cyfrowy.wawel.krakow.pl/iiif/3/UID/full/max/0/default.jpg
    if (url.includes('cyfrowy.wawel.krakow.pl/iiif/3/')) {
       // Replace 'max' with '1200,' (width 1200, auto height)
       // The path segment after /full/ is size. 
       // Regex to replace /full/[anything]/ with /full/1200,/
       if (url.includes('/full/max/')) {
           url = url.replace('/full/max/', `/full/${TARGET_WIDTH},/`);
           modifiedCount++;
       } else if (url.includes('/full/full/')) { // Sometimes it might be full/full?
           url = url.replace('/full/full/', `/full/${TARGET_WIDTH},/`);
           modifiedCount++;
       }
    }
    
    // Ensure item has the updated image field
    return {
        ...item,
        image: url,
        generated_image_url: url
    };
  });

  fs.writeFileSync(INPUT_FILE, JSON.stringify(optimized, null, 2));
  console.log(`Done. Updated ${modifiedCount} URLs to width=${TARGET_WIDTH}px.`);
}

main();
