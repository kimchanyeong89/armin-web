// Fix the 3 gap6 entries that gen-register inserted with `undefined` fields
// (their exhibitions_entry was a STRING, not an object). Parse the string,
// rebuild a correct block with live counts + a verified r2.dev rep image.
import fs from 'node:fs';
const SLUGS = ['ars-electronica', 'azw-vienna', 'neue-sammlung'];
const catKo = { painting: '회화', drawing: '드로잉', print: '판화', photograph: '사진', video: '영상', media_art: '미디어아트', mixed_media_2d: '혼합매체', sculpture: '조각', design: '디자인' };
let ex = fs.readFileSync('src/data/exhibitions.js', 'utf8');
const J = JSON.stringify;
for (const slug of SLUGS) {
  const sw = JSON.parse(fs.readFileSync(`scripts/.state/gap6-results/${slug}.json`, 'utf8'));
  let e = sw.exhibitions_entry;
  if (typeof e === 'string') e = (new Function('return (' + e + ')'))();
  const d = JSON.parse(fs.readFileSync(`public/data/${slug}-collection.json`, 'utf8'));
  const cntF = d.artworks.length.toLocaleString('en-US');
  const cats = {};
  d.artworks.forEach((a) => { cats[a.category] = (cats[a.category] || 0) + 1; });
  const catStrKo = Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => (catKo[k] || k) + v).join('·');
  const dKo = `${cntF}점 — ${catStrKo}.`;
  const dEn = `${cntF} works — ${Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k]) => k).join(', ')}.`;
  const rep = (d.artworks.find((a) => (a.imageUrl || '').includes('r2.dev')) || {}).imageUrl || e.representativeImage;
  const block = `  {
    id: ${J(slug)},
    name_ko: ${J(e.name_ko)},
    name: ${J(e.name)},
    city: ${J(e.city)},
    country: ${J(e.country)},
    latitude: ${e.latitude},
    longitude: ${e.longitude},
    description_ko: ${J(e.description_ko)},
    description: ${J(e.description)},
    representativeImage: ${J(rep)},
    permanentExhibitions: [
      { id: ${J(slug + '-collection')}, name: "Collection", name_en: "Collection", title: ${J(e.name + ' — Collection')}, title_en: ${J(e.name + ' — Collection')}, description: ${J(dKo)}, description_en: ${J(dEn)}, startDate: "Permanent", endDate: "Permanent", collectionFile: ${J(slug + '-collection.json')} }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },`;
  const re = new RegExp('  \\{\\n    id: "' + slug + '",[\\s\\S]*?\\n    exhibitions: \\[\\]\\n  \\},');
  if (!re.test(ex)) { console.log(`${slug}: 깨진 블록 못 찾음 — skip`); continue; }
  ex = ex.replace(re, block);
  console.log(`✓ ${slug}: ${e.name} | ${e.city}, ${e.country} (${e.latitude}, ${e.longitude}) [${catStrKo}]`);
}
fs.writeFileSync('src/data/exhibitions.js', ex);
console.log('saved exhibitions.js');
