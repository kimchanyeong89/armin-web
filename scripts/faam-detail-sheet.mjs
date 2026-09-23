// 디테일이 낮은 후쿠오카 작품을 격자 이미지로 뽑아 눈으로 확인한다.
//
// 숫자만 보고 지우면 위험하다 — 단색 화면이나 여백이 큰 작품도 디테일 값이
// 낮게 나온다. 자르기 전에 실제 그림을 봐야 한다.
//
//   node scripts/faam-detail-sheet.mjs 7.5        # 7.5 미만에서 16점 표본
//   node scripts/faam-detail-sheet.mjs 7.5 band   # 7.5 언저리(경계선) 16점

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTDIR = process.env.SHEET_DIR || path.join(ROOT, 'scripts/.state');

const T = Number(process.argv[2] || 7.5);
const MODE = process.argv[3] || 'below';
const TILE = 300, COLS = 4, ROWS = 4;

const detail = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/.state/faam-detail.json'), 'utf8'));
const art = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/faam-fukuoka-collection.json'), 'utf8'))
  .artworks.map(a => [a.id, a]));

const pool = detail.filter(x => x.form != null && (MODE === 'band'
  ? x.form >= T - 0.8 && x.form <= T + 0.8
  : x.form < T)).sort((a, b) => a.form - b.form);

console.log(`${MODE === 'band' ? T + ' 언저리' : T + ' 미만'} ${pool.length}건 · 표본 ${COLS * ROWS}점`);

// 고르게 뽑는다 — 가장 낮은 것만 보면 경계선 판단이 안 된다
const step = Math.max(1, Math.floor(pool.length / (COLS * ROWS)));
const pick = [];
for (let i = 0; i < COLS * ROWS && i * step < pool.length; i++) pick.push(pool[i * step]);

const tiles = [];
for (const p of pick) {
  const a = art.get(p.id);
  if (!a) continue;
  try {
    const b = Buffer.from(await (await fetch(a.imageUrl)).arrayBuffer());
    const m = await sharp(b).metadata();
    // 1:1 가운데 크롭 — 축소하면 물러진 게 안 보인다
    tiles.push(await sharp(b).extract({
      left: Math.max(0, (m.width - TILE) >> 1), top: Math.max(0, (m.height - TILE) >> 1),
      width: Math.min(TILE, m.width), height: Math.min(TILE, m.height),
    }).resize(TILE, TILE, { fit: 'cover' }).toBuffer());
    console.log(`  디테일 ${String(p.form).padStart(6)}  ${(p.title || '').slice(0, 38)}`);
  } catch { /* 건너뛴다 */ }
}

const out = path.join(OUTDIR, `faam-detail-${MODE}-${T}.png`);
await sharp({ create: { width: COLS * TILE, height: ROWS * TILE, channels: 3, background: '#000' } })
  .composite(tiles.map((t, i) => ({ input: t, left: (i % COLS) * TILE, top: Math.floor(i / COLS) * TILE })))
  .png().toFile(out);
console.log(`\n${path.relative(ROOT, out)}`);
