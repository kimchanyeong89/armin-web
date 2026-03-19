const fs = require('fs');
const path = require('path');

const dataRaw = fs.readFileSync(path.join(__dirname, '../src/data/exhibitions.js'), 'utf8');
const normalizedObjStr = dataRaw
  .replace(/export const exhibitions = \[/, 'module.exports = [')
  .replace(/export const /g, '// ');

const tempPath = path.join(__dirname, 'temp_exh_final.cjs');
fs.writeFileSync(tempPath, normalizedObjStr);
const museums = require(tempPath);
fs.unlinkSync(tempPath);

let rows = [];
let totalCount = 0;
let seenFiles = new Set();

const exhibitionKeys = [
  'exhibitions',
  'permanentExhibitions',
  'temporaryExhibitions',
  'pastExhibitions',
  'upcomingExhibitions',
  'currentExhibitions',
  'collection'
];

for (const mus of museums) {
  const museumName = mus.name;
  let country = mus.country || 'Unknown';
  if (country === 'UK') country = 'UK';
  if (country === 'USA') country = 'USA';
  
  for (const key of exhibitionKeys) {
    if (Array.isArray(mus[key])) {
      for (const ex of mus[key]) {
        if (!ex) continue;
        const targetFile = ex.collectionFile || ex.dataFile;
        if (!targetFile) continue;
        
        // Anti-duplicate rule for UI components that might reuse the same file via multiple keys
        if (seenFiles.has(targetFile)) continue;
        seenFiles.add(targetFile);

        const filePath = path.join(__dirname, '../public/data/', targetFile);
        let num = 0;
        let r2Status = '❌ (미완료)';
        
        if (fs.existsSync(filePath)) {
          try {
            const content = JSON.parse(fs.readFileSync(filePath));
            const arr = Array.isArray(content) ? content : (content.items || content.data || content.artworks || []);
            num = arr.length;
            totalCount += num;
            
            // Check R2 status by inspecting first 20 items
            const sample = arr.slice(0, 20);
            const sampleStr = JSON.stringify(sample);
            if (sampleStr.includes('.r2.dev') || sampleStr.includes('pub-') || sampleStr.includes('r2_url') || sampleStr.includes('r2_image')) {
              r2Status = '✅ (완료)';
            }
          } catch(e) {}
        }
        
        rows.push({
          country,
          museumName,
          exhName: ex.nameKo || ex.title || ex.name,
          targetFile,
          num,
          r2Status
        });
      }
    }
  }
}

// Sort by country alphabet, then museum name
rows.sort((a, b) => {
  const cA = a.country.toLowerCase();
  const cB = b.country.toLowerCase();
  if (cA < cB) return -1;
  if (cA > cB) return 1;
  return a.museumName.localeCompare(b.museumName);
});

let markdown = `| 국가 | 미술관 | 컬렉션/전시 | 연결된 파일명 | 데이터 수 | R2 저장 여부 |\n|---|---|---|---|---|---|\n`;

for (const r of rows) {
  markdown += `| ${r.country} | ${r.museumName} | ${r.exhName} | \`${r.targetFile}\` | ${r.num.toLocaleString()} | ${r.r2Status} |\n`;
}

console.log(markdown);
console.log(`\n**총합계**: ${totalCount.toLocaleString()} 점\n`);
