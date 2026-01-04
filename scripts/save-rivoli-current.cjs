const fs = require('fs');
const progress = JSON.parse(fs.readFileSync('downloads/rivoli-v2-progress.json', 'utf8'));
console.log('Artworks:', progress.artworks?.length || 0);
console.log('URLs:', progress.urls?.length || 0);
console.log('Completed:', progress.completed?.length || 0);

// Save current artworks to output
if (progress.artworks?.length > 0) {
  fs.writeFileSync('public/data/castello-di-rivoli-collection.json', JSON.stringify(progress.artworks, null, 2));
  console.log('Saved to output file');
}
