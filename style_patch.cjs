const fs = require('fs');
let code = fs.readFileSync('src/components/DrawingMapModal.tsx', 'utf8');

code = code.replace('.sketch-modal-theme > div > div {', 
`.sketch-modal-theme > div,
        .sketch-modal-theme > div > div {`);

fs.writeFileSync('src/components/DrawingMapModal.tsx', code);
console.log('patched');
