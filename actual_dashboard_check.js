const fs = require('fs');
const content = fs.readFileSync('scripts/tepapa-r2-dashboard.cjs', 'utf-8');
console.log(content.substring(0, 500));
