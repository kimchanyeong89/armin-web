#!/usr/bin/env node
// Nam June Paik Art Center (Yongin, KR) — collection scraper.
// Source: museum's OWN English site (Gyeonggi Cultural Foundation infra), server-rendered HTML:
//   listing  https://njpart.ggcf.kr/collections?page=1..N   (12 works/page, ~276 works)
//   detail   https://njpart.ggcf.kr/collections/{id}        (div.title, div.details, dl.meta dt/dd)
//   image    https://njpart.ggcf.kr/storage/upload/...jpg   (1600–3000px originals)
// Metadata parsed from the DETAIL page: Artist / Date / Classifications / Medium / Dimensions /
//   Collection No (objectNumber). KR sister site (njp.ggcf.kr) has the same catalogue with
//   different row ids; we use the EN site for romanized artists + English titles.
//
// SCOPE (flat works only) via the museum's own Classifications tags:
//   painting          -> painting (refined to drawing when medium is clearly works-on-paper drawing)
//   photography       -> photograph (incl. performance documentation photos)
//   video (no 3D tag) -> video (single/multi-channel works; TV sculptures carry a 3D tag and are skipped)
//   performance only  -> mapped by medium (video->video, photo->photograph, paper docs->mixed_media_2d), else skipped
//   3D tags (machinery, laser, robot, object, sculpture·installation, television) without a
//   painting/photography tag -> SKIPPED.
// B&W policy: colorfulness<20 gate applies ONLY to category 'print' (reproductive prints);
//   none are expected here — photographs/drawings/video are NEVER gated (guide §1).
//
// Usage:
//   node scripts/scrape-njpac.mjs --probe    # ~20 in-scope works end-to-end (R2 uploads live)
//   node scripts/scrape-njpac.mjs --full     # all in-scope, resumable
// State: scripts/.state/njpac-progress.json, failures -> scripts/.state/njpac-failed.ndjson

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

