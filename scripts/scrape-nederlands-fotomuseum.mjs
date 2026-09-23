#!/usr/bin/env node
// Nederlands Fotomuseum (Rotterdam) — photography collection scraper.
//
// SOURCE (museum's OWN infra, no auth): Axiell Internet Server (AIS6) + classic Adlib Web API.
//   - Collection site: https://collectie.nederlandsfotomuseum.nl  ("Imagebank")
//   - JSON record API: /webapi/wwwopac.ashx?database=museum&search=<adlib>&output=json&fields=...&startfrom=N&limit=K
//       * 755,494 records total in the `museum` (collect) database — but ~81% are NEGATIVES (out of scope).
//       * object_name = "Afdruk" (positive photographic print) = 42,535 records → the in-scope set.
//   - Detail HTML (most complete per record): /Details/museum/{priref}
//       fields: Vervaardiger(creator), Beschrijving(description/used as title), Opnamedatum(date),
//               Materiaal, Techniek, "Formaat / Kleur" (holds B&W flag + dimensions like "18x24").
//   - Full-res image (museum's own image server): /webapi-images/wwwopac.ashx?command=getcontent
//       &server=main&data={media.reference.reference_number}&value={media.original_file_name}&imageformat=jpg
//       (omit width/height → native size; verified 1185x1600 / 1231x1600, well over 600px).
//
// SCOPE: photograph only. We collect object_name="Afdruk" (viewable positive prints). EXCLUDED:
//   Negatief (inverted negatives — 81% of DB), Diapositief (slides), Contactafdruk (multi-frame
//   contact sheets — visually weak). Photographs are NEVER colour-gated, so B&W ("zwart-wit") prints
//   are kept. min-4 enforced (title-or-description, artist, year, category); records missing any are dropped.
//
// SERVER NOTE: the AIS/Adlib backend is FLAKY under load (504 / "empty reply" / 503). The fetch layer
//   uses small page sizes, long timeouts, exponential backoff + many retries, and a polite inter-request
//   delay. Multi-field grouped API responses truncate, so per-record metadata comes from the detail HTML
//   (the one reliably-complete source), not from a wide `fields=` projection.
//
// Usage:
//   node scripts/scrape-nederlands-fotomuseum.mjs --probe   # ~15 in-scope works end-to-end (enumerate→enrich→image→R2), pretty JSON
//   node scripts/scrape-nederlands-fotomuseum.mjs --full    # all in-scope, resumable, COMPACT JSON (<23MB). DO NOT run in probe task.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
require('dotenv').config({ path: path.join(REPO, '.env.local') });

