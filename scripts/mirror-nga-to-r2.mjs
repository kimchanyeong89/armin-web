// NGA 컬렉션을 canonical 스키마로 정규화하고 이미지를 R2로 미러링한다.
//
// 배경: nga-collection.json 만 유일하게 이미지를 api.nga.gov IIIF에서 직접 참조한다(다른 289관은 R2).
// 그 호스트가 죽으면 16,912점이 통째로 깨지므로 미러링한다.
// 겸사겸사 비표준 스키마(items/attribution/date 없음)를 canonical 로 맞추고,
// 스코프 규칙(이미지 필수·흑백 복제판화 제외)을 적용한다.
//
//   node scripts/mirror-nga-to-r2.mjs --limit 40      # 파일럿
//   node scripts/mirror-nga-to-r2.mjs                 # 전체
//   node scripts/mirror-nga-to-r2.mjs --resume        # 체크포인트에서 재개

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import pLimit from 'p-limit';
import dotenv from 'dotenv';
import { judgeImage, toWebp, IN_SCOPE } from './lib/scope-filter.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true });

const SRC_JSON = path.join(ROOT, 'public/data/nga-collection.json');
const SRC_CSV = path.join(ROOT, 'public/data/nga-collection.csv');
const OUT_JSON = path.join(ROOT, 'public/data/nga-collection.json');
const STATE_DIR = path.join(ROOT, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, 'nga-mirror-progress.json');
const REJECTED = path.join(STATE_DIR, 'nga-mirror-rejected.ndjson');

const BUCKET = 'armin-gallery-images';
const PUBLIC_BASE = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const PREFIX = 'artworks/nga-collection';
const CONCURRENCY = 8;

const args = process.argv.slice(2);
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const RESUME = args.includes('--resume');

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// ── CSV (RFC4180, 필드 안에 개행·따옴표 있음) ──────────────────────────────
function* csvRows(text) {
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); field = ''; yield row; row = []; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); yield row; }
}

/** CSV에서 JSON에 없는 필드(displayDate/classification/artworkPage)를 id 기준으로 뽑는다. */
function loadCsvIndex() {
  const text = fs.readFileSync(SRC_CSV, 'utf8');
  const it = csvRows(text);
  const header = it.next().value;
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  const idx = new Map();
  for (const r of it) {
    const id = r[col.id];
    if (!id) continue;
    idx.set(id, {
      displayDate: r[col.displayDate] || '',
      classification: r[col.classification] || '',
      subClassification: r[col.subClassification] || '',
      artworkPage: r[col.artworkPage] || '',
      onView: r[col.onView] === 'true' || r[col.onView] === '1',
    });
  }
  return idx;
}

// ── canonical 매핑 ─────────────────────────────────────────────────────────
const CLASSIFICATION_MAP = {
  painting: 'painting',
  drawing: 'drawing',
  print: 'print',
  photograph: 'photograph',
  'time-based media art': 'video',
  volume: 'manuscript',
};

/** NGA classification 우선, 없으면 medium 으로 추론. 스코프 밖이면 null. */
function toCategory(classification, medium) {
  const c = (classification || '').trim().toLowerCase();
  if (CLASSIFICATION_MAP[c]) return CLASSIFICATION_MAP[c];
  if (c === 'sculpture' || c === 'decorative art' || c === 'technical material') return null;

  const m = (medium || '').toLowerCase();
  if (/\b(oil|tempera|acrylic|gouache|fresco|encaustic)\b/.test(m)) return 'painting';
  if (/\b(lithograph|etching|engraving|drypoint|woodcut|aquatint|mezzotint|screenprint|serigraph|linocut)\b/.test(m)) return 'print';
  if (/\b(graphite|chalk|charcoal|pastel|crayon|pen|ink|watercolor|wash)\b/.test(m)) return 'drawing';
  if (/\b(gelatin silver|albumen|platinum print|photograph|daguerreotype)\b/.test(m)) return 'photograph';
  return null;
}

/** "c. 1310", "1876/1878", "probably 1640s" → 가장 이른 연도 */
function toYear(displayDate) {
  const m = String(displayDate || '').match(/\d{3,4}/);
  return m ? Number(m[0]) : null;
}

function artistOf(item) {
  const names = (item.artists || [])
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
    .map(a => a.constituent?.forwardDisplayName || a.constituent?.preferredDisplayName)
    .filter(Boolean);
  return names.length ? names.join('; ') : (item.attribution || 'Unknown');
}

// ── 다운로드/업로드 ────────────────────────────────────────────────────────
const sha8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);

async function fetchImage(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(60000) });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      if (res.status === 404) return null;
    } catch { /* 재시도 */ }
    await new Promise(r => setTimeout(r, 1000 * (i + 1)));
  }
  return null;
}

