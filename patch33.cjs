const fs = require('fs');
let code = fs.readFileSync('src/components/ExhibitionModal.tsx', 'utf8');

code = code.replace(
`    <div
      style={{
        position: inline ? "absolute" : "fixed",`,
`    <div
      className={variant === 'sketch' ? 'sketch-modal-theme' : ''}
      style={{
        position: inline ? "absolute" : "fixed",`
);

fs.writeFileSync('src/components/ExhibitionModal.tsx', code);
console.log('patched ExhibitionModal wrapper');
