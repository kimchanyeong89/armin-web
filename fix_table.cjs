const fs = require('fs');

let c = fs.readFileSync('table_script_v4.cjs', 'utf8');
c = c.replace(
  "if (ex.id === 'wallace-collection') {",
  "if (ex.id === 'wallace-permanent' || filename.includes('wallace')) {"
);

fs.writeFileSync('table_script_v4.cjs', c, 'utf8');
