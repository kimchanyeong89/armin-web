const fs = require('fs');
let code = fs.readFileSync('src/pages/ExhibitionPage.tsx', 'utf8');

code = code.replace(
  /background: '#f0ece1',/,
  `background: '#e8e5d9',`
);

fs.writeFileSync('src/pages/ExhibitionPage.tsx', code);
