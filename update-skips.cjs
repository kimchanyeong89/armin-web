const fs = require('fs');
const path = 'scripts/generate-search-index.cjs';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/    'albertina-poster-100\.json'.*\n/g, '');
content = content.replace(/    'albertina-photography-100\.json'.*\n/g, '');

fs.writeFileSync(path, content, 'utf8');
console.log('removed 100 from skips');