const SLUG = 'njpac';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://njpart.ggcf.kr';
const UA = 'armin-museum-research/1.0 (art directory; contact: niet89@kookmin.ac.kr)';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'probe';
const PROBE_TARGET = 20;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const decodeEntities = (s) => (s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#8217;|&rsquo;/g, '’')
  .replace(/&#8216;|&lsquo;/g, '‘').replace(/&#8211;|&ndash;/g, '–').replace(/&#8212;|&mdash;/g, '—')
  .replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”').replace(/&hellip;/g, '…').replace(/&nbsp;/g, ' ')
  .replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è').replace(/&ouml;/g, 'ö').replace(/&uuml;/g, 'ü')
  .replace(/&auml;/g, 'ä').replace(/&Kuml;|&Ouml;/g, 'Ö').replace(/&middot;/g, '·')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).trim();
const stripTags = (s) => decodeEntities((s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

async function getHtml(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { if (att === 3) throw e; await sleep(800 * att); }
  }
}

// ---------- listing: enumerate all detail-page ids ----------
async function listIds() {
  const ids = new Set();
  let maxPage = 30; // refined from page-1 pagination
  for (let p = 1; p <= maxPage; p++) {
    const html = await getHtml(`${BASE}/collections?page=${p}`);
    if (p === 1) {
      const pages = [...html.matchAll(/collections\?page=(\d+)/g)].map((m) => +m[1]);
      if (pages.length) maxPage = Math.max(...pages);
      console.log(`[list] pagination max page = ${maxPage}`);
    }
    const before = ids.size;
    for (const m of html.matchAll(/href="\/collections\/(\d+)"/g)) ids.add(+m[1]);
    if (ids.size === before) { console.log(`[list] page ${p}: no new ids, stopping`); break; }
    await sleep(280); // ~3.5 rps
  }
  return [...ids].sort((a, b) => a - b);
}

// ---------- detail parse ----------
function parseDetail(html, rowId) {
  const title = stripTags((html.match(/<div class="title">([\s\S]*?)<\/div>/) || [])[1]);
  const dl = (html.match(/<dl class="meta">([\s\S]*?)<\/dl>/) || [])[1] || '';
  const fields = {};
  for (const m of dl.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)) {
    fields[stripTags(m[1]).toLowerCase()] = stripTags(m[2]);
  }
  // description: details div up to the meta dl
  let description = '';
  const di = html.indexOf('class="details"');
  if (di !== -1) {
    const end = html.indexOf('<dl class="meta"', di);
    description = stripTags(html.slice(di + 16, end === -1 ? di + 4000 : end));
    if (description.length > 600) description = description.slice(0, 597).replace(/\s+\S*$/, '') + '…';
  }
  // image: first /storage/upload/ img in the poster block
  const pi = html.indexOf('class="poster"');
  let img = null;
  if (pi !== -1) {
    const block = html.slice(pi, html.indexOf('class="meta-info"', pi) !== -1 ? html.indexOf('class="meta-info"', pi) : pi + 3000);
    img = (block.match(/src="(\/storage\/upload\/[^"]+)"/) || [])[1] || null;
  }
  if (!img) img = (html.match(/src="(\/storage\/upload\/[^"]+)"/) || [])[1] || null;

  const date = fields['date'] || '';
  const yearMatch = date.match(/\d{4}/);
  return {
    rowId,
    title,
    artist: (fields['artist'] || '').replace(/\s*,\s*/g, '; '),
    date,
    year: yearMatch ? +yearMatch[0] : null,
    classifications: (fields['classifications'] || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    medium: fields['medium'] || '',
    dimensions: fields['dimensions'] || '',
    objectNumber: fields['collection no'] || '',
    description,
    img: img ? new URL(img, BASE).href : null,
    sourceUrl: `${BASE}/collections/${rowId}`,
  };
}

// ---------- scope / category mapping (museum's own Classifications tags) ----------
const TAGS_3D = ['machinery', 'laser', 'robot', 'object', 'sculpture·installation', 'sculpture', 'installation', 'television'];
function classify(d) {
  const tags = d.classifications;
  const has = (t) => tags.includes(t);
  const has3D = tags.some((t) => TAGS_3D.some((x) => t.includes(x)));
  const m = d.medium.toLowerCase();
  if (has('painting')) {
    return /\b(pencil|charcoal|crayon|pastel|graphite|pen on|ink on paper|drawing)\b/.test(m) ? 'drawing' : 'painting';
  }
  if (has('photography')) return 'photograph';
  if (has('video')) return has3D ? null : 'video'; // video+sculpture = TV sculpture -> skip
  if (has('performance')) {
    if (has3D) return null;
    if (/video|channel|film|dvd/.test(m)) return 'video';
    if (/photo|gelatin|c-print|chromogenic/.test(m)) return 'photograph';
    if (/paper|poster|score|card|flyer|print/.test(m)) return 'mixed_media_2d';
    return null;
  }
  return null; // pure 3D / unknown
}

// ---------- B&W reproductive-print gate (policy: prints ONLY; photo/drawing/video never gated) ----------
// Hasler-Süsstrunk colorfulness — from scripts/audit/curate-grayscale-prints.mjs
async function colorfulness(buf) {
  const { data } = await sharp(buf, { limitInputPixels: false }).resize(80, 80, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rg = [], yb = [];
  for (let i = 0; i < data.length; i += 3) { const R = data[i], G = data[i + 1], B = data[i + 2]; rg.push(R - G); yb.push(0.5 * (R + G) - B); }
  const m = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => { const mu = m(a); return Math.sqrt(m(a.map((v) => (v - mu) ** 2))); };
  return Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(m(rg) ** 2 + m(yb) ** 2);
}

// ---------- image: download -> (print-only B&W gate) -> webp -> R2 ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: `${BASE}/collections` } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) { if (att === 3) throw e; await sleep(700 * att); }
  }
}

async function uploadR2(key, buffer) {
  for (let att = 1; att <= 4; att++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      return;
    } catch (e) { if (att === 4) throw e; await sleep(500 * att); }
  }
}

async function processImage(d, id, category) {
  const src = await dl(d.img);
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`too small ${meta.width}x${meta.height}`);
  if (category === 'print') {
    const cf = await colorfulness(src);
    if (cf >= 0 && cf < 20) throw new Error(`bw-print colorfulness ${cf.toFixed(1)}`);
  }
  const { buffer } = await autocropToWebp(src); // default: webp(2048/q85), no trim
  const hash8 = sha(d.img).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- assembly ----------
