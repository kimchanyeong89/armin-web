const fs = require('fs');
let code = fs.readFileSync('src/components/GlobalNav.tsx', 'utf8');

code = code.replace(
    /style=\{\{ display: "block" \}\}/g,
    'style={{ display: "block", position: "relative", zIndex: 11, pointerEvents: "none" }}'
);

fs.writeFileSync('src/components/GlobalNav.tsx', code);
