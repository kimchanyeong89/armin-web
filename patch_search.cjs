const fs = require('fs');
const content = fs.readFileSync('src/components/GlobalSearchBar.tsx', 'utf8');

let newContent = content.replace(
    /export interface GlobalSearchBarProps \{/,
    'export interface GlobalSearchBarProps { forceWidth?: string;'
);

newContent = newContent.replace(
    /width: isExpanded \? 'min\(420px, 85vw\)' : '48px',/,
    "width: forceWidth ? forceWidth : (isExpanded ? 'min(420px, 85vw)' : '48px'),"
);

// Also remove bouncy transitions completely, just linear/ease
newContent = newContent.replace(
    /cubic-bezier\(0\.34, 1\.1, 0\.64, 1\)/g,
    'ease-out'
);

fs.writeFileSync('src/components/GlobalSearchBar.tsx', newContent);
console.log('patched search bar');
