// Barnes Foundation (Philadelphia) 수집기.
//
// 소스: collection.barnesfoundation.org 의 공개 Elasticsearch 프록시. API 키 불필요.
//   POST /api/search  { body: { size, from } }   ← size/from 은 반드시 body 안에 있어야 한다
//                                                   (쿼리스트링으로 주면 무시되고 10건만 온다)
// 이미지: https://d2r83x5xt28klo.cloudfront.net/{id}_{secret}_{size}.jpg
//   _o(imageOriginalSecret) 원본 2000px+ → _b(imageSecret) 1024px 순으로 시도
//
//   node scripts/scrape-barnes.mjs --limit 30   # 파일럿
//   node scripts/scrape-barnes.mjs              # 전체

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import pLimit from 'p-limit';
import dotenv from 'dotenv';
import { judgeImage, toWebp, IN_SCOPE, isPreModernPhoto } from './lib/scope-filter.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true });

export const MUSEUM = {
  id: 'barnes-foundation',
  name: 'The Barnes Foundation',
  name_ko: '반스 재단',
  site: 'https://collection.barnesfoundation.org/',
  lat: 39.9656, lng: -75.1730, city: 'Philadelphia',
};

const API = 'https://collection.barnesfoundation.org/api/search';
const CDN = 'https://d2r83x5xt28klo.cloudfront.net';
const H = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'Content-Type': 'application/json' };
const BUCKET = 'armin-gallery-images';
const PUBLIC_BASE = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const PREFIX = 'artworks/barnes-foundation-collection';
const CONCURRENCY = 6;

/** Barnes classification → canonical. 금속·가구·보석 등 장식미술은 스코프 밖. */
function toCategory(cls) {
  switch ((cls || '').trim()) {
    case 'Paintings': return 'painting';
    case 'Drawings': case 'Works on Paper': return 'drawing';
    case 'Prints': return 'print';
    case 'Photographs': return 'photograph';
    case 'Manuscripts': return 'manuscript';
    default: return null;   // Metalworks, Vessels, Sculptures, Jewelry, Furniture, Textiles …
  }
}

/** beginDate 가 가장 신뢰할 만하고, 없으면 displayDate("19th century", "1890")에서 뽑는다. */
function toYear(rec) {
  const b = Number(rec.beginDate);
  if (Number.isFinite(b) && b > 0) return b;
  const d = String(rec.displayDate || '');
  const y = d.match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  if (y) return Number(y[1]);
  const c = d.match(/(\d{1,2})(?:st|nd|rd|th)\s+century/i);
  return c ? (Number(c[1]) - 1) * 100 : null;
}

const sha8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);

