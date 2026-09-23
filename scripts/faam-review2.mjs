// 후쿠오카 회화·소묘 2,970점 전수 재검수용 격자.
//
// 1차 검수는 대상을 캔버스 회화 437점으로 좁혔는데, 그 medium 필터
// (画布|カンヴァス|canvas)가 한지·하드보드·판에 그린 작품을 통째로 빠뜨렸다.
// 사용자가 지목한 4점 중 3점이 거기 있었다. 이번엔 회화·소묘 전부를 본다.
//
// 타일을 25개로 늘려 격자 수를 119장으로 줄인다. 240px 1:1 크롭이면
// JPEG 8픽셀 블록이 30×30개 들어와 각짐이 그대로 보인다.
//
//   node scripts/faam-review2.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pLimit from 'p-limit';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTDIR = path.join(ROOT, 'scripts/.state/review2');
const TILE = 240, COLS = 5, ROWS = 5, PER = COLS * ROWS;

fs.mkdirSync(OUTDIR, { recursive: true });

const detail = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/.state/faam-detail.json'), 'utf8')).map(x => [x.id, x]));
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/faam-fukuoka-collection.json'), 'utf8'));

// 회화·소묘 전부. 재료 문자열로 거르지 않는다 — 그게 1차 검수의 실수였다.
const pool = data.artworks
  .filter(a => a.category === 'painting' || a.category === 'drawing')
  .map(a => ({ art: a, form: (detail.get(a.id) || {}).form ?? 99 }))
  .sort((x, y) => x.form - y.form);

const sheets = Math.ceil(pool.length / PER);
console.log(`회화·소묘 ${pool.length}점 → 격자 ${sheets}장 (25칸/장)`);

const lim = pLimit(12);
const index = [];

for (let s = 0; s < sheets; s++) {
  const group = pool.slice(s * PER, (s + 1) * PER);
  const tiles = await Promise.all(group.map((p, i) => lim(async () => {
    try {
      const b = Buffer.from(await (await fetch(p.art.imageUrl, { signal: AbortSignal.timeout(30000) })).arrayBuffer());
      const m = await sharp(b).metadata();
      return { i, buf: await sharp(b).extract({
        left: Math.max(0, (m.width - TILE) >> 1), top: Math.max(0, (m.height - TILE) >> 1),
        width: Math.min(TILE, m.width), height: Math.min(TILE, m.height),
      }).resize(TILE, TILE, { fit: 'cover' }).toBuffer() };
    } catch { return null; }
  })));

  await sharp({ create: { width: COLS * TILE, height: ROWS * TILE, channels: 3, background: '#111' } })
    .composite(tiles.filter(Boolean).map(t => ({
      input: t.buf, left: (t.i % COLS) * TILE, top: Math.floor(t.i / COLS) * TILE,
    })))
    .png().toFile(path.join(OUTDIR, `s${String(s + 1).padStart(3, '0')}.png`));

  index.push({ sheet: s + 1, items: group.map((p, i) => ({ pos: i + 1, id: p.art.id, form: p.form, title: p.art.title })) });
  if ((s + 1) % 20 === 0) process.stdout.write(`\r격자 ${s + 1}/${sheets}`);
}

fs.writeFileSync(path.join(OUTDIR, 'index.json'), JSON.stringify(index));
console.log(`\n완료 — ${path.relative(ROOT, OUTDIR)}/`);
