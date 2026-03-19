const fs = require('fs');
const path = require('path');
let code = fs.readFileSync(path.join(__dirname, '../src/data/exhibitions.js'), 'utf8')
    .replace(/export const exhibitions = /, 'module.exports = ')
    .replace(/export default .*?;?/, '');
let imports = code.match(/import .*?;?/g);
if (imports) imports.forEach(imp => { code = code.replace(imp, ''); });
fs.writeFileSync(path.join(__dirname, '../temp_exh.cjs'), code);

const museums = require(path.join(__dirname, '../temp_exh.cjs'));
const mappedFiles = new Set();
const knownIds = new Set();
museums.forEach(m => {
    let list = [];
    if (m.permanentExhibitions) list.push(...m.permanentExhibitions);
    if (m.temporaryExhibitions) list.push(...m.temporaryExhibitions);
    if (m.pastExhibitions) list.push(...m.pastExhibitions);
    if (m.exhibitions) list.push(...m.exhibitions);
    list.forEach(col => {
        let f = col.collectionFile || col.dataFile || (col.id.replace('.json', '') + '.json');
        mappedFiles.add(f);
        knownIds.add(col.id.replace('.json', ''));
    });
});
const dataDir = path.join(__dirname, '../public/data');
const allJsonFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
let realMissing = [];
allJsonFiles.forEach(file => {
    if (mappedFiles.has(file) === false) {
        let bareId = file.replace('.json', '');
        if (knownIds.has(bareId)) return;
        try {
            const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
            const count = Array.isArray(data) ? data.length : (data.items ? data.items.length : 0);
            if (count > 0 && file.indexOf('search-index') === -1 && file.indexOf('backup') === -1 && file.indexOf('temp') === -1 && file.indexOf('debug') === -1 && file.indexOf('test') === -1 && file.indexOf('fixed') === -1 && file.indexOf('clean') === -1) {
                realMissing.push({file, count});
            }
        } catch (e) {}
    }
});
realMissing.sort((a,b) => b.count - a.count);
console.log('=== UNMAPPED JSON FILES ===');
realMissing.forEach(x => console.log('- ' + x.file + ': ' + x.count));