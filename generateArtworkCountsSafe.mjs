import fs from 'fs';
import path from 'path';

function getCountFast(filepath) {
  if (!fs.existsSync(filepath)) return 0;
  
  const stats = fs.statSync(filepath);
  const sizeMB = stats.size / (1024 * 1024);
  
  let content = fs.readFileSync(filepath, 'utf8');
  
  if (sizeMB > 25) {
     return content.split('},{').length;
  }
  
  try {
    const data = JSON.parse(content);
    if (Array.isArray(data)) return data.length;
    if (data.objects && Array.isArray(data.objects)) return data.objects.length;
    if (data.items && Array.isArray(data.items)) return data.items.length;
    if (data.data && Array.isArray(data.data)) return data.data.length;
    if (data.artworks && Array.isArray(data.artworks)) return data.artworks.length;
    if (data.result && Array.isArray(data.result)) return data.result.length;
    return 0;
  } catch(e) {
    if (content.split) return content.split('},{').length;
    return 0;
  }
}

async function run() {
  const mod = await import('./src/data/exhibitions.js');
  const exhibitions = mod.exhibitions;
  const counts = {};
  const parsedFiles = {};
  const seenFiles = new Set();
  
  for (const ex of exhibitions) {
    let count = 0;
    const processF = (file) => {
      if (!file) return;
      if (seenFiles.has(file)) return;
      seenFiles.add(file);
      
      if (parsedFiles[file] === undefined) {
         parsedFiles[file] = getCountFast(path.join(process.cwd(), 'public', 'data', file));
      }
      count += parsedFiles[file];
    };
    
    if (ex.collectionFile) processF(ex.collectionFile);
    if (Array.isArray(ex.permanentExhibitions)) ex.permanentExhibitions.forEach(tEx => processF(tEx.collectionFile));
    if (Array.isArray(ex.temporaryExhibitions)) ex.temporaryExhibitions.forEach(tEx => processF(tEx.collectionFile));
    if (Array.isArray(ex.pastExhibitions)) ex.pastExhibitions.forEach(tEx => processF(tEx.collectionFile));
    
    counts[ex.id] = count;
    seenFiles.clear();
  }
  
  fs.writeFileSync('./public/data/museum-artwork-counts.json', JSON.stringify(counts, null, 2));
  console.log("SUCCESS! Total venues mapped:", Object.keys(counts).length);
}

run().catch(console.error);
