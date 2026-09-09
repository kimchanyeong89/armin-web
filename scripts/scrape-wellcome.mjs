// Wellcome Collection (London) 수집기.
//
// 소스: api.wellcomecollection.org — 공개 API, 키 불필요. 이미지 IIIF 최대 2550px, CC BY 4.0.
//
// ⚠️ Wellcome 은 미술관이자 의학사 도서관이라 전체 117만 건에는 편지·전단·연차보고서·
//    의학 도해가 섞여 있다. 그대로 받으면 시각 그리드가 오염되므로 **장르로 한정**한다:
//    Paintings / Oil paintings / Drawings / Posters (실측 기준 각각 5,921 / 1,360 / 2,993 / 6,589).
//    판화 장르(Engraving 14,220 등)는 흑백 복제판화가 대부분이라 넣지 않는다.
//
//   node scripts/scrape-wellcome.mjs --limit 30   # 파일럿
//   node scripts/scrape-wellcome.mjs              # 전체

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
  id: 'wellcome-collection',
  name: 'Wellcome Collection',
  name_ko: '웰컴 컬렉션',
  site: 'https://wellcomecollection.org/collections',
  lat: 51.5256, lng: -0.1336, city: 'London',
};

const API = 'https://api.wellcomecollection.org/catalogue/v2/works';
const GENRES = ['Paintings', 'Oil paintings', 'Drawings', 'Posters'];
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' };
const BUCKET = 'armin-gallery-images';
const PUBLIC_BASE = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const PREFIX = `artworks/${MUSEUM.id}-collection`;
const CONCURRENCY = 5;

/** 장르 라벨 → canonical. */
function toCategory(genres) {
  const s = (genres || []).map(g => g.label).join(' ');
  if (/Paintings|Oil paintings|Tempera|Watercolo/i.test(s)) return 'painting';
  if (/Drawings|Sketch/i.test(s)) return 'drawing';
  if (/Posters|Lithograph|Engraving|Etching|Woodcut|Print/i.test(s)) return 'print';
  if (/Photograph/i.test(s)) return 'photograph';
  return null;
}

function toYear(w) {
  const d = w.production?.[0]?.dates?.[0];
  const s = `${d?.label || ''} ${w.title || ''}`;
  const m = s.match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  return m ? Number(m[1]) : null;
}

/**
 * Wellcome 의 제목은 서지 문장이라 길다.
 * "Queen's College, Oxford: its buildings… Wood engraving by J. Jackson, 1845."
 * 앞의 주제 구절만 잘라 표시용 제목으로 쓰고, 원문은 description 에 남긴다.
 */
function shortTitle(t) {
  const s = String(t || '').trim();
  const cut = s.split(/\s*[.;]\s+/)[0].split(/\s+\/\s+/)[0];
  return (cut.length >= 4 ? cut : s).slice(0, 160);
}

/**
 * contributors 가 정본. 없을 때만 서지 문장의 "… by <작가>" 를 쓰되,
 * "by the Holy Spirit" · "by a Spanish painter" 처럼 사람 이름이 아닌 구절이
 * 걸리므로 관사·소문자로 시작하는 것은 버린다.
 */
function artistOf(w) {
  const c = (w.contributors || []).map(x => x.agent?.label).filter(Boolean);
  if (c.length) return c.join('; ');
  const m = String(w.title || '').match(/\bby\s+([^,.;]{3,60})/i);
  if (!m) return 'Unknown';
  const cand = m[1].trim();
  if (/^(a|an|the)\s/i.test(cand)) return 'Unknown';       // "a Spanish painter"
  if (!/^[A-Z]/.test(cand)) return 'Unknown';               // 소문자 시작 = 이름 아님
  return cand;
}

const sha8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);

