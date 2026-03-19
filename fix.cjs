const fs = require('fs');
let code = fs.readFileSync('scripts/find_missing.cjs', 'utf8');
code = code.replace(/src\/data\/exhibitions.js/g, '../src/data/exhibitions.js');
code = code.replace(/public\/data/g, '../public/data');
code = code.replace(/temp_exh.cjs/g, '../temp_exh.cjs');
code = code.replace(/\.\/temp_exh\.cjs/g, '../temp_exh.cjs');
fs.writeFileSync('scripts/find_missing.cjs', code);
