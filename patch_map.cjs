const fs = require('fs');

const file = 'src/components/ArtistDistributionMap.tsx';
let txt = fs.readFileSync(file, 'utf8');

// just to make sure we know what's there
console.log(txt.length);
