const data = require('../public/data/tate-britain.json');

for (const item of data.items) {
  console.log('Item:', item.name);
  if (item.subExhibitions) {
    console.log('  - Has subExhibitions:', item.subExhibitions.length);
    for (const sub of item.subExhibitions) {
      if (sub.artworks) {
        console.log('    - Sub:', sub.name, '- artworks:', sub.artworks.length);
      }
    }
  }
  if (item.artworks) {
    console.log('  - Has artworks:', item.artworks.length);
  }
}
