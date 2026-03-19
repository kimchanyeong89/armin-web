const fs = require('fs');
let code = fs.readFileSync('src/components/GlobalSearchBar.tsx', 'utf8');

console.log('BACKGROUND:', code.includes("background: isDrawingSkin ? '#FFFFFF'"));
console.log('BOX SHADOW:', code.includes("boxShadow: isDrawingSkin"));
console.log('BORDER:', code.includes("border: isDrawingSkin ? '3px solid #111111'"));
console.log('AI BUTTON BORDER:', code.includes("border: isAIMode ? 'none' : (isDrawingSkin ? '2px solid #111'"));
console.log('ICON:', code.includes('stroke={isDrawingSkin ? "#111" : (inlineMode && !isExpanded'));
console.log('WRAP BG:', code.includes("background: (inlineMode && isDrawingSkin) ? 'transparent'"));
