import fs from 'node:fs';
const sw = JSON.parse(fs.readFileSync('scripts/.state/na1-scripts/icp-ny.json', 'utf8'));
const e = sw.exhibitions_entry;
const d = JSON.parse(fs.readFileSync('public/data/icp-ny-collection.json', 'utf8'));
const cnt = d.artworks.length;
const rep = (d.artworks.find(a => (a.imageUrl || '').includes('r2.dev')) || {}).imageUrl;
const J = JSON.stringify;
const cntF = cnt.toLocaleString('en-US');
const block = `  {
    id: "icp-ny",
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
      { id: "icp-ny-collection", name: "Collection", name_en: "Collection", title: ${J(e.name + ' — Collection')}, title_en: ${J(e.name + ' — Collection')}, description: ${J(cntF + '점 — 사진 (포토저널리즘·다큐멘터리·동시대 사진).')}, description_en: ${J(cntF + ' photographs — photojournalism, documentary and contemporary image-making.')}, startDate: "Permanent", endDate: "Permanent", collectionFile: "icp-ny-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },`;
let ex = fs.readFileSync('src/data/exhibitions.js', 'utf8');
if (ex.includes('id: "icp-ny"')) { console.log('이미 등록됨 — skip'); process.exit(0); }
const anchor = `collectionFile: "dma-dallas-collection.json" }
    ],
    temporaryExhibitions: [],
    pastExhibitions: [],
    exhibitions: []
  },`;
if (!ex.includes(anchor)) { console.error('ANCHOR NOT FOUND'); process.exit(1); }
ex = ex.replace(anchor, anchor + '\n' + block);
fs.writeFileSync('src/data/exhibitions.js', ex);
console.log(`✓ icp-ny 등록 (${cntF}점, ${e.city}, ${e.country})`);
