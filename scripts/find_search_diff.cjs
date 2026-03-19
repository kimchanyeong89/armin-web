const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../public/data');
const searchIndexCode = fs.readFileSync(path.join(__dirname, 'generate-search-index.cjs'), 'utf8');

// Find skipped patterns to simulate what search actually loads
const skipExactMatches = Array.from(searchIndexCode.matchAll(/SKIP_EXACT\s*=\s*new Set\(\[\s*([\s\S]*?)\s*\]\)/g))[0];
// It's manually constructed in that file, let's just parse the directory like the search script

let allFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));

const SKIP_SUBSTRINGS = [
  'search-warm-prefix', '-chunk', 'artists', 'stats', 'test', 'temp', 'backup', 'search-index', 'search-manifest'
];
allFiles = allFiles.filter(f => !SKIP_SUBSTRINGS.some(sub => f.includes(sub)));


// Load mapped ones
const dataRaw = fs.readFileSync(path.join(__dirname, '../src/data/exhibitions.js'), 'utf8');
const normalizedObjStr = dataRaw
  .replace(/export const exhibitions = \[/, 'module.exports = [')
  .replace(/export const /g, '// ');

const tempPath = path.join(__dirname, 'temp_exh_diff.cjs');
fs.writeFileSync(tempPath, normalizedObjStr);
const museums = require(tempPath);
fs.unlinkSync(tempPath);

const mappedFiles = new Set();
const exhibitionKeys = ['exhibitions', 'permanentExhibitions', 'temporaryExhibitions', 'pastExhibitions', 'upcomingExhibitions', 'currentExhibitions'];

for (const mus of museums) {
  for (const k of exhibitionKeys) {
    if (Array.isArray(mus[k])) {
      for (const ex of mus[k]) {
         if(ex && (ex.collectionFile || ex.dataFile)) mappedFiles.add(ex.collectionFile || ex.dataFile);
      }
    }
  }
}

// Compare
let unmappedCount = 0;
let unmappedFiles = [];

for (const f of allFiles) {
  if (!mappedFiles.has(f)) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(dataDir, f)));
      const arr = Array.isArray(content) ? content : (content.items || content.data || content.artworks || []);
      const cnt = arr.length;
      if (cnt > 0) {
        unmappedCount += cnt;
        unmappedFiles.push({ file: f, count: cnt });
      }
    } catch(e) {}
  }
}

unmappedFiles.sort((a,b) => b.count - a.count);

console.log('--- FILES IN SEARCH INDEX BUT NOT IN UI ---');
for (const x of unmappedFiles) {
  console.log(`${x.file}: ${x.count}`);
}
console.log(`\nToal unmapped items: ${unmappedCount}`);

