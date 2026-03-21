const fs = require('fs');

let fileContent = fs.readFileSync('./src/data/exhibitions.js', 'utf8');

// The file exports a big array. It's safe to use a regex to inject slug: id if it's missing.
// We look for 'id: "[string]"'
const idRegex = /id:\s*"([^"]+)",\n(?!\s*slug:)/g;
fileContent = fileContent.replace(idRegex, 'id: "$1",\n    slug: "$1",\n');

fs.writeFileSync('./src/data/exhibitions.js', fileContent);
console.log('Slugs auto-filled.');
