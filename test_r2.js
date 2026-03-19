const fs = require('fs');
let items = JSON.parse(fs.readFileSync('public/data/pushkin-paintings.json', 'utf8'));
let count = items.filter(i => JSON.stringify(i).includes('r2.dev')).length;
console.log("Pushkin r2 count:", count);
