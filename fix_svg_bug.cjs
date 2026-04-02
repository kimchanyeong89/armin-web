const fs = require('fs');
let code = fs.readFileSync('src/components/GlobalNav.tsx', 'utf8');

code = code.replace(
    /position: 'relative',\n\s*zIndex: 10,\n\s*position: 'relative',\n\s*zIndex: 10,/g,
    "position: 'relative',\n                            zIndex: 10,"
);
code = code.replace(
    /<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style=\{\{ display: "block", position: "relative", zIndex: 11, pointerEvents: "none" \}\} color="#FFFFFF">/,
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", position: "relative", zIndex: 11, pointerEvents: "none", stroke: "#FFFFFF", fill: "none" }}>'
);
fs.writeFileSync('src/components/GlobalNav.tsx', code);
