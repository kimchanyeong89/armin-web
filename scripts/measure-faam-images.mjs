import fs from 'node:fs';
import sharp from 'sharp';
import pLimit from 'p-limit';

const j = JSON.parse(fs.readFileSync('public/data/faam-fukuoka-collection.json', 'utf8'));
const arr = j.artworks;
const lim = pLimit(16);
const out = [];
let n = 0;

await Promise.all(arr.map(a => lim(async () => {
  let w = 0, h = 0, kb = 0;
  try {
    const r = await fetch(a.imageUrl, { signal: AbortSignal.timeout(30000) });
    const b = Buffer.from(await r.arrayBuffer());
    const m = await sharp(b).metadata();
    w = m.width || 0; h = m.height || 0; kb = Math.round(b.length / 1024);
  } catch { /* 측정 실패는 0 으로 남긴다 */ }
  out.push({ id: a.id, w, h, mp: +(w * h / 1e6).toFixed(2), kb, title: a.title, medium: a.medium });
  if (++n % 400 === 0) console.log(`[measure] ${n}/${arr.length}`);
})));

fs.writeFileSync('scripts/.state/faam-sizes.json', JSON.stringify(out));
const ok = out.filter(x => x.mp > 0).map(x => x.mp).sort((a, b) => a - b);
const q = r => ok[Math.floor(ok.length * r)];
console.log(`\n측정 ${ok.length}건 · 메가픽셀 최소 ${ok[0]} / 10% ${q(.1)} / 25% ${q(.25)} / 중앙 ${q(.5)} / 75% ${q(.75)} / 최대 ${ok[ok.length-1]}`);
for (const t of [0.5, 0.8, 1.0, 1.2, 1.5]) console.log(`  ${t}MP 미만: ${ok.filter(x => x < t).length}건`);
console.log(`  측정 실패: ${out.length - ok.length}건`);
