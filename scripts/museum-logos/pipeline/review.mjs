// Review sheets: one row per museum → [auto/selected pick, then remaining candidates by score], dark previews.
//   node review.mjs <outPrefix> [--ids=a,b] [--per=18]
import fs from 'fs';
import { execFileSync } from 'child_process';
const { exhibitions } = await import('/Users/kietzsche/armin-web-main/src/data/exhibitions.js');
const cands = JSON.parse(fs.readFileSync('cands.json', 'utf8'));
const picks = JSON.parse(fs.readFileSync('picks.json', 'utf8'));
const prefix = process.argv[2];
const ids = (process.argv.find(a => a.startsWith('--ids=')) || '').slice(6).split(',').filter(Boolean);
const per = Number((process.argv.find(a => a.startsWith('--per=')) || '--per=18').slice(6));
const order = exhibitions.map(m => m.id).filter(id => cands[id] && (!ids.length || ids.includes(id)));
const rows = order.map(id => {
  const list = cands[id].filter(c => c.preview).sort((a, b) => b.score - a.score);
  const p = picks[id];
  const pick = p ? list.find(c => c.n === p.n) : null;
  const rest = list.filter(c => c !== pick);
  const m = exhibitions.find(x => x.id === id);
  const fmt = c => ({ path: c.preview, dark: true, note: `#${c.n} ${c.source}/${c.kind} ${c.vector ? 'vec' : c.w + 'x' + c.h} s${c.score} m${c.mid}` });
  return { label: id, sub: (m.name_ko || m.name), files: [...(pick ? [fmt(pick)] : [{ path: '/nonexistent', note: 'NO PICK' }]), ...rest.slice(0, 4).map(fmt)] };
});
for (let i = 0, pg = 0; i < rows.length; i += per, pg++) {
  fs.writeFileSync(`${prefix}-${pg}.json`, JSON.stringify(rows.slice(i, i + per)));
  execFileSync('node', ['sheet.mjs', `${prefix}-${pg}.json`, `${prefix}-${pg}.png`, '5']);
  console.log(`${prefix}-${pg}.png`, rows.slice(i, i + per).map(r => r.label).join(','));
}
