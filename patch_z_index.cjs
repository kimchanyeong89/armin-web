const fs = require('fs');
let code = fs.readFileSync('src/components/GlobalNav.tsx', 'utf8');

// The black circle is likely being drawn normally but is missing z-index/position or has filter issues
code = code.replace(
    /borderRadius: '50%',\n\s*background: '#111111',/g,
    "borderRadius: '50%',\n                            background: '#111111',\n                            position: 'relative',\n                            zIndex: 10,"
);

fs.writeFileSync('src/components/GlobalNav.tsx', code);
