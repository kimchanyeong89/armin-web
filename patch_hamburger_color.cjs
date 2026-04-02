const fs = require('fs');
let code = fs.readFileSync('src/components/GlobalNav.tsx', 'utf8');

code = code.replace(
    /background: isMenuOpen \? '#111111' : 'transparent',/,
    "background: '#111111',"
);

code = code.replace(
    /stroke=\{isMenuOpen \? "#FFFFFF" : "#111111"\}/,
    'stroke="#FFFFFF"'
);

fs.writeFileSync('src/components/GlobalNav.tsx', code);
