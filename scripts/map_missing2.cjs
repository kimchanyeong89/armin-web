const fs = require('fs');
const path = '/Users/kietzsche/armin-web-main/src/data/exhibitions.js';
let content = fs.readFileSync(path, 'utf8');

function addExhibitionFallback(museumIdStr, exhId, fileName) {
  const regex = new RegExp(`(id:\\s*['"]${museumIdStr}['"][\\s\\S]*?(?:exhibitions|permanentExhibitions|collection)\\s*:\\s*\\[)([\\s\\S]*?)(\\][\\s\\S]*?)`, 'i');
  
  const match = content.match(regex);
  if (match) {
    if (!match[2].includes(exhId) && !match[2].includes(fileName)) {
      const injectionString = `{
        id: '${exhId}',
        name: '${exhId.replace(/-/g, ' ')}',
        nameKo: '추가 소장품',
        description: 'Loaded from ${fileName}',
        descriptionKo: '${fileName}에서 불러온 소장품',
        date: 'Permanent',
        dataFile: '${fileName}'
      }`;
      const insertStr = (match[2].trim() ? ',\n        ' : '\n        ') + injectionString + '\n      ';
      content = content.replace(regex, `$1${match[2]}${insertStr}$3`);
      console.log(`Added ${exhId} via fallback to ${museumIdStr}`);
    } else {
       console.log(`Fallback Skip ${exhId}, already in ${museumIdStr}`);
    }
  } else {
    console.log(`Neither found for ${museumIdStr}`);
  }
}

const list = [
  ['museo-reina-sofia', 'reina-full', 'reina-sofia-collection-full.json'],
  ['museo-reina-sofia', 'reina-on-display', 'reina-sofia-on-display.json'],
  
  ['the-metropolitan-museum-of-art', 'met-enriched', 'met-ny-on-view-paintings-enriched.json'],
  
  ['tate-modern', 'tate-art', 'tate-artworks.json'],
  ['tate-britain', 'tate-britain-artworks', 'tate-britain-artworks.json'],
  
  ['national-gallery-london', 'ngl-permanent', 'national-gallery-permanent.json']
];

for (const [mid, exhId, file] of list) {
  addExhibitionFallback(mid, exhId, file);
}

fs.writeFileSync(path, content, 'utf8');
console.log('Done mapping rounds 2.');
