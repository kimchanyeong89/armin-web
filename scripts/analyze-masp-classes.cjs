
const fs = require('fs');
const html = fs.readFileSync('debug-masp-results.html', 'utf8');
const classRegex = /class=["']([^"']+)["']/g;
const counts = {};
let m;
while ((m = classRegex.exec(html)) !== null) {
  const cls = m[1];
  cls.split(/\s+/).forEach(c => {
    counts[c] = (counts[c] || 0) + 1;
  });
}

const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
console.log('Top classes:');
console.log(sorted.slice(0, 50));

console.log('\nRelevant classes (item/card/box/gallery):');
console.log(sorted.filter(([c]) => /item|card|box|gallery/i.test(c)).slice(0, 50));
