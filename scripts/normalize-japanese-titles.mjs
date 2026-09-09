// 일본 미술관 컬렉션의 작품 제목을 영문 우선으로 바꾼다.
//
// 수집할 때 <title> 의 일본어를 주 제목으로 삼고 영문은 metadata.title_en 에 넣었는데,
// 한국 사용자에게 일본어 제목은 읽히지 않는다. 소스가 영문 제목을 88~94% 제공하므로
// 그쪽을 title 로 올리고 일본어는 metadata.title_ja 로 보존한다.
// 영문이 없는 나머지는 별도 한국어 번역 맵(artwork-titles.json)이 받는다.
//
//   node scripts/normalize-japanese-titles.mjs           # dry-run
//   node scripts/normalize-japanese-titles.mjs --apply

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = ['faam-fukuoka', 'momas-saitama', 'mimoca'];
const JP = /[぀-ヿ㐀-䶿一-鿿]/;

/** 영문 제목으로 쓸 만한지 — 일본어가 섞였거나 빈 값이면 안 쓴다. */
function usableEnglish(t) {
  const s = String(t || '').trim();
  if (!s || JP.test(s)) return null;
  return s;
}

const APPLY = process.argv.includes('--apply');
let swapped = 0;
const leftover = [];

for (const slug of TARGETS) {
  const file = path.join(ROOT, 'public/data', `${slug}-collection.json`);
  if (!fs.existsSync(file)) { console.log(`  ${slug} — 파일 없음`); continue; }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  let n = 0, still = 0;
  const samples = [];

  for (const a of data.artworks) {
    if (!JP.test(a.title || '')) continue;
    const en = usableEnglish(a.metadata?.title_en);
    if (!en) { still++; leftover.push({ slug, id: a.id, title: a.title }); continue; }
    if (samples.length < 2) samples.push(`${a.title} → ${en}`);
    if (APPLY) {
      a.metadata = { ...(a.metadata || {}), title_ja: a.title };
      delete a.metadata.title_en;
      a.title = en;
    }
    n++; swapped++;
  }

  if (APPLY && n) fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`  ${slug.padEnd(18)} 영문 적용 ${String(n).padStart(5)} · 일본어 잔존 ${String(still).padStart(4)}   ${samples.join(' · ')}`);
}

const OUT = path.join(ROOT, 'scripts/.state/japanese-titles-todo.json');
if (APPLY) {
  const uniq = [...new Set(leftover.map(x => x.title))].sort();
  fs.writeFileSync(OUT, JSON.stringify({ count: leftover.length, unique: uniq.length, titles: uniq }, null, 1));
  console.log(`\n한국어 번역 대상 ${leftover.length}건 (고유 ${uniq.length}종) → ${path.relative(ROOT, OUT)}`);
}
console.log(`\n합계 ${swapped.toLocaleString()}건 영문 적용${APPLY ? ' — 적용됨' : ' (dry-run)'}`);
