const fs = require('fs');
let code = fs.readFileSync('src/components/GlobalNav.tsx', 'utf8');

code = code.replace(
    /background: isMenuOpen \? '#111111' : '#111111',/,
    "background: isMenuOpen ? '#111111' : 'transparent',"
);

code = code.replace(
    /<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>/,
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isMenuOpen ? "#FFFFFF" : "#111111"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>'
);

fs.writeFileSync('src/components/GlobalNav.tsx', code);
