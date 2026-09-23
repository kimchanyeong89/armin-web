// 후쿠오카 컬렉션의 이미지 디테일 총량을 잰다.
//
// 사용자가 "저화질"로 지목한 것들은 해상도도 압축률도 정상인데 물러 보였다.
// 재보니 갈리는 건 **디테일 총량**이었다 — 지목한 7점이 2.7~7.4, 멀쩡한 7점이
// 7.8~15.5 로 겹치지 않았다. 원본이 물러진 복제본이라 재인코딩으로는 못 살린다.
//
//   node scripts/measure-faam-detail.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pLimit from 'p-limit';
import { grainRatio } from './lib/noise-estimate.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'public/data/faam-fukuoka-collection.json');
const OUT = path.join(ROOT, 'scripts/.state/faam-detail.json');

const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const arr = j.artworks;
const lim = pLimit(12);
const out = [];
let n = 0;

await Promise.all(arr.map(a => lim(async () => {
  try {
    const b = Buffer.from(await (await fetch(a.imageUrl, { signal: AbortSignal.timeout(30000) })).arrayBuffer());
    const r = await grainRatio(b);
    out.push({ id: a.id, title: a.title, artist: a.artist, category: a.category,
               medium: a.medium, form: +r.form.toFixed(2), grain: +r.grain.toFixed(2) });
  } catch { out.push({ id: a.id, title: a.title, form: null }); }
  if (++n % 400 === 0) console.log(`[detail] ${n}/${arr.length}`);
})));

fs.writeFileSync(OUT, JSON.stringify(out));
const ok = out.filter(x => x.form != null).map(x => x.form).sort((a, b) => a - b);
const q = r => ok[Math.floor(ok.length * r)];
console.log(`\n측정 ${ok.length}건 · 디테일 최소 ${ok[0]} / 5% ${q(.05)} / 10% ${q(.1)} / 25% ${q(.25)} / 중앙 ${q(.5)} / 최대 ${ok[ok.length-1]}`);
for (const t of [4, 5, 6, 7, 7.5, 8, 9]) console.log(`  ${t} 미만: ${ok.filter(x => x < t).length}건`);
