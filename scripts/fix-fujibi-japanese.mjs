// 도쿄후지미술관 컬렉션에 남은 일본어 5건을 영문으로 옮긴다.
//
// 스크래퍼는 제목만 `titleEn || titleJa` 로 영문을 우선하고, 연대·재료·작가·치수는
// 영문 페이지에 값이 없으면 일본어 페이지 값을 그대로 썼다. 977점 중 5점이 그랬다.
// 5건이라 규칙을 만들지 않고 작품별로 적는다. 원문은 metadata 에 이미 보존돼 있다.
//
//   node scripts/fix-fujibi-japanese.mjs           # dry-run
//   node scripts/fix-fujibi-japanese.mjs --apply

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'public/data/tokyo-fuji-art-collection.json');

const FIX = {
  'tokyo-fuji-art-10196': {
    artist: 'Attributed to François-Joseph Kinson',
    date: 'First half of the 19th century',
    medium: 'Oil on canvas',
  },
  'tokyo-fuji-art-06598': {
    date: '1848 (Kōka 5)',
    medium: 'Color on silk, hanging scroll',
  },
  'tokyo-fuji-art-00036': {
    date: '1892 (Meiji 25)',
    medium: 'Oil on canvas',
  },
  'tokyo-fuji-art-00037': {
    date: '1928 (Shōwa 3)',
    medium: 'Oil on canvas',
  },
  'tokyo-fuji-art-01064': {
    date: 'Early Edo period (17th century)',
    medium: 'Color on paper with gold ground, pair of six-panel folding screens',
    dimensions: '154.0×362.8cm (each)',
  },
};

const JA = /[぀-ヿ一-鿿]/;
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const list = data.artworks;
let n = 0;
for (const a of list) {
  const f = FIX[a.id];
  if (!f) continue;
  for (const [k, v] of Object.entries(f)) {
    console.log(`${a.id} ${k.padEnd(10)} ${JSON.stringify(a[k])} → ${JSON.stringify(v)}`);
    a[k] = v;
  }
  n++;
}
const left = list.filter(a => ['title', 'artist', 'date', 'medium', 'dimensions'].some(k => JA.test(a[k] || '')));
console.log(`\n${n}점 수정 · 표시 필드에 남은 일본어 ${left.length}점`);
if (process.argv.includes('--apply')) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  console.log('적용했다.');
} else console.log('(dry-run — 적용하려면 --apply)');
