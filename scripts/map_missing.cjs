const fs = require('fs');
const path = '/Users/kietzsche/armin-web-main/src/data/exhibitions.js';
let content = fs.readFileSync(path, 'utf8');

function addExh(museumKey, exhId, fileName) {
  // Regex to match e.g. `nga: { id: ..., exhibitions: [`
  const regex = new RegExp(`(${museumKey}\\s*:\\s*\\{[\\s\\S]*?exhibitions\\s*:\\s*\\[)([\\s\\S]*?)(\\][\\s\\S]*?)`, 'i');
  
  const match = content.match(regex);
  if (match) {
    if (!match[2].includes(exhId) && !match[2].includes(fileName)) {
      const injectionString = `{
          id: '${exhId}',
          name: '${exhId.replace(/-/g, ' ')}',
          nameKo: '전체 / 세부 소장품',
          description: 'Loaded from ${fileName}',
          descriptionKo: '${fileName}에서 불러온 소장품',
          date: 'Permanent',
          dataFile: '${fileName}'
        }`;
      
      const insertStr = (match[2].trim() ? ',\n        ' : '\n        ') + injectionString + '\n      ';
      
      content = content.replace(regex, `$1${match[2]}${insertStr}$3`);
      console.log(`Added ${exhId} to ${museumKey}`);
    } else {
      console.log(`Skip ${exhId}, already in ${museumKey}`);
    }
  } else {
    // maybe it is a flat list `export const exhibitions = [`?
    // Oh, the front format. Oh, I should just use `id: 'nga-washington'`
    // Wait, earlier I saw `export const exhibitions = [` but wait, was that the actual content? 
    // Let me check.
  }
}

function addExhibitionFallback(museumIdStr, exhId, fileName) {
  // if format is export const exhibitions = [{ id: 'mfah', ... }]
  // matching `id: "museum_id" ... permanentExhibitions: [` OR `id: 'museum_id' ... exhibitions: [`
  // Wait, I saw both representations perhaps from my imagination. Let's just make it robust.
  const regex = new RegExp(`(id:\\s*['"]${museumIdStr}['"][\\s\\S]*?(?:exhibitions|permanentExhibitions|collection)\\s*:\\s*\\[)([\\s\\S]*?)(\\][\\s\\S]*?)`, 'i');
  
  const match = content.match(regex);
  if (match) {
    if (!match[2].includes(exhId) && !match[2].includes(fileName)) {
      const keyStr = match[1].includes('dataFile') ? 'dataFile' : 
                     (match[1].includes('collectionFile') ? 'collectionFile' : 'dataFile');
      const injectionString = `{
        id: '${exhId}',
        name: '${exhId.replace(/-/g, ' ')}',
        nameKo: '전체 / 세부 소장품',
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
  ['nga-washington', 'nga-full-col', 'nga-collection-full.json'],
  ['nga', 'nga-full-col', 'nga-collection-full.json'],
  
  ['vam', 'vam-paintings', 'vam-paintings.json'],
  ['vam', 'vam-portraits', 'vam-portraits.json'],
  ['vam', 'vam-photographs', 'vam-photographs.json'],
  ['victoria-and-albert', 'vam-portraits', 'vam-portraits.json'],

  ['national-museum-korea', 'nmk-missing', 'national-museum-korea-missing.json'],
  ['nmk', 'nmk-missing', 'national-museum-korea-missing.json'],
  
  ['agnsw', 'agnsw-full', 'agnsw-collection-full.json'],
  ['art-gallery-of-nsw', 'agnsw-full', 'agnsw-collection-full.json'],

  ['lacma', 'lacma-japanese', 'lacma-japanese-prints.json'],
  ['lacma', 'lacma-drawings51', 'lacma-drawings-51.json'],
  ['lacma', 'lacma-list', 'lacma-list.json'],

  ['met', 'met-enriched', 'met-ny-on-view-paintings-enriched.json'],
  ['metropolitan', 'met-enriched', 'met-ny-on-view-paintings-enriched.json'],

  ['reinasofia', 'reina-full', 'reina-sofia-collection-full.json'],
  ['reina-sofia', 'reina-full', 'reina-sofia-collection-full.json'],
  ['reinasofia', 'reina-on-display', 'reina-sofia-on-display.json'],
  
  ['tate', 'tate-art', 'tate-artworks.json'],
  ['tatebritain', 'tate-britain', 'tate-britain-artworks.json'],
  ['tate-britain', 'tate-britain', 'tate-britain-artworks.json'],
  
  ['fine-arts-be', 'fine-arts-be-all', 'fine-arts-be-complete.json'],
  ['kroller-muller', 'km-photo', 'kroller-muller-photography.json'],
  
  ['mfah', 'mfah-paintings', 'mfah-paintings.json'],
  
  ['egyptian-museum-cairo', 'cairo-relics', 'egyptian-museum-cairo-collection.json'],
  ['egyptian', 'cairo-relics', 'egyptian-museum-cairo-collection.json'],

  ['national-gallery-london', 'ngl-permanent', 'national-gallery-permanent.json'],
  ['nationalGalleryLondon', 'ngl-permanent', 'national-gallery-permanent.json'],

  ['mplus', 'mplus-high', 'mplus-collection-highlights.json'],
  ['mplus-museum', 'mplus-high', 'mplus-collection-highlights.json'],

  ['mamcs', 'mamcs-dg', 'mamcs-strasbourg-drawings-collection.json'],
  ['mamcs', 'mamcs-pg', 'mamcs-strasbourg-photography-collection.json'],
  ['mamcs', 'mamcs-pt', 'mamcs-strasbourg-paintings-collection.json']
];

for (const [mid, exhId, file] of list) {
  addExhibitionFallback(mid, exhId, file);
  addExh(mid, exhId, file);
}

fs.writeFileSync(path, content, 'utf8');
console.log('Done mapping.');
