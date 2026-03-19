const fs = require('fs');
let code = fs.readFileSync('src/components/GlobalSearchBar.tsx', 'utf8');

// remove var(--ap-card-bg)
code = code.replace(/background: isDark \? 'var\(--ap-card-bg\)' : 'transparent'/g, "background: 'transparent'");

// remove the border on the right of artist-bio
code = code.replace(/borderRight: isMobile \? 'none' : '1px solid var\(--ap-border\)'/g, "borderRight: 'none'");

fs.writeFileSync('src/components/GlobalSearchBar.tsx', code, 'utf8');
