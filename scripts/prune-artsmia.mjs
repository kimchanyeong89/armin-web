// 이미 수집한 미니애폴리스 컬렉션에서 범위 밖 작품을 걷어낸다.
//
// 수집 당시 toCategory 가 분류 목록을 **통짜 문자열**로 검사해서,
// classification="Calligraphy" 인 순수 서예가 재료("Ink on paper")를 통해
// 소묘로 새어 들어왔다. 서예는 수집 대상이 아니고(사용자 규칙), 복제·위작·
// 공예도 마찬가지다. 스크래퍼는 고쳤고 이 스크립트가 기존 분을 정리한다.
//
// 되돌릴 수 있게 걷어낸 것은 .pruned.json 으로 남긴다. R2 이미지는 고아로 둔다.
//
//   node scripts/prune-artsmia.mjs           # dry-run
//   node scripts/prune-artsmia.mjs --apply

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'public/data/artsmia-collection.json');
const DUMP = path.join(ROOT, 'scripts/.state/artsmia-dump.json');
const BACKUP = path.join(ROOT, 'scripts/.state/artsmia-collection.pruned.json');

// 첫 분류가 이것이면 버린다
const PRIMARY_OUT = /^(Calligraphy|Reproductions?|Casts and Copies|Woodwork|Basketry|Leatherwork|Ceremonial Objects|Funerary Goods|Judaica|Architecture|Printing Matrices|Dolls)\b/i;
// 어느 자리에 있든 버린다
const ANYWHERE_OUT = /Fakes and Forgeries|Reproductions|Casts and Copies/i;

const dumpRaw = JSON.parse(fs.readFileSync(DUMP, 'utf8'));
const byId = new Map();
for (const o of (Array.isArray(dumpRaw) ? dumpRaw : Object.values(dumpRaw))) byId.set(String(o.id), o);

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const list = data.artworks || data.items || data;

const keep = [], drop = [];
const reasons = {};
for (const a of list) {
  const raw = byId.get(String(a.id).replace(/^artsmia-/, ''));
  const cls = String((raw && (raw.classification || raw.class)) || '');
  const primary = cls.split(',')[0].trim();
  const out = PRIMARY_OUT.test(primary) || ANYWHERE_OUT.test(cls);
  if (out) {
    drop.push({ id: a.id, title: a.title, artist: a.artist, classification: cls, category: a.category });
    reasons[primary || '(분류없음)'] = (reasons[primary || '(분류없음)'] || 0) + 1;
  } else keep.push(a);
}

console.log(`전체 ${list.length}건 → 유지 ${keep.length} · 제외 ${drop.length}\n제외 사유:`);
for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
  console.log('  ', String(v).padStart(4), k);
}
const after = keep.reduce((s, a) => { s[a.category] = (s[a.category] || 0) + 1; return s; }, {});
console.log('\n정리 후 분류:', JSON.stringify(after));

if (process.argv.includes('--apply')) {
  fs.writeFileSync(BACKUP, JSON.stringify(drop, null, 1));
  if (data.artworks) data.artworks = keep; else if (data.items) data.items = keep;
  if (data.total_count != null) data.total_count = keep.length;
  fs.writeFileSync(FILE, JSON.stringify(Array.isArray(data) ? keep : data, null, 2));
  console.log(`\n적용했다. 걷어낸 ${drop.length}건은 ${path.relative(ROOT, BACKUP)} 에 남겼다.`);
} else {
  console.log('\n(dry-run — 적용하려면 --apply)');
}
