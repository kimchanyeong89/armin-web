const fs = require('fs');
const d = require('./public/data/whitney-collection.json');
const withImage = d.filter(x => !!x.image);
const nonHttp = withImage.filter(x => !x.image.startsWith('http'));
console.log('Total:', d.length);
console.log('With Image:', withImage.length);
console.log('Non-HTTP Array count:', nonHttp.length);
if (nonHttp.length > 0) {
    console.log('Sample:', nonHttp[0].image);
}

// Find if any image URL returns 404 or 403
// The user says "이미지 몇개가 로드가 안되네" -> meaning they load but some return error on the client?
// Maybe the Whitney CDN is blocking some or they are broken links?
