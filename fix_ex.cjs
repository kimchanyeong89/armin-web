const fs = require('fs');
let ex = fs.readFileSync('src/data/exhibitions.js', 'utf8');
ex = ex.replace(/musee-grenoble-paintings-collection\.json/g, 'musee-grenoble-collection.json');
ex = ex.replace(/musee-conde-paintings\.json/g, 'musee-conde-collection.json');
fs.writeFileSync('src/data/exhibitions.js', ex);
