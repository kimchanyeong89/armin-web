const fs = require('fs');
const d = JSON.parse(fs.readFileSync('./public/data/albertina-permanent-collection.json'));
let items = d.objects || d.artworks || d;
if (!Array.isArray(items)) items = d.data || d.items;
console.log("first item keys:", Object.keys(items[0]));
console.log("first item:", JSON.stringify(items[0]).substring(0, 200));
