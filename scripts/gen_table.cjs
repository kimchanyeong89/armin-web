const fs = require('fs');
const path = require('path');

const dataRaw = fs.readFileSync(path.join(__dirname, '../src/data/exhibitions.js'), 'utf8');
const normalizedObjStr = dataRaw
  .replace(/export const exhibitions = \[/, 'module.exports = [')
  .replace(/export const /g, '// ');

const tempPath = path.join(__dirname, 'temp_exh.cjs');
fs.writeFileSync(tempPath, normalizedObjStr);
const museums = require(tempPath);
fs.unlinkSync(tempPath);

let totalCount = 0;
let markdown = `| 미술관 | 컬렉션/전시 | 파일명 | 데이터 수 |\n|---|---|---|---|\n`;

for (const mus of museums) {
  const museumName = mus.name;
  
  if (mus.permanentExhibitions) {
    for (const ex of mus.permanentExhibitions) {
      const targetFile = ex.collectionFile || ex.dataFile;
      if (!targetFile) continue;
      
      const filePath = path.join(__dirname, '../public/data/', targetFile);
      if (fs.existsSync(filePath)) {
        try {