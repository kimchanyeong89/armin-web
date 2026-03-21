const fs = require('fs');
const path = 'scripts/generate-search-index.cjs';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/    'fine-arts-be-100\.json'.*\n/g, '');

fs.writeFileSync(path, content, 'utf8');
console.log('removed fine-arts-100 from skips');