async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const src = JSON.parse(fs.readFileSync(SRC_JSON, 'utf8'));
  const items = src.items || src.artworks || [];
  console.log(`[nga] 원본 ${items.length}건`);

  console.log('[nga] CSV 인덱스 로드 중…');
  const csv = loadCsvIndex();
  console.log(`[nga] CSV ${csv.size}건 매칭 준비`);

  const done = RESUME && fs.existsSync(PROGRESS)
    ? new Map(Object.entries(JSON.parse(fs.readFileSync(PROGRESS, 'utf8'))))
    : new Map();
  const rejectLog = fs.createWriteStream(REJECTED, { flags: RESUME ? 'a' : 'w' });

  // 1) 이미지 없는 레코드는 여기서 탈락 — 이미지 필수 규칙
  const candidates = [];
  const counts = { noImage: 0, outOfScope: 0 };
  for (const it of items) {
    const meta = csv.get(it.id) || {};
    const src_url = it.primaryImage?.iiifFull || it.images?.[0]?.iiifurl;
    if (!src_url) { counts.noImage++; continue; }
    const category = toCategory(meta.classification, it.medium);
    if (!category || !IN_SCOPE.has(category)) { counts.outOfScope++; continue; }
    candidates.push({ it, meta, category, src_url });
  }
  console.log(`[nga] 이미지없음 제외 ${counts.noImage} · 스코프밖 제외 ${counts.outOfScope} → 후보 ${candidates.length}건`);

  const todo = candidates.filter(c => !done.has(c.it.id)).slice(0, LIMIT);
  console.log(`[nga] 이번 실행 대상 ${todo.length}건 (완료 ${done.size}건)\n`);

  const limit = pLimit(CONCURRENCY);
  let ok = 0, skipped = 0, failed = 0, n = 0;

  await Promise.all(todo.map(c => limit(async () => {
    const { it, meta, category, src_url } = c;
    // IIIF에 크기를 지정해 원본 풀사이즈(수십MB) 대신 필요한 만큼만 받는다.
    const sized = src_url.replace(/\/full\/full\//, '/full/!1600,1600/');
    const buf = await fetchImage(sized) || await fetchImage(src_url);
    n++;
    if (!buf) {
      failed++;
      rejectLog.write(JSON.stringify({ id: it.id, reason: 'download-failed', url: sized }) + '\n');
    } else {
      try {
        const verdict = await judgeImage(buf, category);
        if (!verdict.ok) {
          skipped++;
          done.set(it.id, { skip: verdict.reason });
          rejectLog.write(JSON.stringify({ id: it.id, reason: verdict.reason, category }) + '\n');
        } else {
          const webp = await toWebp(buf);
          const key = `${PREFIX}/${it.id}-${sha8(src_url)}-imageUrl.webp`;
          await s3.send(new PutObjectCommand({
            Bucket: BUCKET, Key: key, Body: webp, ContentType: 'image/webp',
            CacheControl: 'public, max-age=31536000',
          }));
          done.set(it.id, { key, category });
          ok++;
        }
      } catch (e) {
        failed++;
        rejectLog.write(JSON.stringify({ id: it.id, reason: 'process-error: ' + e.message }) + '\n');
      }
    }
    if (n % 100 === 0) {
      console.log(`[nga] ${n}/${todo.length} — 업로드 ${ok} · 스킵 ${skipped} · 실패 ${failed}`);
      fs.writeFileSync(PROGRESS, JSON.stringify(Object.fromEntries(done)));
    }
  })));

  fs.writeFileSync(PROGRESS, JSON.stringify(Object.fromEntries(done)));
  rejectLog.end();
  console.log(`\n[nga] 완료 — 업로드 ${ok} · 스킵 ${skipped} · 실패 ${failed}`);

  // 2) canonical JSON 재작성 — R2에 올라간 것만 남긴다
  const artworks = [];
  for (const { it, meta, category, src_url } of candidates) {
    const rec = done.get(it.id);
    if (!rec || !rec.key) continue;
    artworks.push({
      id: it.id,
      objectNumber: it.accessionNum || '',
      title: it.title || 'Untitled',
      artist: artistOf(it),
      date: meta.displayDate || '',
      year: toYear(meta.displayDate),
      medium: it.medium || '',
      dimensions: it.dimensions || '',
      category,
      description: (it.primaryImage?.assistiveText || '').slice(0, 1200),
      imageUrl: `${PUBLIC_BASE}/${rec.key}`,
      thumbnailUrl: it.primaryImage?.iiifThumbUrl || '',
      onDisplay: !!meta.onView,
      displayLocation: '',
      sourceUrl: meta.artworkPage || `https://www.nga.gov/collection/art-object-page.${(it.accessionNum || '').replace(/\./g, '-')}.html`,
      metadata: {},
      original_imageUrl: src_url,
    });
  }

  if (LIMIT === Infinity) {
    fs.writeFileSync(OUT_JSON, JSON.stringify({
      museum: 'National Gallery of Art',
      collection: 'Paintings, Drawings and Prints (Open Access)',
      website: 'https://www.nga.gov/collection',
      scraped_date: new Date().toISOString().slice(0, 10),
      total_count: artworks.length,
      source_type: 'opendata',
      artworks,
    }, null, 2));
    console.log(`[nga] JSON 재작성 — ${artworks.length}건`);
  } else {
    console.log(`[nga] 파일럿이므로 JSON 미변경 (canonical 후보 ${artworks.length}건)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
