const path = require('path');
const d = require(path.join(__dirname, '../public/data/tate-modern.json'));
const disp = d.items.find(x => x.id === 'display-artist-and-society');
console.log('Has rooms:', !!disp.rooms, disp.rooms?.length);
console.log('First room artworks:', disp.rooms?.[0]?.artworks?.length);
if (disp.rooms?.[0]?.artworks?.[0]) {
  console.log('Sample title:', JSON.stringify(disp.rooms[0].artworks[0].title));
  console.log('Title char codes:', [...disp.rooms[0].artworks[0].title].map(c => c.charCodeAt(0)));
}
