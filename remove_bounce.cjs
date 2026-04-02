const fs = require('fs');
let code = fs.readFileSync('src/components/GlobalSearchBar.tsx', 'utf8');

// Replace any bouncy or custom cubic bezier with ease-in-out
code = code.replace(/cubic-bezier\([^\)]+\)/g, 'ease-in-out');

fs.writeFileSync('src/components/GlobalSearchBar.tsx', code);
console.log('Removed all cubic-beziers');
