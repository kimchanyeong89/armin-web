// tmp-check-npg-soane.cjs
const fs = require('fs');
const path = require('path');

// NPG check
const npg = JSON.parse(fs.readFileSync('public/data/national-portrait-gallery-london-collection.json', 'utf8'));
const npgArts = npg.artworks || [];
const npgNoImg = npgArts.filter(a => !a.imageUrl && !a.image && !a.thumbnailUrl);
console.log('=== NPG ===');
console.log('total:', npgArts.length, 'noImage:', npgNoImg.length);
console.log('keys:', Object.keys(npgArts[0] || {}));
console.log('sample[0]:', JSON.stringify({
  id: npgArts[0]?.id,
  imageUrl: npgArts[0]?.imageUrl,
  image: npgArts[0]?.image,
  thumbnailUrl: npgArts[0]?.thumbnailUrl,
  sourceUrl: npgArts[0]?.sourceUrl
}, null, 2));
// check a broken one
if (npgNoImg.length > 0) {
  console.log('noImg sample:', JSON.stringify(npgNoImg[0], null, 2));
}

// Soane check
const soane = JSON.parse(fs.readFileSync('public/data/soane-paintings.json', 'utf8'));
const soaneArts = soane.artworks || [];
const soaneNoImg = soaneArts.filter(a => !a.imageUrl && !a.image && !a.thumbnailUrl);
console.log('\n=== SOANE ===');
console.log('total:', soaneArts.length, 'noImage:', soaneNoImg.length);
console.log('keys:', Object.keys(soaneArts[0] || {}));
console.log('sample[0]:', JSON.stringify(soaneArts[0], null, 2));
