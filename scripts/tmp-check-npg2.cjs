// tmp-check-npg2.cjs
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('public/data/national-portrait-gallery-london-collection.json', 'utf8'));
const arts = d.objects || [];
const bad = arts.filter(a => !a.image && !a.thumb);
console.log('NPG objects:', arts.length, 'no-img:', bad.length);
if (arts.length > 0) {
  const s = arts[0];
  console.log('keys:', Object.keys(s));
  console.log('img0:', s.image);
  console.log('thumb0:', s.thumb);
  console.log('source0:', s.source);
  console.log('sourceUrl0:', s.sourceUrl);
  // Check wikipedia images - are they accessible?
  console.log('\nSample images (first 5):');
  arts.slice(0, 5).forEach((a, i) => console.log(i, a.image ? a.image.substring(0, 80) : 'NONE'));
  
  // Check how many use wikipedia vs other
  const wikiImgs = arts.filter(a => a.image && a.image.includes('wikipedia'));
  const npgImgs = arts.filter(a => a.image && a.image.includes('npg.org.uk'));
  const noImg2 = arts.filter(a => !a.image || a.image === '');
  console.log('\nwikipedia imgs:', wikiImgs.length, 'npg.org.uk imgs:', npgImgs.length, 'noImg:', noImg2.length);
}
