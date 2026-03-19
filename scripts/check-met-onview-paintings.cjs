const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
console.log('cwd', root);

const dataPath = path.join(root, 'public', 'data', 'met-ny-on-view-paintings.json');
const statePath = path.join(root, 'scripts', '.state', 'met-ny-on-view-paintings-website.state.json');

console.log('dataExists', fs.existsSync(dataPath), dataPath);
console.log('stateExists', fs.existsSync(statePath), statePath);

const items = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));

console.log('count', items.length);
console.log('state', {
  pages: state.pages,
  totalKept: state.totalKept,
  finalCount: state.finalCount,
  offset: state.offset,
  lastPageCount: state.lastPageCount,
});
