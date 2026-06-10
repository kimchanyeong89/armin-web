// Reusable museum registrar: node scripts/.state/gen-register.mjs <swJsonPath> <anchorSlug> <permKo> <permEn>
// Reads the scriptwriter handoff JSON (exhibitions_entry), inserts a full entry block into
// exhibitions.js after the anchor museum's block, using live collection counts.
import fs from 'node:fs';

const [swPath, anchorSlug, permKo, permEn] = process.argv.slice(2);
if (!swPath || !anchorSlug) { console.error('usage: gen-register.mjs <swJson> <anchorSlug> [permKo] [permEn]'); process.exit(1); }

const sw = JSON.parse(fs.readFileSync(swPath, 'utf8'));
const slug = sw.slug;
const e = sw.exhibitions_entry;
const d = JSON.parse(fs.readFileSync(`public/data/${slug}-collection.json`, 'utf8'));
const cnt = d.artworks.length;
const cntF = cnt.toLocaleString('en-US');
const cats = {};
d.artworks.forEach(a => { cats[a.category] = (cats[a.category] || 0) + 1; });
const catKo = { painting: '회화', drawing: '드로잉', print: '판화', photograph: '사진', video: '영상', mixed_media_2d: '혼합매체', calligraphy: '서예' };
const catStrKo = Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => (catKo[k] || k) + v).join('·');
const dKo = permKo || `${cntF}점 — ${catStrKo}.`;
const dEn = permEn || `${cntF} works — ${Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k]) => k).join(', ')}.`;
const rep = (d.artworks.find(a => a.category === 'painting' && (a.imageUrl || '').includes('r2.dev')) || d.artworks.find(a => (a.imageUrl || '').includes('r2.dev'))).imageUrl;
const J = JSON.stringify;
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
let ex = fs.readFileSync('src/data/exhibitions.js', 'utf8');
if (ex.includes(`id: ${J(slug)}`)) { console.log(`${slug}: 이미 등록됨 — skip`); process.exit(0); }
const anchor = new RegExp(`collectionFile: "${anchorSlug}-collection\\.json" \\}\\n    \\],\\n    temporaryExhibitions: \\[\\],\\n    pastExhibitions: \\[\\],\\n    exhibitions: \\[\\]\\n  \\},`);
const m = ex.match(anchor);
if (!m) { console.error(`ANCHOR NOT FOUND: ${anchorSlug}`); process.exit(1); }
ex = ex.replace(m[0], m[0] + '\n' + block);
fs.writeFileSync('src/data/exhibitions.js', ex);
console.log(`✓ ${slug} 등록 (${cntF}점, ${e.city}, ${e.country}) [${catStrKo}]`);
