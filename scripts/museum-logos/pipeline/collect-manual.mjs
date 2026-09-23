// Fold the logo-hunt agents' manual/<id>/source.json files into manual/results.json for assemble.mjs.
import fs from 'fs';
import path from 'path';

const out = {};
const statuses = {};
for (const id of fs.readdirSync('manual').filter((d) => !d.startsWith('_') && fs.statSync(path.join('manual', d)).isDirectory())) {
  const p = path.join('manual', id, 'source.json');
  if (!fs.existsSync(p)) { statuses[id] = 'no-source.json'; continue; }
  let src;
  try { src = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { statuses[id] = 'bad-json'; continue; }
  statuses[id] = src.status || 'unknown';
  const files = (src.files || []).filter((f) => f.file && fs.existsSync(f.file) && !/\.(mask|dark)\.png$/.test(f.file));
  if (files.length) out[id] = files.map((f) => ({ file: f.file, note: `manual/${src.status || ''}`, url: f.url || f.page || '' }));
}
fs.writeFileSync('manual/results.json', JSON.stringify(out, null, 1));
const tally = Object.values(statuses).reduce((a, s) => ((a[s] = (a[s] || 0) + 1), a), {});
console.log('museums with manual files', Object.keys(out).length, tally);
console.log(Object.entries(statuses).map(([k, v]) => `${k}:${v}`).join('  '));
