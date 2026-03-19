const fs = require('fs');
let code = fs.readFileSync('src/components/GlobalSearchBar.tsx', 'utf8');

const oldStr = 'stroke={isDrawingSkin ? (isExpanded ? "#111" : "#FFFFFF") : (inlineMode && !isExpanded ? "#1a1918" : "#c9a55a")} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">';
const newStr = 'stroke={isDrawingSkin ? (isExpanded ? "#111" : "#FFFFFF") : (inlineMode && !isExpanded ? "#1a1918" : "#c9a55a")} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "stroke 0.4s" }}>';

code = code.replace(oldStr, newStr);

fs.writeFileSync('src/components/GlobalSearchBar.tsx', code);
console.log('patched');