const SLUG = 'nederlands-fotomuseum';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://collectie.nederlandsfotomuseum.nl';
const API = `${BASE}/webapi/wwwopac.ashx`;
const IMG = `${BASE}/webapi-images/wwwopac.ashx`;
const DATABASE = 'museum';
const OBJECT_NAME = 'Afdruk';                 // positive photographic prints (in-scope)
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const RESEARCH_UA = 'armin-museum-research/1.0';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const JSON_CAP_BYTES = 23 * 1024 * 1024;

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'probe';
const PROBE_TARGET = 15;
const ENUM_PAGE = MODE === 'full' ? 100 : 50;  // small pages — server is flaky on big/deep windows
const REQ_DELAY = MODE === 'full' ? 1100 : 600; // polite inter-request delay (ms)

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- flaky-server fetch: long timeout + exponential backoff + retries ----------
async function robustFetch(url, { ua = UA, accept = 'application/json', tries = 6, baseTimeout = 60000 } = {}) {
  let lastErr;
  for (let att = 1; att <= tries; att++) {
    const ctrl = new AbortController();
    const timeout = baseTimeout + att * 15000;
    const to = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': ua, Accept: accept }, signal: ctrl.signal });
      clearTimeout(to);
      // 503/504/502/500 = transient backend strain → back off & retry
      if ([500, 502, 503, 504].includes(r.status)) throw new Error(`HTTP ${r.status}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) {
      clearTimeout(to);
      lastErr = e;
      if (att === tries) break;
      const wait = Math.min(30000, 2500 * Math.pow(1.8, att - 1)) + Math.floor(Math.random() * 1500);
      await sleep(wait);
    }
  }
  throw lastErr;
}

async function apiJson(params) {
  const url = `${API}?${params.toString()}`;
  const r = await robustFetch(url, { accept: 'application/json' });
  const ct = r.headers.get('content-type') || '';
  const body = await r.text();
  if (!body.trim().startsWith('{')) throw new Error(`non-JSON (${ct}) from ${url.slice(0, 120)}`);
  return JSON.parse(body);
}

// ---------- Adlib span helpers ----------
const txt = (n) => { try { return n.spans[0].text; } catch { return null; } };
function firstField(rec, outer, inner) {
  for (const o of (rec[outer] || [])) { const t = txt(o[inner] || {}); if (t) return t; }
  return null;
}
function firstCreator(rec) {
  for (const p of (rec.Production || [])) { const t = txt((p.creator || {}).name || {}); if (t) return t; }
  return null;
}
function firstMedia(rec) {
  for (const m of (rec.Media || [])) {
    const fn = txt(m['media.original_file_name'] || {});
    const ref = m['media.reference'] || {};
    const refNum = txt(ref.reference_number || {});
    const pub = txt(ref.publish_on_web || {});
    if (fn && refNum) return { fileName: fn, refNum, publishOnWeb: pub };
  }
  return null;
}

// ---------- enumerate Afdruk records (brief view: reliably gives Title + Production + Media + object_number) ----------
async function getTotal() {
  const p = new URLSearchParams({ database: DATABASE, search: `object_name=${OBJECT_NAME}`, limit: '0', output: 'json' });
  const j = await apiJson(p);
  return j.adlibJSON.diagnostic.hits || 0;
}

async function enumPage(startfrom, limit) {
  const p = new URLSearchParams({ database: DATABASE, search: `object_name=${OBJECT_NAME}`, startfrom: String(startfrom), limit: String(limit), output: 'json' });
  const j = await apiJson(p);
  return j.adlibJSON.recordList?.record || [];
}

// brief record → enumeration candidate (must have image + creator to be worth a detail fetch)
function toCandidate(rec) {
  const priref = String(rec['@priref'] ?? txt(rec.priref || {}) ?? '');
  if (!priref) return null;
  const media = firstMedia(rec);
  if (!media || media.publishOnWeb !== 'x') return null;     // no web-publishable image → skip
  const creator = firstCreator(rec);
  const title = firstField(rec, 'Title', 'title');
  const objectNumber = txt(rec.object_number || {}) || '';
  return { priref, objectNumber, title, creator, media };
}

// ---------- detail HTML enrichment (the one reliably-complete per-record source) ----------
function decodeEntities(s) {
  return (s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&#8217;/g, '’').replace(/&#8216;/g, '‘')
    .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
    .replace(/&nbsp;/g, ' ').replace(/&#x?[0-9a-fA-F]+;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}
const stripTags = (h) => decodeEntities((h || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function parseDetailHtml(html) {
  const out = {};
  // label/value pairs
  const re = /<span class="label">([^<]*)<\/span><span class="value">([\s\S]*?)<\/span><\/div>/g;
  let m;
  while ((m = re.exec(html))) {
    const label = decodeEntities(m[1]).trim();
    const value = stripTags(m[2]);
    if (label) out[label] = value;
  }
  return out;
}

// "Formaat / Kleur" => "zwart-wit, 18x24, stereo nee"  → split into {bw, dimensions}
function parseFormaat(formaat) {
  const res = { bw: false, color: false, dimensions: '' };
  if (!formaat) return res;
  const low = formaat.toLowerCase();
  if (/zwart-?wit|zw\b|b&w|black|monochroom/.test(low)) res.bw = true;
  if (/\bkleur\b|colou?r/.test(low)) res.color = true;
  // dimension token: something with digits and an 'x' / 'cm' / 'mm'
  const parts = formaat.split(',').map((s) => s.trim());
  for (const p of parts) {
    if (/\d/.test(p) && /(x|×|cm|mm)/i.test(p) && !/stereo/i.test(p)) { res.dimensions = p; break; }
  }
  return res;
}

// year from a date string like "1956-01-01 - 1962-12-31" or "1956" or "ca. 1930"
function yearFrom(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/(\d{4})/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  return y >= 1820 && y <= new Date().getFullYear() ? y : null;
}

async function enrichFromDetail(cand) {
  const url = `${BASE}/Details/${DATABASE}/${cand.priref}`;
  const r = await robustFetch(url, { ua: RESEARCH_UA, accept: 'text/html' });
  const html = await r.text();
  const f = parseDetailHtml(html);

  // creator: detail "Vervaardiger" is richer (display order) but brief Production is in source form;
  // prefer the API creator (source "Last, First" form per schema), fall back to detail text.
  const creator = cand.creator || (f['Vervaardiger'] ? f['Vervaardiger'].replace(/\s*\([^)]*\)\s*/g, '').replace(/\s*,\s*$/, '').split(',‎')[0].trim() : null);

  const title = cand.title || f['Titel'] || f['Beschrijving'] || null;       // description used as title when no Titel
  const description = f['Beschrijving'] || '';
  const dateStr = f['Opnamedatum'] || f['Datering'] || f['Productiedatum'] || '';
  const year = yearFrom(dateStr);
  const material = f['Materiaal'] || '';
  const technique = f['Techniek'] || '';
  const fmt = parseFormaat(f['Formaat / Kleur'] || f['Formaat'] || '');
  // medium: prefer technique (e.g. "Ontwikkel Gelatine Zilverdruk (OGZ)"), else material
  const medium = technique || material || '';

  return { ...cand, title, description, creator, dateStr, year, medium, dimensions: fmt.dimensions, bw: fmt.bw };
}

// ---------- image: full-res from museum image server → webp → R2 ----------
function imageUrlFor(media) {
  const p = new URLSearchParams({
    command: 'getcontent', server: 'main',
    data: media.refNum, value: media.fileName, imageformat: 'jpg',
  });
  return `${IMG}?${p.toString()}`;
}

async function downloadImage(url) {
  for (let att = 1; att <= 5; att++) {
    try {
      const r = await robustFetch(url, { ua: RESEARCH_UA, accept: 'image/*', tries: 2, baseTimeout: 90000 });
      const ct = r.headers.get('content-type') || '';
      if (!ct.startsWith('image/')) throw new Error(`not image (${ct})`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 8000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) { if (att === 5) throw e; await sleep(1500 * att); }
  }
}

async function uploadR2(key, buffer) {
  for (let att = 1; att <= 4; att++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      return true;
    } catch (e) { if (att === 4) throw e; await sleep(500 * att); }
  }
}

async function processImage(rec) {
  const srcUrl = imageUrlFor(rec.media);
  const src = await downloadImage(srcUrl);
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`small ${meta.width}x${meta.height}`);
  const webp = await sharp(src).resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  const hash8 = sha(srcUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${SLUG}-${rec.priref}-${hash8}-imageUrl.webp`;
  await uploadR2(key, webp);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcUrl, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (min-4 guard) ----------
function toArtwork(rec, imageUrl, srcUrl) {
  const title = (rec.title || '').trim();
  const artist = (rec.creator || '').trim();
  if (!title || !artist || rec.year == null) return null;     // min-4: title, artist, year (category is constant 'photograph')
  return {
    id: `${SLUG}-${rec.priref}`,
    objectNumber: rec.objectNumber || '',
    title,
    artist,                                                    // source form ("Last, First") per schema
    date: rec.dateStr || String(rec.year),
    year: rec.year,
    medium: rec.medium || '',
    dimensions: rec.dimensions || '',
    category: 'photograph',
    description: (rec.description && rec.description !== title) ? rec.description : '',
    imageUrl,
    thumbnailUrl: '',
    onDisplay: false,
    displayLocation: '',
    sourceUrl: `${BASE}/Details/${DATABASE}/${rec.priref}`,
    metadata: { priref: rec.priref, bw: rec.bw },
    original_imageUrl: srcUrl,
  };
}

function writeCollection(artworks, stem, pretty) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Nederlands Fotomuseum',
    collection: 'Photography Collection',
    website: 'https://collectie.nederlandsfotomuseum.nl/',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'api',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  let body = pretty ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
  // enforce <23MB for --full by trimming the tail (named+dated are already prioritized by enumeration order)
  if (!pretty && Buffer.byteLength(body) > JSON_CAP_BYTES) {
    let lo = 0, hi = artworks.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      payload.artworks = artworks.slice(0, mid);
      payload.total_count = mid;
      if (Buffer.byteLength(JSON.stringify(payload)) <= JSON_CAP_BYTES) lo = mid; else hi = mid - 1;
    }
    payload.artworks = artworks.slice(0, lo);
    payload.total_count = lo;
    body = JSON.stringify(payload);
    console.log(`[cap] trimmed to ${lo}/${artworks.length} works to stay <23MB`);
  }
  fs.writeFileSync(out, body);
  console.log(`[write] ${out} (${payload.total_count} works, ${(Buffer.byteLength(body) / 1048576).toFixed(1)}MB) breakdown=`, cats);
  return out;
}

// ---------- progress (resumable for --full) ----------
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
function loadProgress() { try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { return { startfrom: 1, artworks: [] }; } }
function saveProgress(p) { fs.writeFileSync(PROGRESS, JSON.stringify(p)); }

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  console.log(`[${MODE}] Nederlands Fotomuseum — object_name=${OBJECT_NAME}`);

  const total = await getTotal().catch((e) => { console.log('[warn] total fetch failed:', e.message); return null; });
  if (total != null) console.log(`[enum] total ${OBJECT_NAME} records = ${total}`);

  if (MODE === 'probe') {
    // enumerate just enough candidates to land PROBE_TARGET finished works
    const artworks = [];
    let startfrom = 1;
    let enumerated = 0, candidates = 0, imgErr = 0, dropMin4 = 0;
    while (artworks.length < PROBE_TARGET && startfrom < 2000) {
      const page = await enumPage(startfrom, ENUM_PAGE);
      if (!page.length) break;
      enumerated += page.length;
      await sleep(REQ_DELAY);
      for (const rec of page) {
        if (artworks.length >= PROBE_TARGET) break;
        const cand = toCandidate(rec);
        if (!cand || !cand.creator) continue;           // need image + creator to be worth enriching
        candidates++;
        try {
          const enriched = await enrichFromDetail(cand);
          await sleep(REQ_DELAY);
          if (!enriched.title || !enriched.creator || enriched.year == null) { dropMin4++; continue; }
          const { imageUrl, srcUrl, srcW, srcH } = await processImage(enriched);
          const w = toArtwork(enriched, imageUrl, srcUrl);
          if (!w) { dropMin4++; continue; }
          artworks.push(w);
          console.log(`  [${artworks.length}/${PROBE_TARGET}] ${w.id} "${w.title.slice(0, 38)}" — ${w.artist} (${w.year}) ${srcW}x${srcH}`);
          await sleep(REQ_DELAY);
        } catch (e) {
          imgErr++;
          console.log(`  [err] priref ${cand.priref}: ${e.message}`);
        }
      }
      startfrom += ENUM_PAGE;
    }
    writeCollection(artworks, `${COLLECTION_STEM}-probe`, true);
    console.log(`\n[probe] enumerated ${enumerated} | candidates ${candidates} | finished ${artworks.length} | min4-drops ${dropMin4} | errors ${imgErr}`);
    if (artworks.length < PROBE_TARGET) { console.error(`[probe] FAILED to reach ${PROBE_TARGET} works`); process.exit(1); }
    console.log('[probe] OK');
    return;
  }

  // ---- full ----
  const prog = loadProgress();
  const artworks = prog.artworks;
  const seen = new Set(artworks.map((a) => a.id));
  let startfrom = prog.startfrom;
  let imgErr = 0, dropMin4 = 0, done = artworks.length;
  while (true) {
    let page;
    try { page = await enumPage(startfrom, ENUM_PAGE); }
    catch (e) { console.log(`[enum] page ${startfrom} failed: ${e.message} — backing off`); await sleep(8000); continue; }
    if (!page.length) break;
    await sleep(REQ_DELAY);
    // prioritize named+dated: enrich candidates with image+creator
    const cands = page.map(toCandidate).filter((c) => c && c.creator);
    for (const cand of cands) {
      if (seen.has(`${SLUG}-${cand.priref}`)) continue;
      try {
        const enriched = await enrichFromDetail(cand);
        await sleep(REQ_DELAY);
        if (!enriched.title || !enriched.creator || enriched.year == null) { dropMin4++; continue; }
        const { imageUrl, srcUrl } = await processImage(enriched);
        const w = toArtwork(enriched, imageUrl, srcUrl);
        if (!w) { dropMin4++; continue; }
        artworks.push(w); seen.add(w.id);
        await sleep(REQ_DELAY);
      } catch (e) {
        imgErr++;
        fs.appendFileSync(path.join(STATE_DIR, `${SLUG}-failed.ndjson`), JSON.stringify({ priref: cand.priref, err: String(e.message || e) }) + '\n');
      }
      if (++done % 100 === 0) {
        console.log(`  …${done} kept (startfrom ${startfrom}, dropMin4 ${dropMin4}, imgErr ${imgErr})`);
        prog.startfrom = startfrom; prog.artworks = artworks; saveProgress(prog);
      }
    }
    startfrom += ENUM_PAGE;
    prog.startfrom = startfrom; prog.artworks = artworks; saveProgress(prog);
  }
  artworks.sort((a, b) => Number(a.metadata.priref) - Number(b.metadata.priref));
  writeCollection(artworks, COLLECTION_STEM, false);
  console.log(`\n[full] DONE. kept ${artworks.length} | min4-drops ${dropMin4} | img errors ${imgErr}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
