const fs = require('fs');

const path = 'src/data/exhibitions.js';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
    'collectionFile: "fine-arts-be-complete.json"', 
    'collectionFile: "fine-arts-be-100.json"'
);

fs.writeFileSync(path, content, 'utf8');
console.log('reverted fine-arts-be');
