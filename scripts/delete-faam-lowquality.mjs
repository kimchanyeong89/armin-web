// 눈으로 골라낸 후쿠오카 저화질 작품을 컬렉션에서 뺀다.
//
// 자동 판별은 네 번 실패했다 — 디테일 총량·잡음·색잡티·픽셀당바이트 모두
// 멀쩡한 작품(단색 미니멀 회화, 흰 종이 위 소묘, 매끈한 인물 사진)을 함께 걸렀다.
// 그래서 캔버스 회화 437점을 격자 28장으로 전수 확인해 118점을 손으로 골랐다.
// 원인은 미술관이 1980년대에 필름으로 촬영한 원본 자체이고, 재인코딩으로는
// 못 살린다.
//
// 되돌릴 수 있게 뺀 것은 .lowquality-removed.json 으로 남긴다.
// R2 이미지는 고아로 둔다(remove-miniatures 와 같은 방침).
//
//   node scripts/delete-faam-lowquality.mjs           # dry-run
//   node scripts/delete-faam-lowquality.mjs --apply

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'public/data/faam-fukuoka-collection.json');
const FLAGGED = path.join(ROOT, 'scripts/.state/review/flagged.json');
const BACKUP = path.join(ROOT, 'scripts/.state/faam-fukuoka.lowquality-removed.json');

const ids = new Set(JSON.parse(fs.readFileSync(FLAGGED, 'utf8')).map(x => x.id));
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const keep = [], drop = [];
for (const a of data.artworks) (ids.has(a.id) ? drop : keep).push(a);

const byArtist = {};
for (const a of drop) byArtist[a.artist || '?'] = (byArtist[a.artist || '?'] || 0) + 1;

console.log(`전체 ${data.artworks.length}점 → 유지 ${keep.length} · 제외 ${drop.length}`);
console.log('제외가 몰린 작가 상위 8:');
Object.entries(byArtist).sort((a, b) => b[1] - a[1]).slice(0, 8)
  .forEach(([k, v]) => console.log('  ', String(v).padStart(3), k.slice(0, 40)));

if (process.argv.includes('--apply')) {
  fs.writeFileSync(BACKUP, JSON.stringify(drop, null, 1));
  data.artworks = keep;
  if (data.total_count != null) data.total_count = keep.length;
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  console.log(`\n적용했다. 뺀 ${drop.length}점은 ${path.relative(ROOT, BACKUP)} 에 남겼다.`);
} else {
  console.log('\n(dry-run — 적용하려면 --apply)');
}
