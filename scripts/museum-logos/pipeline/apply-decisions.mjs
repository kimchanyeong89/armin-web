// decisions.json → picks.json (validated). A decision names its candidate by n (round 1) or by source
// file (round 2+, stable across re-assembly). s: ok | pick | manual (optional fallback) | text.
import fs from 'fs';
const { exhibitions } = await import('/Users/kietzsche/armin-web-main/src/data/exhibitions.js');
const dec = JSON.parse(fs.readFileSync('decisions.json', 'utf8')); delete dec._legend;
const cands = JSON.parse(fs.readFileSync('cands.json', 'utf8'));
const prev = JSON.parse(fs.readFileSync('picks.json', 'utf8'));
const ids = new Set(exhibitions.map((m) => m.id));
const missing = [...ids].filter((id) => !dec[id]), unknown = Object.keys(dec).filter((id) => !ids.has(id));
const resolve = (id, d, key) => {
  const list = cands[id] || [];
  const c = d.file ? list.find((x) => x.srcPath === d.file) : list.find((x) => x.n === d[key]);
  return c?.mask ? c.n : null;
};
const bad = [];
const out = {};
for (const m of exhibitions) {
  const d = dec[m.id];
  if (!d) continue;
  if (d.s === 'ok') { if (prev[m.id]?.n == null) bad.push(`${m.id}: ok without a pick`); else out[m.id] = { n: prev[m.id].n, auto: false, status: 'ok' }; }
  else if (d.s === 'pick') { const n = resolve(m.id, d, 'n'); if (n == null) bad.push(`${m.id}: pick not found`); else out[m.id] = { n, auto: false, status: 'pick', ...(d.mode ? { mode: d.mode } : {}) }; }
  else if (d.s === 'manual') { const n = d.file || d.fb != null ? resolve(m.id, d, 'fb') : null; out[m.id] = n == null ? null : { n, auto: false, status: 'fallback' }; if ((d.file || d.fb != null) && n == null) bad.push(`${m.id}: fallback not found`); }
  else if (d.s === 'text') out[m.id] = null;
  else bad.push(`${m.id}: unknown status ${d.s}`);
}
console.log('decided', Object.keys(dec).length, 'missing', missing, 'unknown', unknown, 'bad', bad);
if (missing.length || unknown.length || bad.length) process.exit(1);
fs.writeFileSync('picks.json', JSON.stringify(out, null, 1));
const tally = Object.values(dec).reduce((a, d) => ((a[d.s] = (a[d.s] || 0) + 1), a), {});
console.log('statuses', tally, '| logos', Object.values(out).filter(Boolean).length, '| text logos', Object.values(out).filter((x) => !x).length);
