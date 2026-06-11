#!/usr/bin/env node
// Sakıp Sabancı Museum (Istanbul) — collection scraper.
// Source: museum-OWN digital collections platform digitalssm.org (CONTENTdm):
//   - records:  /digital/bl/dmwebservices/index.php?q=dmQuery|dmGetItemInfo|dmGetCompoundObjectInfo (JSON)
//   - images:   IIIF Image API  https://digitalssm.org/iiif/2/{alias}:{pointer}/full/1600,/0/default.jpg
//     (full-res masters, e.g. 3738×4932 / 5768×4080 — verified Phase A)
// The museum's eMuseum (emuseum.sakipsabancimuzesi.org) only exposes a 385-object highlight
// subset; digitalssm.org is the complete digital catalogue, so we scrape the latter.
//
// SCOPE (flat art only):
//   ResimKlksyn  "Resim Koleksiyonu"            716 recs → painting / drawing / print / photograph
//   Kitapvehat   "Kitap Sanatları ve Hat"       608 recs → object="Hat" → calligraphy (singles)
//                                                          object="Elyazma kitap" → manuscript (compounds)
//                excluded: "Yazı malzemeleri" (writing implements, 3D), Tekstil, Kap, Video
//   Other CONTENTdm collections are out of scope: furniture/decorative (3D), archaeology (3D),
//   Emirgan/Dino/Lifij archives (documents/snapshots, not the art collection),
//   p21044coll6 (external-URL portal records, no SSM images).
//
// Min-4 policy: records lacking a REAL artist (Sanatçısı/Hattatı bilinmiyor → not real) are dropped.
//   year: parsed from dateco/kopya/date ("h. 1269 [1852-1853]" → 1852, "19. yüzyıl" → 1801,
//   "1960'lar" → 1960); when undated, derived from artist life dates (birth+20 / death−30,
//   recorded in metadata.year_source) — keeps ~331 undated paintings per the no-cap painting rule.
// B&W gate: category=print only (13 recs max) via Hasler-Süsstrunk colorfulness<20.
//   drawings/photographs/calligraphy/manuscripts are NEVER gated.
//
// Usage:
//   node scripts/scrape-sakip-sabanci.mjs --probe   # ~20 works end-to-end → sakip-sabanci-collection-probe.json
//   node scripts/scrape-sakip-sabanci.mjs --full    # all in-scope, resumable → sakip-sabanci-collection.json

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

const SLUG = 'sakip-sabanci';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://digitalssm.org';
const API = `${BASE}/digital/bl/dmwebservices/index.php?q=`;
const UA = 'armin-museum-research/1.0';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'probe';
const PROBE_TARGET = 20;
const CF_TH = 20;        // colorfulness threshold for monochrome reproductive prints
const CONC = 3;          // workers; each sleeps ≥250ms between requests → ~3-4 rps overall

// kind → short id segment; alias → CONTENTdm collection
const COLLECTIONS = [
  { alias: 'ResimKlksyn', kind: 'resim' },
  { alias: 'Kitapvehat', kind: 'hat' },
];

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const S = (v) => (typeof v === 'string' ? v.trim() : '');  // CONTENTdm empty fields come as {}

async function fetchJson(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      await sleep(250);
      return j;
    } catch (e) { if (att === 3) throw e; await sleep(800 * att); }
  }
}

// ---------- listing ----------
async function listRecords(alias) {
  // dmQuery returns ≤1024 recs per call; both collections fit in one page but loop anyway.
  const out = [];
  let start = 1;
  for (;;) {
    const q = `dmQuery/${alias}/0/title!object!typea/title/1000/${start}/1/0/0/0/0/json`;
    const d = await fetchJson(API + q);
    const recs = d.records || [];
    out.push(...recs);
    if (out.length >= (d.pager?.total ?? 0) || recs.length === 0) break;
    start += recs.length;
  }
  return out;
}

