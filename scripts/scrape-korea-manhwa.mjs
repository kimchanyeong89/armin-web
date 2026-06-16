#!/usr/bin/env node
// Korea Manhwa Museum / 한국만화박물관 (Bucheon) — original-art collection scraper.
// Operator: KOMACON. The museum's catalogue lives on its OWN digital archive
//   만화규장각 / KMAS  (https://www.kmas.or.kr) — the komacon.kr comicsmuseum library
//   pages point here. Source = KMAS public HTML (no auth, robots Allow: /).
//
// SCOPE (comics/animation): ORIGINAL FLAT ART only. KMAS tags each holding with a
//   category chip <span class="collection_mark">. We collect ONLY 원화 (original art
//   boards / 原画). We EXCLUDE 연속간행물 (printed comic books — reproductions) and any
//   other non-original category. Cels/backgrounds → mixed_media_2d if present; none in
//   the current 원화 set (all are hand-drawn comic boards → category "drawing").
//
// SOURCE STRUCTURE (verified Phase A live):
//   • List  : GET /original/mainCollectionList?dtaSe1Cd=10&pageIndex=N
//             dtaSe1Cd=10 == 원화 (original art); =30 == 연속간행물 (books, out of scope).
//             8 items/page; total surfaced via "총 <span>N</span>건". Each item is a
//             call fnCollectionDetail('10','10',{relicId}).
//   • Detail: GET /original/mainCollectionList/{dtaSe1Cd}/{dtaSe2Cd}/{relicId}
//             <span class="collection_mark">원화</span>
//             <span class="collection_tit">주먹대장 (01)</span>
//             <span class="collection_author">김원빈</span>
//             <th>제작연도</th><td>1975</td>  <th>크기</th><td>352x255x25mm</td>
//             <th>유물번호</th><td>7622</td>
//             swiper gallery → 1..N  /common/file/atchmnDownload.ajax?type=collection&fileImageId={uuid}
//   • Image : /common/file/atchmnDownload.ajax?type=collection&fileImageId={uuid}
//             returns the UNMARKED full-res master (e.g. 2751x3884, Canon EOS scan),
//             no login / no watermark. (atchmnDownloadMark.ajax = watermarked, 403s for us;
//             atchmnDownloadThum.ajax = 300px thumb — neither is used.)
//             NOTE: the gated /original/collectionDigiFile "디지털파일 제공" service
//             (login + 신청 + 허가조건) is a DIFFERENT path and is NOT used here.
//
// One ARMIN record per object, using the FIRST gallery image as the representative board.
//
// Usage:
//   node scripts/scrape-korea-manhwa.mjs --probe   # ~15 works end-to-end (+R2), write probe JSON
//   node scripts/scrape-korea-manhwa.mjs --full     # all in-scope 원화, resumable, write collection JSON

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { autocropToWebp } from './lib/autocrop.mjs';

const require = createRequire(import.meta.url);
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
require('dotenv').config({ path: path.join(REPO, '.env.local') });

const SLUG = 'korea-manhwa';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://www.kmas.or.kr';
const LIST = `${BASE}/original/mainCollectionList`;
const IMG = (fid) => `${BASE}/common/file/atchmnDownload.ajax?type=collection&fileImageId=${fid}`;
const DTASE1_WONHWA = '10'; // 원화 (original art)
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'probe';
const PROBE_TARGET = 15;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const decode = (s) => (s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&middot;/g, '·')
  .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();
