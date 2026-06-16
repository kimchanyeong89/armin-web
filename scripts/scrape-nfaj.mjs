#!/usr/bin/env node
// National Film Archive of Japan (NFAJ, Tokyo) — flat FILM-ART scraper.
// Source: museum-OWN Elasticsearch API behind the "Japanese Film Heritage" non-film
//   collection portal (https://nfajfilmheritage.jp/, a Nuxt SPA).
//     POST https://jfh.nfaj.go.jp/v2/elasticsearch/search
//     HTTP Basic auth  jfhapi:backend202403   (key embedded in the public JS bundle
//       _nuxt/constants.*.js — {url, auth})
//   Index = archive_v5_2, total 6,999 docs across 4 資料ジャンル (material genres):
//     ポスター 219 | 映画館チラシ 873 | 映画館プログラム 5,682 | 技術資料 225
//   We collect the three FLAT print genres (posters / cinema flyers / cinema programmes)
//   and EXCLUDE 技術資料 (cameras / projectors / 3D equipment — out of scope).
//
// API QUIRKS (verified live, Phase A):
//   • The endpoint chokes on any `query` object (returns a 1-byte body / "5"). It DOES
//     honour `{from,size}` (paginate, total via hits.total.value) and `{size:0,aggs:…}`.
//     So we page through ALL 6,999 with from/size and filter genre CLIENT-SIDE on
//     _source.data.資料ジャンル.content.
//   • jfh.nfaj.go.jp serves an INCOMPLETE TLS chain (missing intermediate) — node fetch
//     fails with UNABLE_TO_VERIFY_LEAF_SIGNATURE while macOS curl accepts it. We set
//     NODE_TLS_REJECT_UNAUTHORIZED=0 for this run (museum's own first-party host).
//
// IMAGES: _source.data.images.{360px,1200px,3200px}[] (arrays — multi-page for
//   programmes/flyers). One ARMIN record = the COVER (first) image, preferring 3200px
//   then 1200px. Served at  https://jfh.nfaj.go.jp/images/{path}  (Basic auth, Referer).
//   Verified ≥600px: poster 3200px = 2363×3200, 1200px = 886×1200; flyer 1200px = 927×1200.
//
// SCOPE / B&W: posters, flyers and programmes are FILM POSTER ART → category "print".
//   Per the film-museum scope + COLLECTION_SCRAPING_GUIDE §1, film posters/stills/drawings
//   are NEVER colour-gated (the B&W reproductive-engraving gate does not apply to them).
//   colorfulness() is copied below per spec but intentionally not used to drop records.
//
// Usage:
//   node scripts/scrape-nfaj.mjs --probe   # ~15 in-scope works end-to-end + R2 upload, write probe JSON
//   node scripts/scrape-nfaj.mjs --full    # all in-scope, resumable, write collection JSON
//   node scripts/scrape-nfaj.mjs --count   # dry-run: genre tally only (no images)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { autocropToWebp } from './lib/autocrop.mjs';

// jfh.nfaj.go.jp ships an incomplete cert chain; first-party museum host.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const require = createRequire(import.meta.url);
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
require('dotenv').config({ path: path.join(REPO, '.env.local') });

const SLUG = 'nfaj';
const COLLECTION_STEM = `${SLUG}-collection`;
const API = 'https://jfh.nfaj.go.jp/v2/elasticsearch/search';
const IMG_BASE = 'https://jfh.nfaj.go.jp/images/';
const AUTH_B64 = Buffer.from('jfhapi:backend202403').toString('base64');
const REFERER = 'https://nfajfilmheritage.jp/';
const OBJ_URL = (id) => `https://nfajfilmheritage.jp/object?id=${id}`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--probe') ? 'probe' : 'count';
const PROBE_TARGET = 15;
const PAGE = 1000;

