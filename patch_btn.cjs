const fs = require('fs');
let text = fs.readFileSync('src/components/GlobalNav.tsx', 'utf8');
text = text.replace(/<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke=\{isMenuOpen \? "#FFFFFF" : "#111111"\} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">/, 
'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isMenuOpen ? "#FFFFFF" : "#111111"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>');
fs.writeFileSync('src/components/GlobalNav.tsx', text);
