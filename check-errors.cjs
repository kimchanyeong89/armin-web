const munch = require('./public/data/munch-collection.json');
const nasjonal = require('./public/data/nasjonal-collection.json');

const mM = munch.filter(x => !x.image || !x.image.includes('.r2.dev'));
console.log('Munch missing:', mM.length, mM[0]?.original_image);

const nM = nasjonal.filter(x => !x.image || !x.image.includes('.r2.dev'));
console.log('Nasjonal missing:', nM.length, nM[0]?.original_image);
