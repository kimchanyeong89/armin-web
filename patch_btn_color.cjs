const fs = require('fs');
let text = fs.readFileSync('src/components/GlobalNav.tsx', 'utf8');

text = text.replace(
    /background: isMenuOpen \? '#111111' : 'transparent',/,
    "background: isMenuOpen ? '#111111' : '#111111',"
);

text = text.replace(
    /stroke=\{isMenuOpen \? "#FFFFFF" : "#111111"\}/,
    'stroke="#FFFFFF"'
);

fs.writeFileSync('src/components/GlobalNav.tsx', text);
