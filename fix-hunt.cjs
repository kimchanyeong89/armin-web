const fs = require('fs');
let c = fs.readFileSync('scripts/upload-huntington-to-r2.cjs', 'utf-8');
c = c.replace("let fetchUrl = original;", "let fetchUrl = original;\n                if (fetchUrl.includes('IIIF3') && !fetchUrl.endsWith('.jpg')) { fetchUrl += '/full/!1200,1200/0/default.jpg'; }");
fs.writeFileSync('scripts/upload-huntington-to-r2.cjs', c, 'utf-8');
console.log('Fixed Huntington script');