function toArtwork(d, category, imageUrl) {
  if (!d.title || !d.artist || d.year == null || !category) return null; // min-4 guard
  return {
    id: `${SLUG}-${d.rowId}`,
    objectNumber: d.objectNumber,
    title: d.title,
    artist: d.artist,
    date: d.date,
    year: d.year,
    medium: d.medium,
    dimensions: d.dimensions,
    category,
    description: d.description,
    imageUrl,
    thumbnailUrl: d.img,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: d.sourceUrl,
    metadata: { classifications: d.classifications.join(', ') },
    original_imageUrl: d.img,
  };
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { return { done: {}, skipped: {} }; }
}
function saveProgress(st) { fs.writeFileSync(PROGRESS, JSON.stringify(st)); }

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Nam June Paik Art Center',
    collection: 'Collection',
    website: 'https://njpart.ggcf.kr/collections',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'html',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`[write] ${out} (${artworks.length} works) breakdown=`, cats);
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const st = MODE === 'full' ? loadProgress() : { done: {}, skipped: {} };

  console.log(`[${MODE}] listing collection ids…`);
  const ids = await listIds();
  console.log(`[list] ${ids.length} unique works`);

  const artworks = Object.values(st.done).filter(Boolean);
  const haveIds = new Set(artworks.map((a) => a.id));
  let inScope = artworks.length, outScope = Object.keys(st.skipped).length, minDrop = 0, imgErr = 0, fetched = 0;

  for (const rowId of ids) {
    if (MODE === 'probe' && inScope >= PROBE_TARGET) break;
    const key = String(rowId);
    if (st.done[key] || st.skipped[key]) continue;

    let d;
    try {
      d = parseDetail(await getHtml(`${BASE}/collections/${rowId}`), rowId);
      fetched++;
      await sleep(280); // ~3.5 rps
    } catch (e) {
      fs.appendFileSync(FAILED, JSON.stringify({ rowId, stage: 'detail', err: String(e.message || e) }) + '\n');
      continue;
    }

    const category = classify(d);
    if (!category) {
      st.skipped[key] = d.classifications.join(',') || 'unclassified';
      outScope++;
      if (MODE === 'full') saveProgress(st);
      continue;
    }
    if (!d.img) {
      fs.appendFileSync(FAILED, JSON.stringify({ rowId, stage: 'no-image', title: d.title }) + '\n');
      st.skipped[key] = 'no-image';
      if (MODE === 'full') saveProgress(st);
      continue;
    }

    try {
      const id = `${SLUG}-${rowId}`;
      const { imageUrl, srcW, srcH } = await processImage(d, id, category);
      const w = toArtwork(d, category, imageUrl);
      if (!w) {
        minDrop++;
        st.skipped[key] = 'min4-drop';
        console.log(`  [min4-drop] ${rowId} title=${JSON.stringify(d.title)} artist=${JSON.stringify(d.artist)} year=${d.year}`);
      } else {
        if (!haveIds.has(w.id)) { artworks.push(w); haveIds.add(w.id); }
        st.done[key] = w;
        inScope++;
        console.log(`  [ok] ${w.id} ${category} ${srcW}x${srcH} "${w.title.slice(0, 45)}" — ${w.artist.slice(0, 30)}`);
      }
    } catch (e) {
      imgErr++;
      fs.appendFileSync(FAILED, JSON.stringify({ rowId, stage: 'image', url: d.img, err: String(e.message || e) }) + '\n');
      console.log(`  [img-err] ${rowId}: ${e.message}`);
    }
    if (MODE === 'full') saveProgress(st);
    if ((fetched % 50) === 0) console.log(`  …progress ${fetched}/${ids.length} (in-scope ${inScope}, skipped ${outScope}, imgErr ${imgErr})`);
  }

  artworks.sort((a, b) => +a.id.slice(SLUG.length + 1) - +b.id.slice(SLUG.length + 1));
  writeCollection(artworks, MODE === 'probe' ? `${COLLECTION_STEM}-probe` : COLLECTION_STEM);
  console.log(`[${MODE}] DONE. in-scope collected ${artworks.length} | out-of-scope ${outScope} | min4-drops ${minDrop} | img errors ${imgErr}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