async function grab(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(60000) });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      if (r.status === 403 || r.status === 404) return null;   // 해당 사이즈 없음
    } catch { /* 재시도 */ }
    await new Promise(res => setTimeout(res, 1000 * (i + 1)));
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
  const RESUME = args.includes('--resume');

  const STATE = path.join(ROOT, 'scripts/.state');
  fs.mkdirSync(STATE, { recursive: true });
  const PROGRESS = path.join(STATE, `${MUSEUM.id}-progress.json`);
  const REJECT = path.join(STATE, `${MUSEUM.id}-rejected.ndjson`);
  const OUT = path.join(ROOT, `public/data/${MUSEUM.id}-collection.json`);

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });

  // ── 전체 레코드 ────────────────────────────────────────────────────────
  const records = [];
  for (let from = 0; ; from += 100) {
    const r = await fetch(API, { method: 'POST', headers: H, body: JSON.stringify({ body: { size: 100, from } }) });
    if (!r.ok) break;
    const hits = (await r.json()).hits?.hits || [];
    records.push(...hits.map(h => h._source));
    if (hits.length < 100) break;
  }
  console.log(`[barnes] 전체 ${records.length}건`);

  const done = RESUME && fs.existsSync(PROGRESS)
    ? new Map(Object.entries(JSON.parse(fs.readFileSync(PROGRESS, 'utf8')))) : new Map();
  if (args.includes('--retry-failed')) {
    let r = 0;
    for (const [k, v] of done) if (v.skip && /fetch-failed|error:/.test(v.skip)) { done.delete(k); r++; }
    console.log(`[barnes] 일시적 실패 ${r}건 복구`);
  }
  const rejects = fs.createWriteStream(REJECT, { flags: RESUME ? 'a' : 'w' });

  // 스코프·이미지 사전 판정 — 장식미술 2,000여 점을 내려받기 전에 걸러낸다
  const pre = { outOfScope: 0, noImage: 0 };
  const candidates = [];
  for (const rec of records) {
    const category = toCategory(rec.classification);
    if (!category || !IN_SCOPE.has(category)) { pre.outOfScope++; continue; }
    if (!rec.imageSecret && !rec.imageOriginalSecret) { pre.noImage++; continue; }
    candidates.push({ rec, category });
  }
  console.log(`[barnes] 스코프밖 ${pre.outOfScope} · 이미지없음 ${pre.noImage} → 후보 ${candidates.length}건`);

  const todo = candidates.filter(c => !done.has(String(c.rec.id))).slice(0, LIMIT);
  console.log(`[barnes] 이번 실행 ${todo.length}건 (완료 ${done.size}건)\n`);

  const stat = { kept: 0, grayscale: 0, small: 0, failed: 0 };
  const lim = pLimit(CONCURRENCY);
  let n = 0;
  const tick = () => {
    if (++n % 200 === 0) {
      console.log(`[barnes] ${n}/${todo.length} — 수집 ${stat.kept} · 흑백판화 ${stat.grayscale} · 저해상 ${stat.small} · 실패 ${stat.failed}`);
      fs.writeFileSync(PROGRESS, JSON.stringify(Object.fromEntries(done)));
    }
  };

  await Promise.all(todo.map(({ rec, category }) => lim(async () => {
    const id = String(rec.id);
    const rej = (reason, extra) => { rejects.write(JSON.stringify({ id, reason, ...extra }) + '\n'); done.set(id, { skip: reason }); };
    try {
      const year = toYear(rec);
      if (isPreModernPhoto(category, year)) { rej('photo-pre-1920'); tick(); return; }

      // 원본(_o) 우선, 없으면 1024px(_b)
      let src = null, buf = null;
      if (rec.imageOriginalSecret) {
        src = `${CDN}/${id}_${rec.imageOriginalSecret}_o.jpg`;
        buf = await grab(src);
      }
      if (!buf && rec.imageSecret) {
        src = `${CDN}/${id}_${rec.imageSecret}_b.jpg`;
        buf = await grab(src);
      }
      if (!buf) { stat.failed++; rej('image-fetch-failed'); tick(); return; }

      const verdict = await judgeImage(buf, category);
      if (!verdict.ok) {
        if (verdict.reason.startsWith('grayscale')) stat.grayscale++; else stat.small++;
        rej(verdict.reason, { category }); tick(); return;
      }

      const key = `${PREFIX}/${id}-${sha8(src)}-imageUrl.webp`;
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET, Key: key, Body: await toWebp(buf), ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000',
      }));
      done.set(id, {
        key, category, src, year,
        title: rec.title || 'Untitled',
        artist: rec.people || rec.sortedName || 'Unknown',
        date: rec.displayDate || '',
        medium: rec.medium || '',
        dimensions: rec.dimensions || '',
        objNo: rec.invno || '',
        desc: (rec.shortDescription || rec.visualDescription || '').slice(0, 1200),
        onView: !!rec.onView,
        room: rec.room || '',
      });
      stat.kept++;
    } catch (e) { stat.failed++; rej('error: ' + e.message); }
    tick();
  })));

  fs.writeFileSync(PROGRESS, JSON.stringify(Object.fromEntries(done)));
  rejects.end();
  console.log(`\n[barnes] 완료 — 수집 ${stat.kept} · 흑백판화 ${stat.grayscale} · 저해상 ${stat.small} · 실패 ${stat.failed}`);

  const artworks = [];
  for (const [id, r] of done) {
    if (!r.key) continue;
    artworks.push({
      id: `${MUSEUM.id}-${id}`,
      objectNumber: r.objNo || '',
      title: r.title, artist: r.artist,
      date: r.date || '', year: r.year,
      medium: r.medium || '', dimensions: r.dimensions || '',
      category: r.category, description: r.desc || '',
      imageUrl: `${PUBLIC_BASE}/${r.key}`, thumbnailUrl: '',
      onDisplay: r.onView, displayLocation: r.room || '',
      sourceUrl: `https://collection.barnesfoundation.org/objects/${id}/`,
      metadata: {}, original_imageUrl: r.src,
    });
  }

  if (LIMIT === Infinity) {
    fs.writeFileSync(OUT, JSON.stringify({
      museum: MUSEUM.name, museum_ko: MUSEUM.name_ko, collection: 'Collection',
      website: MUSEUM.site, scraped_date: new Date().toISOString().slice(0, 10),
      total_count: artworks.length, source_type: 'api', artworks,
    }, null, 2));
    console.log(`[barnes] JSON 작성 — ${artworks.length}건`);
  } else {
    console.log(`[barnes] 파일럿이므로 JSON 미작성 (canonical 후보 ${artworks.length}건)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
