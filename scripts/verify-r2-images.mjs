// 신규 미술관 이미지가 R2 에 실제로 있는지 전수 확인한다.
//
// imageUrl 의 호스트가 r2.dev 라는 것만으로는 "올라갔다"는 증거가 아니다 —
// 업로드가 실패했는데 URL 만 기록됐을 수도 있다. 전부 HEAD 로 찔러 본다.
//
//   node scripts/verify-r2-images.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pLimit from 'p-limit';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SLUGS = ['faam-fukuoka', 'momas-saitama', 'kyoto-national-museum', 'mimoca', 'chiba-city-art',
  'pola-museum', 'barnes-foundation', 'wellcome-collection', 'artsmia', 'tokyo-fuji-art'];
const OUT = path.join(ROOT, 'scripts/.state/r2-verify.json');

const lim = pLimit(32);
const report = {};
const missing = [];

async function head(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(20000) });
      if (r.ok) return { ok: true, type: r.headers.get('content-type'), size: Number(r.headers.get('content-length') || 0) };
      if (r.status === 404) return { ok: false, status: 404 };
    } catch { /* 재시도 */ }
    await new Promise(res => setTimeout(res, 800 * (i + 1)));
  }
  return { ok: false, status: 'error' };
}

for (const s of SLUGS) {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, `public/data/${s}-collection.json`), 'utf8'));
  const list = j.artworks || j.items || j;
  const res = await Promise.all(list.map(a => lim(async () => ({ a, r: await head(a.imageUrl || a.image) }))));
  const ok = res.filter(x => x.r.ok);
  const small = ok.filter(x => x.r.size && x.r.size < 5000);
  for (const x of res) if (!x.r.ok) missing.push({ museum: s, id: x.a.id, url: x.a.imageUrl, status: x.r.status });
  report[s] = { total: list.length, ok: ok.length, missing: list.length - ok.length, tiny: small.length };
  console.log(`${s.padEnd(24)} ${String(ok.length).padStart(5)}/${String(list.length).padEnd(5)} 존재 · 없음 ${list.length - ok.length} · 5KB 미만 ${small.length}`);
}

fs.writeFileSync(OUT, JSON.stringify({ report, missing }, null, 1));
const tot = Object.values(report).reduce((s, r) => s + r.total, 0);
const okAll = Object.values(report).reduce((s, r) => s + r.ok, 0);
console.log(`\n합계 ${okAll.toLocaleString()} / ${tot.toLocaleString()} 존재 · 없음 ${missing.length}`);
