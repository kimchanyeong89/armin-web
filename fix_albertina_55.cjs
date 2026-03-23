const fs = require('fs');

const d1 = JSON.parse(fs.readFileSync('public/data/albertina-permanent-collection.json.bak', 'utf8') || "null");
console.log(d1);
