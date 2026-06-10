import fs from 'node:fs';
const sw = JSON.parse(fs.readFileSync('scripts/.state/sa1-scripts/museo-jumex.json', 'utf8'));
const e = sw.exhibitions_entry; // country "Mexico" matches existing naming (2 entries)
const d = JSON.parse(fs.readFileSync('public/data/museo-jumex-collection.json', 'utf8'));
const cnt = d.artworks.length;
const rep = (d.artworks.find(a => a.category === 'painting' && (a.imageUrl || '').includes('r2.dev')) || d.artworks.find(a => (a.imageUrl || '').includes('r2.dev'))).imageUrl;
const J = JSON.stringify;
const block = `  {
    id: "museo-jumex",
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
      { id: "museo-jumex-collection", name: "Collection", name_en: "Collection", title: ${J(e.name + ' — Collection')}, title_en: ${J(e.name + ' — Collection')}, description: ${J(cnt + '점 — 사진·회화·영상·드로잉 (콜렉시온 후멕스 동시대 미술).')}, description_en: ${J(cnt + ' works — photographs, paintings, video and drawings from Colección Jumex.')}, startDate: "Permanent", endDate: "Permanent", collectionFile: "museo-jumex-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },`;
let ex = fs.readFileSync('src/data/exhibitions.js', 'utf8');
if (ex.includes('id: "museo-jumex"')) { console.log('이미 등록됨 — skip'); process.exit(0); }
const anchor = `collectionFile: "icp-ny-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },`;
if (!ex.includes(anchor)) { console.error('ANCHOR NOT FOUND'); process.exit(1); }
ex = ex.replace(anchor, anchor + '\n' + block);
fs.writeFileSync('src/data/exhibitions.js', ex);
console.log(`✓ museo-jumex 등록 (${cnt}점, ${e.city}, ${e.country})`);
