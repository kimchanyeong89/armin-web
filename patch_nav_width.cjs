const fs = require('fs');
let code = fs.readFileSync('src/components/GlobalNav.tsx', 'utf8');

code = code.replace(
    /width: isMenuOpen \? '0px' : \(isSearchExpanded \? 'min\(400px, calc\(100vw - 140px\)\)' : '48px'\),/,
    "width: isMenuOpen ? '0px' : (isSearchExpanded ? 'min(300px, calc(100vw - 200px))' : '48px'),"
);

fs.writeFileSync('src/components/GlobalNav.tsx', code);
