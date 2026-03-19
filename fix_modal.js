const fs = require('fs');
let code = fs.readFileSync('src/components/ExhibitionModal.tsx', 'utf8');
code = code.replace(
  /const isLow = typeof preview === 'string' && preview\.startsWith\('data:'\) && preview !== full;\n\s*if \(!isLow\) return;/g,
  `const isLow = typeof preview === 'string' && preview !== full;\n                      if (!isLow) return;`
);
fs.writeFileSync('src/components/ExhibitionModal.tsx', code);
