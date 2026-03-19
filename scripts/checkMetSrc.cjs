const fs = require('fs');
const src = JSON.parse(fs.readFileSync('public/data/met-ny-on-view-paintings-enriched.json', 'utf8'));
const withArtist = src.filter(x => x.artistDisplayName && x.artistDisplayName.trim());
const webLarge = src.filter(x => x.primaryImageSmall && x.primaryImageSmall.includes('web-large'));
const webAddit = src.filter(x => x.primaryImageSmall && x.primaryImageSmall.includes('web-additional'));
console.log('Artist present:', withArtist.length, '/', src.length);
console.log('web-large images:', webLarge.length);
console.log('web-additional images:', webAddit.length);
const noPrimarySmall = src.filter(x => !x.primaryImageSmall && x.primaryImage);
console.log('Has primaryImage but no small:', noPrimarySmall.length);
if (noPrimarySmall.length > 0) console.log('primaryImage sample:', noPrimarySmall[0].primaryImage.slice(0, 80));
// Check sample of web-additional items
if (webAddit.length > 0) console.log('web-additional sample:', webAddit[0].primaryImageSmall);
