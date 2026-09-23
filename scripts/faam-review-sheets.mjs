// 후쿠오카 캔버스 회화 437점을 전수 눈으로 보기 위한 격자 묶음.
//
// 자동 판별은 네 번 실패했다 — 어떤 지표든 멀쩡한 작품(단색 미니멀 회화,
// 흰 종이 위 소묘, 매끈한 인물 사진)을 함께 걸렀다. 그래서 눈으로 본다.
//
// 디테일 낮은 순으로 정렬해 비슷한 화질끼리 모아 놓는다. 그래야 한 장 안에서
// 판단이 일관되고, 경계가 어디쯤인지도 보인다.
//
//   node scripts/faam-review-sheets.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pLimit from 'p-limit';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTDIR = process.env.SHEET_DIR || path.join(ROOT, 'scripts/.state/review');
const TILE = 300, COLS = 4, ROWS = 4, PER = COLS * ROWS;

fs.mkdirSync(OUTDIR, { recursive: true });

const detail = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/.state/faam-detail.json'), 'utf8'));
const art = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/faam-fukuoka-collection.json'), 'utf8'))
  .artworks.map(a => [a.id, a]));

const canvas = detail
  .map(d => {
    const a = art.get(d.id);
    return a && d.form != null && a.category === 'painting' && /画布|カンヴァス|canvas/i.test(a.medium || '')
      ? { ...d, art: a } : null;
  })
  .filter(Boolean)
  .sort((x, y) => x.form - y.form);

console.log(`캔버스 회화 ${canvas.length}점 → 격자 ${Math.ceil(canvas.length / PER)}장`);

const lim = pLimit(10);
const index = [];

for (let s = 0; s * PER < canvas.length; s++) {
  const group = canvas.slice(s * PER, (s + 1) * PER);
  const tiles = await Promise.all(group.map((p, i) => lim(async () => {
    try {
      const b = Buffer.from(await (await fetch(p.art.imageUrl, { signal: AbortSignal.timeout(30000) })).arrayBuffer());
      const m = await sharp(b).metadata();
      // 1:1 가운데 크롭 — 축소하면 물러진 게 안 보인다
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
    .png().toFile(path.join(OUTDIR, `sheet-${String(s + 1).padStart(2, '0')}.png`));

  index.push({ sheet: s + 1, items: group.map((p, i) => ({ pos: i + 1, id: p.id, form: p.form, title: p.title, artist: p.art.artist })) });
  process.stdout.write(`\r격자 ${s + 1}/${Math.ceil(canvas.length / PER)}`);
}

fs.writeFileSync(path.join(OUTDIR, 'index.json'), JSON.stringify(index, null, 1));
console.log(`\n${path.relative(ROOT, OUTDIR)}/ 에 저장`);
