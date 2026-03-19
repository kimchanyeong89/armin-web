const fs = require('fs');
let c = fs.readFileSync('src/components/GlobalSearchBar.tsx', 'utf8');
console.log('HAS DRAWING SKIN:', c.includes('isDrawingSkin'));
console.log('HAS WRAP BG MOD:', c.includes('inlineMode && isDrawingSkin'));
