const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '../public/data/gallerie-accademia-venice-collection.json');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

console.log('=== Fixing JSON data ===\n');

let fixedCount = 0;
let imageFixedCount = 0;

data.objects = data.objects.map(obj => {
  // Fix 1: Clean up year field - if it's not a valid year pattern, clear it
  if (obj.year) {
    // Valid year patterns: "1465", "1821-1822", "c. 1500", "1783-1792"
    const validYearPattern = /^(c\.\s*)?\d{4}(\s*[-–]\s*\d{4})?$/;
    if (!validYearPattern.test(obj.year.trim())) {
      console.log('Fixing year for:', obj.title.substring(0, 40));
      console.log('  Bad value:', obj.year.substring(0, 60) + '...');
      obj.year = '';
      fixedCount++;
    }
  }
  
  // Fix 2: Upgrade image URLs to high-res versions
  if (obj.image) {
    const originalImage = obj.image;
    
    // Remove /styles/xxx/public/ to get original image
    if (obj.image.includes('/styles/')) {
      obj.image = obj.image.replace(/\/styles\/[^/]+\/public\//, '/');
      if (obj.image !== originalImage) {
        imageFixedCount++;
      }
    }
    
    // Prefer /repository/media/images/ if available - these are higher res
    // For now, just ensure we have clean URLs
  }
  
  // Fix 3: Clean up roomId - extract just the hall number/name
  if (obj.roomId && obj.roomId.includes(' ')) {
    // If roomId contains description, extract just "Hall X" part
    const hallMatch = obj.roomId.match(/Hall\s+([IVXLCDM]+|\d+)/i);
    if (hallMatch) {
      obj.roomId = 'Hall ' + hallMatch[1];
    }
  }
  
  return obj;
});

// Update counts
data.artworksWithYear = data.objects.filter(a => a.year && a.year.trim() !== '').length;

fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));

console.log('\n=== Summary ===');
console.log('Fixed year fields:', fixedCount);
console.log('Fixed image URLs:', imageFixedCount);
console.log('Total artworks:', data.objects.length);
console.log('With valid year:', data.artworksWithYear);
console.log('\n✅ JSON updated!');
