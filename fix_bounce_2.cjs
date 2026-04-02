const fs = require('fs');
let code = fs.readFileSync('src/components/GlobalNav.tsx', 'utf8');

code = code.replace(
    /width: isMenuOpen \? '0px' : \(isSearchExpanded \? 'min\(300px, calc\(100vw - 200px\)\)' : '48px'\),\n\s*overflow: isMenuOpen \? 'hidden' : 'visible',\n\s*transition: 'width 0.4s ease-in-out'/g,
    "width: isMenuOpen ? '0px' : (isSearchExpanded ? 'min(300px, calc(100vw - 200px))' : '48px'),\n                        overflow: isMenuOpen ? 'hidden' : 'visible',\n                        transition: 'width 0.3s ease-out'"
);

code = code.replace(
    /transition: 'max-width 0.4s ease-in-out, opacity 0.4s ease-in-out'/g,
    "transition: 'max-width 0.3s ease-out, opacity 0.3s ease-out'"
);

code = code.replace(
    /transition: 'all 0.5s ease-in-out'/g,
    "transition: 'all 0.3s ease-out'"
);

fs.writeFileSync('src/components/GlobalNav.tsx', code);