// ---------- year parsing ----------
function centuryToYear(n, text) {
  let y = (n - 1) * 100 + 1;
  if (/ikinci yarısı|second half/i.test(text)) y += 50;
  else if (/son çeyreği|last quarter/i.test(text)) y += 75;
  else if (/ilk çeyreği|first quarter/i.test(text)) y += 0;
  return y;
}
function parseYear(raw) {
  const t = S(raw);
  if (!t || /^tarihsiz$/i.test(t)) return null;
  const br = t.match(/\[(\d{3,4})/);                       // "h. 1269 [1852-1853]" → 1852
  if (br) { const y = +br[1]; if (y >= 800 && y <= 2026) return y; }
  const cent = t.match(/(\d{1,2})\.\s*(?:yüzyıl|yy)/i);    // "19. yüzyıl" → 1801
  if (cent) return centuryToYear(+cent[1], t);
  const dec = t.match(/(\d{4})\s*'?l[ae]r/);               // "1960'lar" → 1960
  if (dec) return +dec[1];
  const hij = t.match(/^h\.?\s*(\d{3,4})\b/i);             // bare hijri "h. 1269" → ≈1853 CE
  if (hij) { const y = Math.floor(622 + (+hij[1]) * 0.970224); if (y <= 2026) return y; }
  const g = t.match(/\b(1[5-9]\d\d|20[0-2]\d)\b/);         // plain gregorian 1500-2029
  if (g) return +g[1];
  return null;
}
// "Abidin Dino (1913-1993)" / "Mehmed Şefik, -1880" → estimated active year
function yearFromArtistDates(raw) {
  const t = S(raw);
  const lif = t.match(/\(?\s*(\d{4})\s*[-–]\s*(\d{4})?\s*\)?\s*$/);
  if (lif && +lif[1] >= 1200) return +lif[1] + 20;          // birth + 20
  const death = t.match(/[,(]\s*[-–]\s*(\d{4})\s*\)?\s*$/);
  if (death) return +death[1] - 30;                         // death − 30
  return null;
}
const stripArtistDates = (s) => S(s)
  .replace(/\s*\(\s*\d{4}\s*[-–]\s*\d{0,4}\s*\)\s*$/, '')
  .replace(/\s*[,(]\s*[-–]?\s*\d{4}\s*[-–]?\s*\d{0,4}\s*\)?\s*$/, '')
  .trim();
const isRealArtist = (s) => {
  const t = S(s).toLowerCase();
  return !!t && !/bilinmiyor|unknown|anonim|anonymous/.test(t);
};

// ---------- per-record parsing ----------
function classifyResim(typea, materi) {
  const t = typea.toLowerCase(), m = materi.toLowerCase();
  if (t.includes('gravür') || t.includes('baskı')) return 'print';
  if (t.includes('fotoğraf')) return 'photograph';
  // museum files unique works on paper under "Resim / Painting" — split drawings out by medium
  const paper = /kâğıt|kagit|karton|paper/.test(m);
  const dry = /mürekkep|karakalem|kurşun|füzen|pastel|sangin|çini mürekkebi|kalem|ink|charcoal|pencil|crayon/.test(m);
  const painty = /suluboya|guaj|gouache|yağlıboya|akrilik|tempera|watercolou?r|oil|acrylic/.test(m);
  if (paper && dry && !painty) return 'drawing';
  return 'painting';
}

function parseItem(col, ptr, info, filetype) {
  let artistRaw, category, dateStr, dims, objectNumber;
  if (col.alias === 'ResimKlksyn') {
    artistRaw = S(info.typeb);
    if (!isRealArtist(artistRaw)) return { drop: 'no-artist' };
    category = classifyResim(S(info.typea), S(info.materi));
    dateStr = S(info.dateco);
    dims = S(info.date);                                    // nick "date" = Boyutlar (Measurements)!
    objectNumber = S(info.idnumb);
  } else {
    const obj = S(info.object);
    if (obj === 'Hat') category = 'calligraphy';
    else if (obj === 'Elyazma kitap') category = 'manuscript';
    else return { drop: 'out-of-scope' };
    artistRaw = [info.commis, info.sanat, info.creata].map(S).find(isRealArtist) || '';
    if (!artistRaw) return { drop: 'no-artist' };
    dateStr = S(info.kopya) || S(info.date);
    dims = S(info.measur);
    objectNumber = S(info.identi);
  }
  let year = parseYear(dateStr);
  let yearSource = 'date';
  if (year == null) { year = yearFromArtistDates(artistRaw); yearSource = 'artist_dates'; }
  if (year == null) return { drop: 'no-year' };

  const title = S(info.title);
  if (!title) return { drop: 'no-title' };
  const medium = col.alias === 'ResimKlksyn' ? S(info.materi) : [S(info.materi), S(info.yaz)].filter(Boolean).join('; ');
  const description = (S(info.descri) || S(info.descra)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);

  return {
    id: `${SLUG}-${col.kind}-${ptr}`,
    objectNumber,
    title,
    artist: stripArtistDates(artistRaw),
    date: dateStr,
    year,
    medium,
    dimensions: dims,
    category,
    description,
    sourceUrl: `${BASE}/digital/collection/${col.alias}/id/${ptr}`,
    metadata: { contentdm: { collection: col.alias, pointer: ptr, filetype }, year_source: yearSource, artist_raw: artistRaw },
  };
}

// ---------- compound → representative page pointer ----------
function firstPagePtr(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.pageptr) return String(node.pageptr);
  for (const key of ['page', 'node']) {
    const v = node[key];
    const arr = Array.isArray(v) ? v : v ? [v] : [];
    for (const x of arr) { const r = firstPagePtr(x); if (r) return r; }
  }
  return null;
}
async function imagePointer(col, ptr, filetype) {
  if (filetype !== 'cpd') return ptr;
  const d = await fetchJson(`${API}dmGetCompoundObjectInfo/${col.alias}/${ptr}/json`);
  const p = firstPagePtr(d);
  if (!p) throw new Error('compound: no page pointer');
  return p;
}

// ---------- colorfulness (Hasler-Süsstrunk) — copied from audit/curate-grayscale-prints.mjs ----------
async function colorfulness(buf) {
  const { data } = await sharp(buf, { limitInputPixels: false }).resize(80, 80, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rg = [], yb = [];
  for (let i = 0; i < data.length; i += 3) { const R = data[i], G = data[i + 1], B = data[i + 2]; rg.push(R - G); yb.push(0.5 * (R + G) - B); }
  const m = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => { const mu = m(a); return Math.sqrt(m(a.map((v) => (v - mu) ** 2))); };
  return Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(m(rg) ** 2 + m(yb) ** 2);
}

// ---------- image pipeline ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
      await sleep(250);
      return buf;
    } catch (e) { if (att === 3) throw e; await sleep(800 * att); }
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
async function processImage(col, rec, imgPtr) {
  const iiif = (size) => `${BASE}/iiif/2/${col.alias}:${imgPtr}/full/${size}/0/default.jpg`;
  let src;
  try { src = await dl(iiif('1600,')); }
  catch { src = await dl(iiif('full')); }                 // small originals: 1600-wide can 4xx on level1
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`);
  if (rec.category === 'print' && (await colorfulness(src)) < CF_TH) return { skip: 'bw-print' };
  const { buffer } = await autocropToWebp(src);           // webp 2048/q85 (no trim by default)
  const hash8 = sha(iiif('1600,')).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${rec.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return {
    imageUrl: `${R2_PUBLIC}/${key}`,
    thumbnailUrl: `${BASE}/iiif/2/${col.alias}:${imgPtr}/full/400,/0/default.jpg`,
    original_imageUrl: iiif('1600,'),
  };
}

// ---------- progress ----------
function loadProgress() {
  if (MODE !== 'full' || !fs.existsSync(PROGRESS)) return { done: {}, dropped: {} };
  return JSON.parse(fs.readFileSync(PROGRESS, 'utf8'));
}
let saveTick = 0;
function saveProgress(p, force = false) {
  if (MODE !== 'full') return;
  if (!force && ++saveTick % 20 !== 0) return;
  fs.writeFileSync(PROGRESS, JSON.stringify(p));
}

// ---------- output ----------
function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Sakıp Sabancı Museum',
    collection: 'Painting · Arts of the Book and Calligraphy',
    website: 'https://www.sakipsabancimuzesi.org/en/collections-and-research/collections/341',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'contentdm-api+iiif',
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
  const progress = loadProgress();

  // 1) enumerate
  let queue = [];
  for (const col of COLLECTIONS) {
    const recs = await listRecords(col.alias);
    let inScope = recs;
    if (col.alias === 'Kitapvehat') inScope = recs.filter((r) => ['Hat', 'Elyazma kitap'].includes(S(r.object)));
    console.log(`[list] ${col.alias}: ${recs.length} records, ${inScope.length} in-scope`);
    queue.push(...inScope.map((r) => ({ col, ptr: String(r.pointer), filetype: r.filetype })));
  }
  if (MODE === 'probe') {
    // interleave resim / hat-single / hat-compound candidates; workers stop at PROBE_TARGET successes
    const resim = queue.filter((q) => q.col.kind === 'resim').slice(0, 30);
    const hatSingle = queue.filter((q) => q.col.kind === 'hat' && q.filetype !== 'cpd').slice(0, 30);
    const hatCpd = queue.filter((q) => q.col.kind === 'hat' && q.filetype === 'cpd').slice(0, 15);
    queue = [];
    for (let i = 0; i < 30; i++) queue.push(...[resim[i], hatSingle[i], hatCpd[i]].filter(Boolean));
    console.log(`[probe] candidate pool ${queue.length}, stopping at ${PROBE_TARGET} collected`);
  }

  // 2) process
  const artworks = [];
  const drops = {};
  let done = 0, failed = 0, idx = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < queue.length) {
      if (MODE === 'probe' && artworks.length >= PROBE_TARGET) break;
      const { col, ptr, filetype } = queue[idx++];
      const id = `${SLUG}-${col.kind}-${ptr}`;
      if (progress.done[id]) { artworks.push(progress.done[id]); done++; continue; }
      if (progress.dropped[id]) { drops[progress.dropped[id]] = (drops[progress.dropped[id]] || 0) + 1; done++; continue; }
      try {
        const info = await fetchJson(`${API}dmGetItemInfo/${col.alias}/${ptr}/json`);
        const rec = parseItem(col, ptr, info, filetype);
        if (rec.drop) {
          drops[rec.drop] = (drops[rec.drop] || 0) + 1;
          progress.dropped[id] = rec.drop;
        } else {
          const imgPtr = await imagePointer(col, ptr, filetype);
          const img = await processImage(col, rec, imgPtr);
          if (img.skip) {
            drops[img.skip] = (drops[img.skip] || 0) + 1;
            progress.dropped[id] = img.skip;
          } else {
            const w = { ...rec, ...img, onDisplay: false, displayLocation: '' };
            artworks.push(w);
            progress.done[id] = w;
          }
        }
        saveProgress(progress);
      } catch (e) {
        failed++;
        fs.appendFileSync(FAILED, JSON.stringify({ id, ptr, col: col.alias, err: String(e.message || e) }) + '\n');
        if (failed <= 8) console.log(`  [fail] ${id}: ${e.message}`);
      }
      if (++done % 50 === 0) console.log(`  …${done}/${queue.length} (ok ${artworks.length}, failed ${failed})`);
    }
  }));
  saveProgress(progress, true);

  // 3) write
  artworks.sort((a, b) => a.id.localeCompare(b.id));
  writeCollection(artworks, MODE === 'probe' ? `${COLLECTION_STEM}-probe` : COLLECTION_STEM);
  console.log(`[${MODE}] DONE. collected ${artworks.length} | failed ${failed} | drops:`, drops);
}

main().catch((e) => { console.error(e); process.exit(1); });
