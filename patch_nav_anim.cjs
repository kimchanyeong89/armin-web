const fs = require('fs');
let code = fs.readFileSync('src/components/GlobalNav.tsx', 'utf8');

// The issue might be that SVG has display block, but line stroke isn't inheriting color right.
// Forcing stroke="#FFFFFF" on the path/lines might fix it.
code = code.replace(/<line x1="18" y1="6" x2="6" y2="18"><\/line>/g, '<line x1="18" y1="6" x2="6" y2="18" stroke="#FFFFFF"></line>');
code = code.replace(/<line x1="6" y1="6" x2="18" y2="18"><\/line>/g, '<line x1="6" y1="6" x2="18" y2="18" stroke="#FFFFFF"></line>');
code = code.replace(/<line x1="4" y1="12" x2="20" y2="12"><\/line>/g, '<line x1="4" y1="12" x2="20" y2="12" stroke="#FFFFFF"></line>');
code = code.replace(/<line x1="4" y1="6" x2="20" y2="6"><\/line>/g, '<line x1="4" y1="6" x2="20" y2="6" stroke="#FFFFFF"></line>');
code = code.replace(/<line x1="4" y1="18" x2="20" y2="18"><\/line>/g, '<line x1="4" y1="18" x2="20" y2="18" stroke="#FFFFFF"></line>');

fs.writeFileSync('src/components/GlobalNav.tsx', code);
