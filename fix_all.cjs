const fs = require('fs');
let code = fs.readFileSync('src/data/exhibitions.js', 'utf8');

// 1. Remove Petit Palais drawings
code = code.replace(/,\s*\{\s*id:\s*"petit-palais-drawings".+?\}/g, '');
code = code.replace(/\{\s*id:\s*"petit-palais-drawings".+?\},\s*/g, '');

// 2. Remove Wales Art and Industry
code = code.replace(/,\s*\{\s*id:\s*"museum-wales-art".+?\}/g, '');
code = code.replace(/\{\s*id:\s*"museum-wales-art".+?\},\s*/g, '');
code = code.replace(/,\s*\{\s*id:\s*"museum-wales-industry".+?\}/g, '');
code = code.replace(/\{\s*id:\s*"museum-wales-industry".+?\},\s*/g, '');

// 3. Remove Kröller-Müller photography and film-video, update paintings to permanent
code = code.replace(/,\s*\{\s*id:\s*"kroller-muller-photography".+?\}/g, '');
code = code.replace(/\{\s*id:\s*"kroller-muller-photography".+?\},\s*/g, '');
code = code.replace(/,\s*\{\s*id:\s*"kroller-muller-film-video".+?\}/g, '');
code = code.replace(/\{\s*id:\s*"kroller-muller-film-video".+?\},\s*/g, '');
code = code.replace(/\"kroller-muller-paintings\.json\"/g, '"kroller-muller-permanent.json"');

// 4. Remove Albertina extra
code = code.replace(/,\s*\{\s*id:\s*"albertina-photography-100".+?\}/g, '');
code = code.replace(/\{\s*id:\s*"albertina-photography-100".+?\},\s*/g, '');
code = code.replace(/,\s*\{\s*id:\s*"albertina-poster-100".+?\}/g, '');
code = code.replace(/\{\s*id:\s*"albertina-poster-100".+?\},\s*/g, '');

code = code.replace(/,\s*\{\s*id:\s*"albertina-drawings-prints".+?\}/g, '');
code = code.replace(/\{\s*id:\s*"albertina-drawings-prints".+?\},\s*/g, '');
code = code.replace(/,\s*\{\s*id:\s*"albertina-photography".+?\}/g, '');
code = code.replace(/\{\s*id:\s*"albertina-photography".+?\},\s*/g, '');
code = code.replace(/,\s*\{\s*id:\s*"albertina-poster".+?\}/g, '');
code = code.replace(/\{\s*id:\s*"albertina-poster".+?\},\s*/g, '');

// 5. Remove Carnavalet paintings and prints
code = code.replace(/,\s*\{\s*id:\s*"carnavalet-paintings".+?\}/g, '');
code = code.replace(/\{\s*id:\s*"carnavalet-paintings".+?\},\s*/g, '');
code = code.replace(/,\s*\{\s*id:\s*"carnavalet-prints".+?\}/g, '');
code = code.replace(/\{\s*id:\s*"carnavalet-prints".+?\},\s*/g, '');

// 6. Fix "hidden-" prefixes for all the deleted ones
const hiddenToRemove = [
  "hidden-carnavalet-prints",
  "hidden-carnavalet-paintings",
  "hidden-petit-palais-drawings",
  "hidden-museum-wales-art",
  "hidden-museum-wales-industry",
  "hidden-kroller-muller-photography",
  "hidden-kroller-muller-film-video"
];
for(const h of hiddenToRemove) {
  const reg = new RegExp(`\\{\\s*id:\\s*"${h}"[\\s\\S]*?\\},?\\s*`, 'g');
  code = code.replace(reg, '');
}

fs.writeFileSync('src/data/exhibitions.js', code);
console.log('Fixed file');