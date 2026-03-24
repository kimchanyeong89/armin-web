const fs = require('fs');
let ex = fs.readFileSync('src/data/exhibitions.js', 'utf8');
ex = ex.replace(/grenoble-paintings/g, 'grenoble-collection');
ex = ex.replace(/Musée de Grenoble - Paintings/g, 'Musée de Grenoble - The Collection');
ex = ex.replace(/name: "Paintings"/g, 'name: "The Collection"');
fs.writeFileSync('src/data/exhibitions.js', ex);
