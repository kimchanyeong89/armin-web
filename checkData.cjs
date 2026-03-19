const fs = require('fs');

// Met
const met = JSON.parse(fs.readFileSync('./public/data/met-ny-collection.json', 'utf8'));
console.log('=== Metropolitan Museum ===');
console.log('총 항목:', met.length);
console.log('이미지 있음:', met.filter(x => x.image).length);
console.log('On View:', met.filter(x => x.isOnView).length);
console.log('Highlight:', met.filter(x => x.isHighlight).length);
console.log('Public Domain:', met.filter(x => x.isPublicDomain).length);

// MBAM
const mbam = JSON.parse(fs.readFileSync('./public/data/mbam-collection.json', 'utf8'));
console.log('\n=== Montreal Museum (MBAM) ===');
console.log('총 항목:', mbam.length);
console.log('이미지 있음:', mbam.filter(x => x.image).length);
console.log('샘플 필드:', Object.keys(mbam[0]));

// MoMA
const moma = JSON.parse(fs.readFileSync('./public/data/moma-collection.json', 'utf8'));
console.log('\n=== MoMA ===');
console.log('총 항목:', moma.length);
console.log('On View:', moma.filter(x => x.onView).length);