const clean = (s) => decode(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

async function getHtml(url, attempts = 3) {
  for (let a = 1; a <= attempts; a++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { if (a === attempts) throw e; await sleep(600 * a); }
  }
}

// ---------- list: collect all relicIds for 원화 ----------
function parseListPage(html) {
  const ids = [];
  const re = /fnCollectionDetail\(\s*'(\d+)'\s*,\s*'(\d+)'\s*,\s*'(\d+)'\s*\)/g;
  let m;
  while ((m = re.exec(html))) ids.push({ dtaSe1: m[1], dtaSe2: m[2], relicId: m[3] });
  const cm = html.match(/총\s*<span[^>]*>\s*([\d,]+)\s*<\/span>\s*건/) || html.match(/총\s*([\d,]+)\s*건/);
  const total = cm ? parseInt(cm[1].replace(/,/g, ''), 10) : null;
  return { ids, total };
}

async function collectIds() {
  const out = [];
  let total = null;
  for (let page = 1; page <= 200; page++) {
    const html = await getHtml(`${LIST}?dtaSe1Cd=${DTASE1_WONHWA}&pageIndex=${page}`);
    const { ids, total: t } = parseListPage(html);
    if (t != null) total = t;
    const wonhwa = ids.filter((x) => x.dtaSe1 === DTASE1_WONHWA);
    if (wonhwa.length === 0) break;
    out.push(...wonhwa);
    await sleep(500);
    if (total != null && out.length >= total) break;
  }
  // de-dup relicIds (defensive)
  const seen = new Set();
  const uniq = out.filter((x) => (seen.has(x.relicId) ? false : (seen.add(x.relicId), true)));
  return { ids: uniq, total };
}

// ---------- detail: parse one object ----------
function parseDetail(html, ref) {
  const grab = (cls) => {
    const m = html.match(new RegExp(`<span class="${cls}">([\\s\\S]*?)</span>`));
    return m ? clean(m[1]) : '';
  };
  const th = (label) => {
    const m = html.match(new RegExp(`<th[^>]*>\\s*${label}\\s*</th>\\s*<td[^>]*>([\\s\\S]*?)</td>`));
    return m ? clean(m[1]) : '';
  };
  const category_mark = grab('collection_mark');
  const title = grab('collection_tit');
  const artist = grab('collection_author');
  const yearStr = th('제작연도');
  const dimensions = th('크기');
  const objectNumber = th('유물번호') || ref.relicId;

  // gallery images (preserve order, de-dup)
  const fids = [];
  const seen = new Set();
  const ir = /atchmnDownload\.ajax\?type=collection&fileImageId=([0-9a-f-]{36})/g;
  let im;
  while ((im = ir.exec(html))) { if (!seen.has(im[1])) { seen.add(im[1]); fids.push(im[1]); } }

  const ym = yearStr.match(/\d{4}/);
  const year = ym ? parseInt(ym[0], 10) : null;

  return { ...ref, category_mark, title, artist, yearStr, year, dimensions, objectNumber, fids };
}

// 원화 (hand-drawn comic boards) → "drawing"; animation cels → "mixed_media_2d" (none yet);
// posters → "print" (none in 원화 set). Returns null if not in-scope.
function categoryOf(mark) {
  const m = (mark || '').replace(/\s+/g, '');
  if (m === '원화') return 'drawing';
  if (/셀화|애니메이션|배경화/.test(m)) return 'mixed_media_2d';
  if (/포스터/.test(m)) return 'print';
  return null; // 연속간행물 (books) and anything else → out of scope
}

// ---------- image: download full master, webp, R2 ----------
async function dl(url, attempts = 3) {
  for (let a = 1; a <= attempts; a++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ct = r.headers.get('content-type') || '';
      const buf = Buffer.from(await r.arrayBuffer());
      if (ct.includes('text/html') || buf.length < 8000) throw new Error(`not-an-image (${ct || buf.length + 'b'})`);
      return buf;
    } catch (e) { if (a === attempts) throw e; await sleep(700 * a); }
  }
}

async function uploadR2(key, buffer) {
  for (let a = 1; a <= 4; a++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      return true;
    } catch (e) { if (a === 4) throw e; await sleep(400 * a); }
  }
}

async function processImage(obj) {
  // use the first gallery image as the representative board
  const fid = obj.fids[0];
  const srcUrlImg = IMG(fid);
  const src = await dl(srcUrlImg);
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(src); // default: webp(2048/q85), no trim
  const hash8 = sha(srcUrlImg).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${SLUG}-${obj.relicId}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcUrlImg, w: meta.width || null, h: meta.height || null };
}

