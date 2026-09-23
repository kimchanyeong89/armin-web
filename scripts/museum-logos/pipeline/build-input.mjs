import fs from 'fs';
const { exhibitions } = await import('/Users/kietzsche/armin-web-main/src/data/exhibitions.js');
const w = new Map(JSON.parse(fs.readFileSync('wikidata.json', 'utf8')).map(o => [o.id, o]));
const overrides = {
  'mnba-habana': 'https://www.bellasartes.co.cu/', 'kiasma-collection': 'https://kiasma.fi/en/', 'nmfa-manila': 'https://www.nationalmuseum.gov.ph/',
  staatsgalerien: 'https://www.pinakothek.de/en', mplus: 'https://www.mplus.org.hk/en/', 'powerhouse-sydney': 'https://powerhouse.com.au/',
};
const rows = [], missing = [];
for (const m of exhibitions) {
  const subs = [...(m.permanentExhibitions || []), ...(m.temporaryExhibitions || [])];
  const url = overrides[m.id] || (w.get(m.id)?.best?.website || [])[0] || subs.map(s => s.officialUrl).find(Boolean);
  if (url) rows.push({ id: m.id, url }); else missing.push(`${m.id} | ${m.name} | ${m.name_ko || ''} | ${m.location || m.city || ''}`);
}
fs.writeFileSync('site-input.json', JSON.stringify(rows, null, 1));
console.log('with url', rows.length, 'missing', missing.length); console.log(missing.join('\n'));