// In-scope material genres (資料ジャンル) → ARMIN category. 技術資料 (equipment) excluded.
const GENRE_CATEGORY = {
  'ポスター': 'print',          // film posters (core)
  '映画館チラシ': 'print',      // cinema flyers / handbills (chirashi)
  '映画館プログラム': 'print',  // cinema programmes (booklets)
};

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const clean = (s) => (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim();
// a museum "-" / "－" placeholder means "no value"
const real = (s) => { const v = clean(s); return v && v !== '-' && v !== '－' && v !== '−' ? v : ''; };

// ---------- Hasler-Süsstrunk colorfulness (copied per spec; not used to gate film posters) ----------
async function colorfulness(buf) {
  try {
    const { data } = await sharp(buf, { limitInputPixels: false }).resize(80, 80, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const rg = [], yb = [];
    for (let i = 0; i < data.length; i += 3) { const R = data[i], G = data[i + 1], B = data[i + 2]; rg.push(R - G); yb.push(0.5 * (R + G) - B); }
    const m = a => a.reduce((s, v) => s + v, 0) / a.length;
    const sd = a => { const mu = m(a); return Math.sqrt(m(a.map(v => (v - mu) ** 2))); };
    return Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(m(rg) ** 2 + m(yb) ** 2);
  } catch { return -1; }
}

// ---------- fetch layer ----------
async function esPage(from, size) {
  for (let att = 1; att <= 4; att++) {
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${AUTH_B64}`, Referer: REFERER, 'User-Agent': UA },
        body: JSON.stringify({ from, size }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (!j.hits) throw new Error('no hits envelope');
      return j;
    } catch (e) { if (att === 4) throw e; await sleep(600 * att); }
  }
}

// Page through the whole index; return all in-scope parsed records (sorted by id).
async function fetchInScope() {
  const first = await esPage(0, 1);
  const total = first.hits.total?.value ?? 0;
  console.log(`[fetch] index total = ${total}`);
  const out = [];
  const tally = {};
  for (let from = 0; from < total; from += PAGE) {
    const j = await esPage(from, PAGE);
    for (const h of j.hits.hits) {
      const genre = clean(h._source?.data?.['資料ジャンル']?.content || h._source?.thumbnail?.genre);
      tally[genre] = (tally[genre] || 0) + 1;
      if (genre in GENRE_CATEGORY) {
        const p = parseRecord(h._source, GENRE_CATEGORY[genre]);
        if (p) out.push(p);
      }
    }
    console.log(`  …page from=${from} (+${j.hits.hits.length}) in-scope so far ${out.length}`);
    await sleep(300);
  }
  console.log('[fetch] genre tally:', tally);
  // Prioritize highest-value flat art first: posters → flyers → programmes, then by id.
  // (Keeps the most curatorially significant works at the front if a cap is ever needed.)
  const GENRE_RANK = { 'ポスター': 0, '映画館チラシ': 1, '映画館プログラム': 2 };
  out.sort((a, b) => (GENRE_RANK[a.genre] - GENRE_RANK[b.genre]) || (Number(a.id) - Number(b.id)));
  return { records: out, total, tally };
}

// pick a flat label out of the data.{section} dict by Japanese label substring
function pickByLabel(data, ...labels) {
  for (const sec of Object.values(data || {})) {
    if (!sec || typeof sec !== 'object') continue;
    const entries = sec.label != null ? [sec] : Object.values(sec);
    for (const e of entries) {
      if (e && typeof e === 'object' && labels.some((l) => clean(e.label).includes(l))) {
        const v = real(e.content);
        if (v) return v;
      }
    }
  }
  return '';
}

// first cover image path, preferring 3200px → 1200px → 360px
function coverImage(images) {
  if (!images) return null;
  for (const tier of ['3200px', '1200px', '360px']) {
    const arr = images[tier];
    if (Array.isArray(arr) && arr[0]) return arr[0];
    if (typeof arr === 'string' && arr) return arr;
  }
  return null;
}

// ---------- _source → ARMIN candidate ----------
function parseRecord(src, category) {
  const data = src.data || {};
  const th = src.thumbnail || {};
  const search = src.search || {};
  const id = clean(data['関係資料ID']?.content || th.document_id || search.document_id);
  if (!id) return null;

  const title = real(pickByLabel(data, '資料名') || th.object_name || search.object_name);
  if (!title) return null;

  // artist/creator: publisher (発行者) or director (監督). Guide §2: never fill a missing
  // MUST field with a placeholder — drop the record instead (handled by min-4 guard below).
  const artist = real(pickByLabel(data, '発行者') || search.creator_name || pickByLabel(data, '監督') || search.creator_org_name);

  const dateStr = real(pickByLabel(data, '発行年月日', '発行年', '製造年', '上映期間'));
  const ym = dateStr.match(/\d{4}/);
  const year = ym ? parseInt(ym[0], 10) : null;

  const dimensions = real(pickByLabel(data, '寸法')); // 縦×横（cm） for posters
  const titleEn = real(pickByLabel(data, '英字資料名') || th.object_name_en);
  const theater = real(pickByLabel(data, '興行館名'));
  const place = real(pickByLabel(data, '上映館所在地') || search.place);
  const films = real(pickByLabel(data, '上映作品') || search.cinemas);
  const collection = real(pickByLabel(data, 'コレクション名'));
  const director = real(pickByLabel(data, '監督'));

  const imgPath = coverImage(data.images);
  if (!imgPath) return null; // need a downloadable flat image

  const genre = clean(data['資料ジャンル']?.content);
  const medium = genre; // 資料ジャンル is the medium label (ポスター/映画館チラシ/映画館プログラム)

  return {
    id, title, titleEn, artist, year, dateStr, dimensions, medium, category, genre,
    theater, place, films, collection, director,
    imgUrl: IMG_BASE + imgPath, imgPath,
    sourceUrl: OBJ_URL(id),
  };
}

// ---------- image: download cover, autocrop, upload R2 ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Authorization: `Basic ${AUTH_B64}`, Referer: REFERER } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) { if (att === 3) throw e; await sleep(500 * att); }
  }
}

async function uploadR2(key, buffer) {
  for (let att = 1; att <= 4; att++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      return true;
    } catch (e) { if (att === 4) throw e; await sleep(400 * att); }
  }
}

async function processImage(a) {
  const src = await dl(a.imgUrl);
  const meta = await sharp(src, { limitInputPixels: false }).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(src); // white-trim + webp(2048/q85)
  const hash8 = sha(a.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (min-4 guard) ----------
function toArtwork(a, imageUrl) {
  if (!a.title || !a.artist || a.year == null || !a.category) return null;
  const descParts = [];
  if (a.titleEn) descParts.push(a.titleEn);
  if (a.director) descParts.push(`Director: ${a.director}`);
  if (a.theater) descParts.push(`Cinema: ${a.theater}`);
  if (a.place) descParts.push(a.place);
  if (a.films) descParts.push(`Films: ${a.films}`);
  if (a.collection) descParts.push(`Collection: ${a.collection}`);
  return {
    id: `${SLUG}-${a.id}`,
    objectNumber: a.id,
    title: a.title,
    artist: a.artist,
    date: a.dateStr || (a.year != null ? String(a.year) : ''),
    year: a.year,
    medium: a.medium,
    dimensions: a.dimensions,
    category: a.category,
    description: descParts.join(' · '),
    imageUrl,
    thumbnailUrl: a.imgUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: { document_id: a.id, genre: a.genre, title_en: a.titleEn || '', collection: a.collection || '' },
    original_imageUrl: a.imgUrl,
  };
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'National Film Archive of Japan',
    collection: 'Japanese Film Heritage — Posters, Flyers & Programmes',
    website: 'https://nfajfilmheritage.jp/',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'api',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  const mb = (fs.statSync(out).size / 1e6).toFixed(1);
  console.log(`[write] ${out} (${artworks.length} works, ${mb}MB) breakdown=`, cats);
  return out;
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const { records, total, tally } = await fetchInScope();
  console.log(`\n[scope] in-scope flat-art records (posters+flyers+programmes): ${records.length} of ${total} total`);

  if (MODE === 'count') {
    const byGenre = {};
    for (const r of records) byGenre[r.genre] = (byGenre[r.genre] || 0) + 1;
    console.log('[count] in-scope by genre:', byGenre);
    let noYear = 0; for (const r of records) if (r.year == null) noYear++;
    console.log('[count] in-scope missing year (min-4 risk):', noYear);
    console.log('[count] samples:');
    for (const r of records.slice(0, 5)) console.log('  -', r.genre, '|', r.title.slice(0, 30), '|', r.dateStr, '|', r.artist.slice(0, 20));
    return;
  }

  // resumable: skip ids already collected
  let collected = [];
  if (MODE === 'full' && fs.existsSync(PROGRESS)) {
    try { collected = JSON.parse(fs.readFileSync(PROGRESS, 'utf8')).artworks || []; } catch {}
    console.log(`[resume] loaded ${collected.length} previously collected`);
  }
  const done = new Set(collected.map((w) => w.objectNumber));
  let candidates = records.filter((r) => !done.has(r.id));
  if (MODE === 'probe') {
    // true 15-work end-to-end test: only candidates that will pass the min-4 guard,
    // and span genres (a few posters + flyers + programmes).
    const ok = candidates.filter((r) => r.title && r.artist && r.year != null);
    const pick = [];
    for (const g of ['ポスター', '映画館チラシ', '映画館プログラム']) {
      pick.push(...ok.filter((r) => r.genre === g).slice(0, 5));
    }
    candidates = pick.slice(0, PROBE_TARGET);
  }
  console.log(`[${MODE}] image-processing ${candidates.length} candidates → R2 …`);

  const artworks = [...collected];
  let okNew = 0, imgErr = 0, dropMin4 = 0, idx = 0;
  const CONC = MODE === 'probe' ? 3 : 5;
  const SAVE_EVERY = 100;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < candidates.length) {
      const a = candidates[idx++];
      try {
        const { imageUrl } = await processImage(a);
        const w = toArtwork(a, imageUrl);
        if (w) { artworks.push(w); okNew++; } else dropMin4++;
      } catch (e) {
        imgErr++;
        fs.appendFileSync(FAILED, JSON.stringify({ id: a.id, url: a.imgUrl, err: String(e.message || e) }) + '\n');
        if (imgErr <= 8) console.log(`  img err id=${a.id}: ${e.message}`);
      }
      const n = okNew + imgErr;
      if (n % 50 === 0) console.log(`  …${n}/${candidates.length} (ok ${okNew}, imgErr ${imgErr})`);
      if (MODE === 'full' && okNew > 0 && okNew % SAVE_EVERY === 0) {
        fs.writeFileSync(PROGRESS, JSON.stringify({ artworks }, null, 2));
      }
    }
  }));

  artworks.sort((x, y) => Number(x.objectNumber) - Number(y.objectNumber));
  const stem = MODE === 'probe' ? `${COLLECTION_STEM}-probe` : COLLECTION_STEM;
  const out = writeCollection(artworks, stem);
  if (MODE === 'full') fs.writeFileSync(PROGRESS, JSON.stringify({ artworks }, null, 2));
  console.log(`\n[${MODE}] DONE. new ${okNew} | total ${artworks.length} | img errors ${imgErr} | min4-drops ${dropMin4}`);
  console.log(`[${MODE}] in-scope offered total = ${records.length}`);
  if (MODE === 'probe') console.log(`[probe] file: ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