// ---------- record assembly (min-4 guard) ----------
function toArtwork(obj, imageUrl, srcUrlImg) {
  const category = categoryOf(obj.category_mark);
  if (!obj.title || !obj.artist || obj.year == null || !category) return null;
  const sourceUrl = `${LIST}/${obj.dtaSe1}/${obj.dtaSe2}/${obj.relicId}`;
  return {
    id: `${SLUG}-${obj.relicId}`,
    objectNumber: obj.objectNumber || '',
    title: obj.title,
    artist: obj.artist,
    date: obj.yearStr || String(obj.year),
    year: obj.year,
    medium: '원화 (original comic art)',
    dimensions: obj.dimensions || '',
    category,
    description: '',
    imageUrl,
    thumbnailUrl: `${BASE}/common/file/atchmnDownloadThum.ajax?relic=C&fileImageId=${obj.fids[0]}`,
    onDisplay: false,
    displayLocation: '',
    sourceUrl,
    metadata: { relicId: obj.relicId, category_ko: obj.category_mark, image_count: obj.fids.length },
    original_imageUrl: srcUrlImg,
  };
}

function writeCollection(artworks, stem, total) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Korea Manhwa Museum',
    collection: 'Original Comic Art (원화)',
    website: 'https://www.komacon.kr/comicsmuseum/',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'html',
    source_note: 'KMAS / 만화규장각 (kmas.or.kr) — museum-own digital archive, 원화 category only',
    in_scope_total: total ?? artworks.length,
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`[write] ${out} (${artworks.length} works) breakdown=`, cats);
  return out;
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { return { done: {} }; }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS, JSON.stringify(p, null, 2)); }

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  console.log(`[${MODE}] collecting 원화 relicIds from KMAS …`);
  const { ids, total } = await collectIds();
  console.log(`[${MODE}] in-scope 원화 objects: ${ids.length} (site total: ${total})`);

  const targets = MODE === 'probe' ? ids.slice(0, PROBE_TARGET) : ids;
  const progress = MODE === 'full' ? loadProgress() : { done: {} };

  const artworks = [];
  let done = 0, imgErr = 0, drop = 0, skipNoImg = 0;
  for (const ref of targets) {
    if (MODE === 'full' && progress.done[ref.relicId]) {
      if (progress.done[ref.relicId].rec) artworks.push(progress.done[ref.relicId].rec);
      continue;
    }
    try {
      const html = await getHtml(`${LIST}/${ref.dtaSe1}/${ref.dtaSe2}/${ref.relicId}`);
      const obj = parseDetail(html, ref);
      await sleep(450);
      if (!obj.fids.length) { skipNoImg++; throw new Error('no gallery image'); }
      const { imageUrl, srcUrlImg } = await processImage(obj);
      const rec = toArtwork(obj, imageUrl, srcUrlImg);
      if (rec) {
        artworks.push(rec);
        if (MODE === 'full') { progress.done[ref.relicId] = { rec }; saveProgress(progress); }
      } else {
        drop++;
        if (MODE === 'full') { progress.done[ref.relicId] = { dropped: true }; saveProgress(progress); }
      }
    } catch (e) {
      imgErr++;
      fs.appendFileSync(FAILED, JSON.stringify({ relicId: ref.relicId, err: String(e.message || e) }) + '\n');
      if (imgErr <= 8) console.log(`  err relicId=${ref.relicId}: ${e.message}`);
    }
    if (++done % 10 === 0) console.log(`  …${done}/${targets.length} (ok ${artworks.length}, err ${imgErr}, drop ${drop})`);
    await sleep(350);
  }

  artworks.sort((a, b) => Number(a.metadata.relicId) - Number(b.metadata.relicId));
  const stem = MODE === 'probe' ? `${COLLECTION_STEM}-probe` : COLLECTION_STEM;
  writeCollection(artworks, stem, total);
  console.log(`\n[${MODE}] DONE. collected ${artworks.length} | img/parse errors ${imgErr} | min4-drops ${drop} | no-image ${skipNoImg}`);
  if (MODE === 'probe' && artworks.length) {
    const s = artworks[0];
    console.log(`[probe] sample: ${s.artist} — ${s.title} (${s.year}) ${s.dimensions} | ${s.category}\n         ${s.imageUrl}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
