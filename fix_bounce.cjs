const fs = require('fs');
let code = fs.readFileSync('src/components/GlobalSearchBar.tsx', 'utf8');

code = code.replace(
    /width 450ms ease-out, background 300ms ease, border-radius 350ms ease/g,
    'width 450ms ease, background 300ms ease, border-radius 350ms ease'
);
code = code.replace(
    /width 450ms ease-in-out, background 300ms ease, border-radius 350ms ease/g,
    'width 450ms ease, background 300ms ease, border-radius 350ms ease'
);

fs.writeFileSync('src/components/GlobalSearchBar.tsx', code);
