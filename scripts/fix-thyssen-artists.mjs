// 티센 컬렉션(museothyssen-collection-41.full.json) 675점의 작가를 되찾는다.
//
// 스크래퍼가 출처(source)를 작가 자리에 넣어서 675점 전부 작가가
// "Museo Nacional Thyssen-Bornemisza" 다. 검색 결과에 작가 대신 미술관 이름이
// 떴다("Abandoned Skiff — 티센보르네미차 미술관"). 진짜 작가는 작품 페이지
// JSON-LD 의 creator 에 있다: {"@type":"Person","name":"Church, Frederic Edwin"}.
// "성, 이름" 형식은 표시 계층(prettifyArtistName)이 "이름 성" 으로 바꾼다.
//
//   node scripts/fix-thyssen-artists.mjs           # 수집(재개 가능) + dry-run
//   node scripts/fix-thyssen-artists.mjs --apply   # JSON 반영

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'public/data/museothyssen-collection-41.full.json');
const STATE = path.join(ROOT, 'scripts/.state/thyssen-artists.json');
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36' };
const MUSEUM = 'Museo Nacional Thyssen-Bornemisza';
const GAP_MS = 400;

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const done = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};

/** JSON-LD 블록들에서 creator 이름을 뽑는다. 배열·단일 객체 둘 다 온다. */
function creators(html) {
  const names = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let obj;
    try { obj = JSON.parse(m[1]); } catch { continue; }
    const stack = [obj];
    while (stack.length) {
      const o = stack.pop();
      if (!o || typeof o !== 'object') continue;
      if (Array.isArray(o)) { stack.push(...o); continue; }
      if (o.creator) {
        for (const c of [].concat(o.creator)) {
          const n = typeof c === 'string' ? c : c && c.name;
          if (n && n !== MUSEUM && !names.includes(n)) names.push(n);
        }
      }
      for (const v of Object.values(o)) if (v && typeof v === 'object') stack.push(v);
    }
  }
  return names;
}

const todo = data.filter(x => x.artist === MUSEUM && !(x.id in done));
console.log(`[thyssen] 작가가 미술관 이름인 작품 ${data.filter(x => x.artist === MUSEUM).length}점 · 이번에 받을 것 ${todo.length}점`);

let n = 0;
for (const x of todo) {
  const url = x.detailUrl || x.sourcePageUrl;
  let names = [];
  for (let t = 0; t < 3 && !names.length; t++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (r.ok) names = creators(await r.text());
      else if (r.status === 404) break;
    } catch { /* 재시도 */ }
    if (!names.length) await new Promise(res => setTimeout(res, 1500 * (t + 1)));
  }
  done[x.id] = names.length ? names.join(' & ') : null;
  if (++n % 50 === 0) {
    fs.writeFileSync(STATE, JSON.stringify(done));
    console.log(`[thyssen] ${n}/${todo.length}`);
  }
  await new Promise(res => setTimeout(res, GAP_MS));
}
fs.writeFileSync(STATE, JSON.stringify(done));

const found = data.filter(x => x.artist === MUSEUM && done[x.id]).length;
const missing = data.filter(x => x.artist === MUSEUM && x.id in done && !done[x.id]);
console.log(`\n[thyssen] 작가 찾음 ${found} · 못 찾음 ${missing.length}`);
for (const x of missing.slice(0, 10)) console.log('   못 찾음:', x.id, x.title);

if (process.argv.includes('--apply')) {
  let applied = 0;
  for (const x of data) {
    if (x.artist === MUSEUM && done[x.id]) { x.artist = done[x.id]; applied++; }
  }
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  console.log(`[thyssen] ${applied}점 반영`);
} else console.log('(dry-run — 반영하려면 --apply)');
