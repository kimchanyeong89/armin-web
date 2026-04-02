const fs = require('fs');
let code = fs.readFileSync('src/components/GlobalNav.tsx', 'utf8');

code = code.replace(
    /stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", position: "relative", zIndex: 11, pointerEvents: "none" }}/g,
    'stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", position: "relative", zIndex: 11, pointerEvents: "none" }} color="#FFFFFF"'
);

fs.writeFileSync('src/components/GlobalNav.tsx', code);
