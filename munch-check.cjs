const d = require('./public/data/munch-collection.json');
console.log('Total items:', d.length);

let noImgs = 0;
let r2Imgs = 0;
let validOtherImgs = 0;

for (const x of d) {
    let hasImg = x.image || x.imageUrl || x.original_image;
    if (!hasImg) {
        noImgs++;
    } else if (hasImg.includes('r2.dev') || hasImg.includes('r2.cloudflarestorage')) {
        r2Imgs++;
    } else {
        validOtherImgs++;
    }
}

console.log('No image field at all:', noImgs);
console.log('Has r2.dev:', r2Imgs);
console.log('Valid non-r2 imgs:', validOtherImgs);
