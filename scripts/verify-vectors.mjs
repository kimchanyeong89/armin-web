// 신규 미술관 작품이 추천 인덱스(Vectorize)에 실제로 들어갔는지 전수 확인한다.
//
// 임베딩 스크립트의 "처리됨" 목록(siglip_processed_ids.txt)은 벡터를 디스크에 쓴
// 직후 찍히고, Cloudflare 업로드는 50개씩 모아서 나중에 한다. 그래서 업로드 버퍼가
// 비기 전에 프로세스가 죽으면 "처리됨"인데 인덱스엔 없는 벡터가 생긴다.
// 대기열 0건은 처리 목록만 보므로 이걸 못 잡는다. 인덱스에 직접 물어본다.
//
//   node scripts/verify-vectors.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pLimit from 'p-limit';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = 'https://armin-semantic-search.armin-art.workers.dev/check-ids';
const SLUGS = ['faam-fukuoka', 'momas-saitama', 'kyoto-national-museum', 'mimoca', 'chiba-city-art',
  'pola-museum', 'barnes-foundation', 'wellcome-collection', 'artsmia', 'tokyo-fuji-art'];
const OUT = path.join(ROOT, 'scripts/.state/vectors-missing.json');

const lim = pLimit(4);

async function check(ids, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(CHECK, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }), signal: AbortSignal.timeout(30000),
      });
      const j = await r.json();
      if (r.ok && Array.isArray(j.foundIds)) return new Set(j.foundIds);
    } catch { /* 재시도 */ }
    await new Promise(res => setTimeout(res, 1000 * (i + 1)));
  }
  return null; // 확인 불가 — 없음과 구분한다
}

const missing = {};
let unknown = 0;
for (const s of SLUGS) {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, `public/data/${s}-collection.json`), 'utf8'));
  const ids = (j.artworks || j.items || j).map(a => String(a.id));
  const chunks = [];
  for (let i = 0; i < ids.length; i += 20) chunks.push(ids.slice(i, i + 20));
  const miss = [];
  await Promise.all(chunks.map(c => lim(async () => {
    const found = await check(c);
    if (!found) { unknown += c.length; return; }
    for (const id of c) if (!found.has(id)) miss.push(id);
  })));
  missing[s] = miss;
  console.log(`${s.padEnd(24)} ${String(ids.length - miss.length).padStart(5)}/${String(ids.length).padEnd(5)} 인덱스에 있음 · 없음 ${miss.length}`);
}
fs.writeFileSync(OUT, JSON.stringify(missing, null, 1));
const tot = Object.values(missing).reduce((n, m) => n + m.length, 0);
console.log(`\n없음 합계 ${tot} · 확인 불가 ${unknown} → ${path.relative(ROOT, OUT)}`);
