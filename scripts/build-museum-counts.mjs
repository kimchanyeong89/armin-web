// Regenerate public/data/museum-artwork-counts.json: per-museum total artwork count
// (summed across all sub-collections, counting only artworks with an image).
// collectionFile may be an R2 URL — read the LOCAL file by its bare filename.
import fs from 'node:fs';
import path from 'node:path';
const mod = await import('../src/data/exhibitions.js');
const EXHIBITIONS = mod.EXHIBITIONS || mod.exhibitions || mod.default || [];
const counts = {};
let missing = 0;
for (const m of EXHIBITIONS) {
  const subs = [...(m.permanentExhibitions||[]), ...(m.temporaryExhibitions||[]), ...(m.pastExhibitions||[])];
  let total = 0;
  for (const s of subs) {
    if (!s.collectionFile) continue;
    const fn = String(s.collectionFile).split('/').pop();
    try {
      const j = JSON.parse(fs.readFileSync(path.join('public/data', fn), 'utf8'));
      const a = j.artworks || j.objects || j.items || [];
      total += a.filter(x => x.imageUrl || x.image || x.thumbnailUrl).length;
    } catch { missing++; }
  }
  counts[m.id] = total;
}
fs.writeFileSync('public/data/museum-artwork-counts.json', JSON.stringify(counts));
const sum = Object.values(counts).reduce((a,b)=>a+b,0);
console.log('museums:', Object.keys(counts).length, '| sum:', sum.toLocaleString(), '| missing-files:', missing);
console.log('mak-vienna:', counts['mak-vienna'], '| albertina:', counts['albertina-museum'], '| aic:', counts['aic'], '| moma:', counts['moma-collection']);
