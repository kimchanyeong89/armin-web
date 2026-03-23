const fs = require('fs');
let code = fs.readFileSync('src/data/exhibitions.js', 'utf8');

// Albertina
const oldMatches = [
  /\{ id: \"albertina-drawings-prints\".*?\},\s*/g,
  /\{ id: \"albertina-photography\".*?\},\s*/g,
  /\{ id: \"albertina-poster\".*?\}(,|\s*\])/g
];

for(const regex of oldMatches) {
  code = code.replace(regex, (match, p1) => p1 === ']' ? ']' : '');
}

fs.writeFileSync('src/data/exhibitions.js', code);
console.log('Cleaned Albertina in exhibitions.js');
