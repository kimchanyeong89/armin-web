const fs = require('fs');
let code = fs.readFileSync('src/components/ExhibitionModal.tsx', 'utf8');

code = code.replace(
`          {/* Close Button */}
          <button`,
`          {/* Close Button */}
          {!inline && (<button`
);

code = code.replace(
`            close
          </button>`,
`            close
          </button>)}`
);

fs.writeFileSync('src/components/ExhibitionModal.tsx', code);
console.log('patched');
