const fs = require('fs');

let content = fs.readFileSync('src/data/exhibitions.js', 'utf8');

content = content.replace(/id: "uffizi-gallery-collection",([^}]+)collectionFile: "uffizi-gallery-collection.json"/g, 'id: "uffizi-gallery-collection",$1collectionFile: "uffizi-collection.json"');

fs.writeFileSync('src/data/exhibitions.js', content, 'utf8');
