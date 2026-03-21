const fs = require('fs');

const path = 'src/data/exhibitions.js';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
    'collectionFile: "fine-arts-be-100.json"', 
    'collectionFile: "fine-arts-be-complete.json"'
);
content = content.replace(
    /A selection of 100 paintings from the collection\./g, 
    'A comprehensive selection of paintings from the collection.'
);

fs.writeFileSync(path, content, 'utf8');
console.log('updated fine-arts-be');