async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(45000) });
      if (r.ok) return r;
      if (r.status === 404) return null;
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
  const IDS = path.join(STATE, `${MUSEUM.id}-works.json`);
  const OUT = path.join(ROOT, `public/data/${MUSEUM.id}-collection.json`);

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });

  // ── 장르별 작품 목록 ──────────────────────────────────────────────────
  let works;
  if (RESUME && fs.existsSync(IDS)) {
    works = JSON.parse(fs.readFileSync(IDS, 'utf8'));
    console.log(`[wellcome] 저장된 목록 ${works.length}건 재사용`);
  } else {
    const byId = new Map();
    for (const genre of GENRES) {
      let page = 1;
      for (;;) {
        const q = new URLSearchParams({
          pageSize: '100', page: String(page),
          'genres.label': genre,
          include: 'production,contributors,genres,images',
        });
        const r = await get(`${API}?${q}`);
        if (!r) break;
        const j = await r.json();
        if (page === 1) console.log(`[wellcome] ${genre}: ${j.totalResults.toLocaleString()}건`);
        for (const w of j.results || []) if (w.images?.length) byId.set(w.id, w);
        if (!j.nextPage) break;
        page++;
        if (page > 110) break;   // API 페이지 상한 방어
      }
    }
    works = [...byId.values()];
    fs.writeFileSync(IDS, JSON.stringify(works));
    console.log(`[wellcome] 이미지 보유 작품 ${works.length}건`);
  }

  const done = RESUME && fs.existsSync(PROGRESS)
    ? new Map(Object.entries(JSON.parse(fs.readFileSync(PROGRESS, 'utf8')))) : new Map();
  if (args.includes('--retry-failed')) {
    let r = 0;
    for (const [k, v] of done) if (v.skip && /fetch-failed|error:/.test(v.skip)) { done.delete(k); r++; }
    console.log(`[wellcome] 일시적 실패 ${r}건 복구`);
  }
  const rejects = fs.createWriteStream(REJECT, { flags: RESUME ? 'a' : 'w' });

  const todo = works.filter(w => !done.has(w.id)).slice(0, LIMIT);
  console.log(`[wellcome] 이번 실행 ${todo.length}건 (완료 ${done.size})\n`);

  const stat = { kept: 0, noImage: 0, outOfScope: 0, grayscale: 0, small: 0, failed: 0 };
  const lim = pLimit(CONCURRENCY);
  let n = 0;
  const tick = () => {
    if (++n % 200 === 0) {
      console.log(`[wellcome] ${n}/${todo.length} — 수집 ${stat.kept} · 스코프밖 ${stat.outOfScope} · 흑백 ${stat.grayscale} · 저해상 ${stat.small} · 실패 ${stat.failed}`);
      fs.writeFileSync(PROGRESS, JSON.stringify(Object.fromEntries(done)));
    }
  };

  await Promise.all(todo.map(w => lim(async () => {
    const id = w.id;
    const rej = (reason, extra) => { rejects.write(JSON.stringify({ id, reason, ...extra }) + '\n'); done.set(id, { skip: reason }); };
    try {
      const category = toCategory(w.genres);
      if (!category || !IN_SCOPE.has(category)) { stat.outOfScope++; rej('out-of-scope'); tick(); return; }
      const year = toYear(w);
      if (isPreModernPhoto(category, year)) { stat.outOfScope++; rej('photo-pre-1920'); tick(); return; }

      // 이미지 id → IIIF. 개별 이미지 API 를 거쳐야 실제 iiif 주소가 나온다.
      const imgId = w.images?.[0]?.id;
      if (!imgId) { stat.noImage++; rej('no-image'); tick(); return; }
      const ir = await get(`https://api.wellcomecollection.org/catalogue/v2/images/${imgId}`);
      if (!ir) { stat.failed++; rej('image-meta-failed'); tick(); return; }
      const info = (await ir.json()).locations?.[0]?.url;
      if (!info) { stat.noImage++; rej('no-iiif'); tick(); return; }
      const src = info.replace('/info.json', '') + '/full/1200,/0/default.jpg';

      const pr = await get(src);
      if (!pr) { stat.failed++; rej('image-fetch-failed'); tick(); return; }
      const buf = Buffer.from(await pr.arrayBuffer());

      const verdict = await judgeImage(buf, category);
      if (!verdict.ok) {
        if (verdict.reason.startsWith('grayscale')) stat.grayscale++; else stat.small++;
        rej(verdict.reason, { category }); tick(); return;
      }

      const key = `${PREFIX}/${MUSEUM.id}-${id}-${sha8(src)}-imageUrl.webp`;
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET, Key: key, Body: await toWebp(buf), ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000',
      }));

      done.set(id, {
        key, category, src, year,
        title: shortTitle(w.title),
        fullTitle: w.title || '',
        artist: artistOf(w),
        date: w.production?.[0]?.dates?.[0]?.label || '',
        medium: (w.genres || []).map(g => g.label).join(', '),
      });
      stat.kept++;
    } catch (e) { stat.failed++; rej('error: ' + e.message); }
    tick();
  })));

  fs.writeFileSync(PROGRESS, JSON.stringify(Object.fromEntries(done)));
  rejects.end();
  console.log(`\n[wellcome] 완료 — 수집 ${stat.kept} · 스코프밖 ${stat.outOfScope} · 흑백 ${stat.grayscale} · 저해상 ${stat.small} · 실패 ${stat.failed}`);

  const artworks = [];
  for (const [id, r] of done) {
    if (!r.key) continue;
    artworks.push({
      id: `${MUSEUM.id}-${id}`,
      objectNumber: id,
      title: r.title, artist: r.artist,
      date: r.date || '', year: r.year,
      medium: r.medium || '', dimensions: '',
      category: r.category,
      description: r.fullTitle !== r.title ? r.fullTitle.slice(0, 1200) : '',
      imageUrl: `${PUBLIC_BASE}/${r.key}`, thumbnailUrl: '',
      onDisplay: false, displayLocation: '',
      sourceUrl: `https://wellcomecollection.org/works/${id}`,
      metadata: { license: 'CC BY 4.0' },
      original_imageUrl: r.src,
    });
  }

  if (LIMIT === Infinity) {
    fs.writeFileSync(OUT, JSON.stringify({
      museum: MUSEUM.name, museum_ko: MUSEUM.name_ko, collection: 'Paintings, Drawings and Posters',
      website: MUSEUM.site, scraped_date: new Date().toISOString().slice(0, 10),
      total_count: artworks.length, source_type: 'api', artworks,
    }, null, 2));
    console.log(`[wellcome] JSON 작성 — ${artworks.length}건`);
  } else {
    console.log(`[wellcome] 파일럿이므로 JSON 미작성 (canonical 후보 ${artworks.length}건)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
