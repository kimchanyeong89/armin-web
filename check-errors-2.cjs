const munch = require('./public/data/munch-collection.json');
const nasjonal = require('./public/data/nasjonal-collection.json');

const mM = munch.filter(x => !x.image || !x.image.includes('.r2.dev'));
console.log('--- Munch First Missing ---');
console.log(JSON.stringify(mM[0], null, 2));

const nM = nasjonal.filter(x => !x.image || !x.image.includes('.r2.dev'));
console.log('--- Nasjonal First Missing ---');
console.log(JSON.stringify(nM[0], null, 2));
