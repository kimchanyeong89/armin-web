const fs = require('fs');
let code = fs.readFileSync('src/pages/ExhibitionPage.tsx', 'utf8');

code = code.replace(
  /::-webkit-scrollbar \{/,
  `.sketch-modal-theme { background: transparent !important; }
        .sketch-modal-theme img { border-radius: 6px; }
        .sketch-modal-theme .aw-header { border-bottom: 1.5px dashed #d1ccc0 !important; background: transparent !important; }
        .sketch-modal-theme .aw-btn { border-radius: 999px; }
        
        ::-webkit-scrollbar {`
);
fs.writeFileSync('src/pages/ExhibitionPage.tsx', code);
console.log('patted');
