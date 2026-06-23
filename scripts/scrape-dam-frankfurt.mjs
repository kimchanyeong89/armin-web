#!/usr/bin/env node
// Deutsches Architekturmuseum (DAM Online) — Frankfurt — collection scraper.
// Source: museum-OWN digital collection portal (custom platform on nginx/Express),
//   https://sammlungen.dam-online.de/  (linked from dam-online.de → "Sammlung digital").
//   Enumerate via paginated HTML search; metadata from the DETAIL page; images via IIIF.
//
//   Search (HTML, paginated):
//     GET /suche/collection/ergebnisse?query=*&withImageOnly=1&pageSize=100&page=N
//     → tiles each contain  href="/detail/collection/{objectUUID}"
//   Detail page (HTML):  GET /detail/collection/{objectUUID}
//     info-list <li><strong class="label">Label</strong><span class="info">…</span></li>
//     primary media id:  <img id="iiif" data-iiifId="/iiif/iiif/2/dam___{mediaUUID}" …>
//   Image (IIIF Image API 2.0, museum-hosted, CC BY-NC-SA 4.0):
//     /iiif/iiif/2/dam___{mediaUUID}/full/full/0/default.jpg   (verified 5000px-class originals)
//
// SCOPE (architecture — FLAT works only): keep architectural DRAWINGS, plans, sketches,
//   tracings (Pause), renderings, and architectural PHOTOGRAPHS. EXCLUDE 3D models (Modell) —
//   the per-object `Objekttyp` field carries this distinction ("Zeichnung"/"Pause"/"Foto" vs
//   "Modell"); 3D objects also report 3-axis `Maße (Objektmaß)` vs a flat sheet `(Blattmaß)`.
//   category map: drawing/plan/sketch/tracing/rendering→drawing, photo→photograph.
//   Drawings & photographs are NEVER colour-gated (B&W architectural drawings are kept).
//
// THROTTLE: the portal temporarily rate-limits request bursts (returns an empty body, not a
//   status code). We fetch SEQUENTIALLY with a polite delay and exponential backoff on a
//   short/empty body. Do not raise concurrency.
//
// Usage:
//   node scripts/scrape-dam-frankfurt.mjs --classify   # enumerate + scope tally only (no images)
//   node scripts/scrape-dam-frankfurt.mjs --probe       # ~15 in-scope end-to-end + R2, write probe JSON
//   node scripts/scrape-dam-frankfurt.mjs --full        # all in-scope + R2, resumable, write collection JSON

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { autocropToWebp } from './lib/autocrop.mjs';

const require = createRequire(import.meta.url);
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
require('dotenv').config({ path: path.join(REPO, '.env.local') });

const SLUG = 'dam-frankfurt';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://sammlungen.dam-online.de';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--probe') ? 'probe' : 'classify';
const PROBE_TARGET = 15;
const PAGE_SIZE = 100;
const REQ_DELAY = 1100;          // ms between portal requests (polite; avoids throttle)

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const decodeEntities = (s) => (s || '')
  .replace(/&shy;/g, '').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&szlig;/g, 'ß')
  .replace(/&auml;/g, 'ä').replace(/&ouml;/g, 'ö').replace(/&uuml;/g, 'ü')
  .replace(/&Auml;/g, 'Ä').replace(/&Ouml;/g, 'Ö').replace(/&Uuml;/g, 'Ü')
  .replace(/&#8217;/g, '’').replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/\s+/g, ' ').trim();

// ---------- throttle-tolerant text fetch (empty body == throttled, back off & retry) ----------
async function getText(url, { minLen = 800, tries = 6 } = {}) {
  let wait = 2000;
  for (let att = 1; att <= tries; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'de,en;q=0.8' } });
      const t = await r.text();
      if (r.ok && t.length >= minLen) return t;
      // empty/short body or non-200 → throttled; back off
    } catch (_) { /* network blip → back off */ }
    if (att < tries) { await sleep(wait); wait = Math.min(wait * 2, 30000); }
  }
  return null;
}

// ---------- enumeration: paginated search → object UUIDs (withImageOnly) ----------
function parseTotal(html) {
  const m = html.match(/Ihre Suche ergab\s+([\d.]+)\s+Ergebnis/);
  return m ? parseInt(m[1].replace(/\./g, ''), 10) : null;
}
function parseUuids(html) {
  const set = new Set();
  for (const m of html.matchAll(/\/detail\/collection\/([0-9a-f-]{36})/g)) set.add(m[1]);
  return [...set];
}
async function enumerateUuids(limitPages = Infinity) {
  const all = [];
  const seen = new Set();
  let total = null;
  for (let page = 1; page <= limitPages; page++) {
    const url = `${BASE}/suche/collection/ergebnisse?query=*&withImageOnly=1&pageSize=${PAGE_SIZE}&page=${page}`;
    const html = await getText(url, { minLen: 5000 });
    await sleep(REQ_DELAY);
    if (!html) { console.log(`  [enum] page ${page}: no body (throttled out) — stopping`); break; }
    if (total == null) { total = parseTotal(html); console.log(`[enum] total withImageOnly = ${total}`); }
    const uuids = parseUuids(html);
    if (uuids.length === 0) { console.log(`  [enum] page ${page}: 0 objects — end of results`); break; }
    let added = 0;
    for (const u of uuids) if (!seen.has(u)) { seen.add(u); all.push(u); added++; }
    if (page % 5 === 0 || added < uuids.length) console.log(`  [enum] page ${page}: +${added} (total ${all.length})`);
    if (total != null && all.length >= total) break;
  }
  console.log(`[enum] collected ${all.length} object UUIDs`);
  return all;
}

// ---------- scope classifier (German Objekttyp / Maße) ----------
// Returns 'drawing' | 'photograph' (in-scope flat) or null (out of scope: 3D model / object).
function classify(objekttyp, masse) {
  const typ = (objekttyp || '').toLowerCase();
  const mass = (masse || '').toLowerCase();

  // 1) hard EXCLUDE — 3D models / objects.
  //    "modell" in Objekttyp, or a 3-axis size, or explicit Objektmaß (object measure, not sheet).
  if (/\bmodell\b|architekturmodell|entwurfsmodell|arbeitsmodell|gebäudemodell/.test(typ)) return null;
  if (/\bskulptur\b|plastik|relief\b|objekt\b/.test(typ)) return null;
  // 3-dimensional measurement (a × b × c) → object, not flat
  if (/\d[\d,.]*\s*[x×]\s*\d[\d,.]*\s*[x×]\s*\d/.test(mass)) return null;

  // 2) PHOTOGRAPH (architectural photography)
  if (/\bfoto|fotografie|photograph|lichtbild|abzug|diapositiv|negativ|fine art print/.test(typ)) return 'photograph';

  // 3) DRAWING family — drawings, plans, sketches, tracings, renderings, prints-on-paper, collages.
  if (/zeichnung|pause|skizze|entwurf|plan\b|grundriss|aufriss|schnitt|perspektive|ansicht|rendering|render\b|airbrush|aquarell|gouache|kohle|bleistift|tusche|kollage|collage|montage|druck|grafik|blatt|isometrie|axonometrie|lavierung|kolorierung|koloriert/.test(typ)) return 'drawing';

  // 4) flat sheet signal even if Objekttyp is unusual: "Blattmaß" present ⇒ works on paper.
  if (/blattmaß/.test(mass) && typ) return 'drawing';

  return null; // unknown / ambiguous → out of scope (conservative)
}

// ---------- detail page → parsed record ----------
function parseDetail(html, uuid) {
  // info-list label→value
  const d = {};
  const list = html.match(/<ul class="info-list">([\s\S]*?)<\/ul>/);
  if (list) {
    for (const li of list[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)) {
      const lm = li[1].match(/class="label">([\s\S]*?)<\/strong>\s*<span class="info">([\s\S]*?)<\/span>/);
      if (lm) {
        const key = decodeEntities(lm[1].replace(/<[^>]+>/g, ''));
        const val = decodeEntities(lm[2].replace(/<br\s*\/?>/gi, ' / ').replace(/<[^>]+>/g, ' '));
        if (key) d[key] = val;
      }
    }
  }
  // title (object name) — bold strong inside the h1 (also present in print-only h1)
  let title = '';
  const tm = html.match(/<strong>([\s\S]*?)<\/strong><\/h1>/) || html.match(/print-only">\s*<h1><strong>([\s\S]*?)<\/strong>/);
  if (tm) title = decodeEntities(tm[1]);

  // artists: anchor texts in h1 .name (js-pers), else fall back to "Beteiligte" field
  const artists = [];
  const h1 = html.match(/<h1 class="screen-only">([\s\S]*?)<\/h1>/);
  if (h1) for (const a of h1[1].matchAll(/js-pers[^>]*>([\s\S]*?)<\/a>/g)) {
    const n = decodeEntities(a[1].replace(/<[^>]+>/g, ''));
    if (n) artists.push(n);
  }
  let artist = artists.join('; ');
  if (!artist && d['Beteiligte']) {
    // "Name (role) / Name (role)" — strip the italic function labels already turned into plain text
    artist = d['Beteiligte'].split('/').map((s) => s.replace(/\b(Zeichner\/in|Architekt\/in|Fotograf\/in|Entwurf|Mitarbeit|Bauherr\/in|Planung|Künstler\/in)\b/gi, '').trim()).filter(Boolean).join('; ');
  }
  if (!artist && d['Beteiligte:']) artist = d['Beteiligte:'].replace(/\s*,\s*$/, '').trim();

  // IIIF media id (primary image)
  const im = html.match(/data-iiifId="(\/iiif\/iiif\/2\/dam___[0-9a-f-]+)"/);
  const iiifBase = im ? im[1] : null;

  // date / year
  const dateRaw = d['Datierung'] || '';
  // pick the first plausible 4-digit year (ignore "nicht realisiert" etc.)
  let year = null;
  const ym = dateRaw.match(/(\d{4})/);
  if (ym) year = parseInt(ym[1], 10);

  const objekttyp = d['Objekttyp'] || '';
  const masse = d['Maße'] || '';
  const category = classify(objekttyp, masse);

  return {
    uuid,
    objectNumber: d['Inventarnummer'] || '',
    title,
    artist,
    year,
    dateRaw,
    medium: d['Material / Technik'] || '',
    dimensions: masse,
    objekttyp,
    place: d['Ort'] || '',
    creditline: d['Creditline'] || '',
    description: '',          // long description block below info-list (literature) — usually citation, skip for blurb
    category,
    iiifBase,
    sourceUrl: `${BASE}/detail/collection/${uuid}`,
  };
}

// ---------- image: IIIF full → autocrop → R2 ----------
async function dlIiif(iiifBase) {
  // prefer the maximal /full/full/; if the server rejects (size limit), step down to /full/2048,
  const candidates = [`${BASE}${iiifBase}/full/full/0/default.jpg`, `${BASE}${iiifBase}/full/2048,/0/default.jpg`, `${BASE}${iiifBase}/full/1400,/0/default.jpg`];
  let lastErr;
  for (const url of candidates) {
    for (let att = 1; att <= 3; att++) {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
        return { buf, url };
      } catch (e) { lastErr = e; await sleep(500 * att); }
    }
  }
  throw lastErr || new Error('iiif download failed');
}

async function uploadR2(key, buffer) {
  for (let att = 1; att <= 4; att++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      return true;
    } catch (e) { if (att === 4) throw e; await sleep(400 * att); }
  }
}

async function processImage(rec) {
  const { buf, url } = await dlIiif(rec.iiifBase);
  const meta = await (await import('sharp')).default(buf).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(buf);            // webp(2048/q85); trim OFF by default
  const hash8 = sha(url).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${SLUG}-${rec.uuid}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, original: url, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (min-4 guard) ----------
function toArtwork(rec, imageUrl, original) {
  if (!rec.title || !rec.artist || rec.year == null || !rec.category) return null;
  return {
    id: `${SLUG}-${rec.uuid}`,
    objectNumber: rec.objectNumber,
    title: rec.title,
    artist: rec.artist,
    date: rec.dateRaw || String(rec.year),
    year: rec.year,
    medium: rec.medium,
    dimensions: rec.dimensions,
    category: rec.category,
    description: rec.description,
    imageUrl,
    thumbnailUrl: original,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: rec.sourceUrl,
    metadata: { uuid: rec.uuid, objekttyp: rec.objekttyp, place: rec.place, creditline: rec.creditline, license: 'CC BY-NC-SA 4.0' },
    original_imageUrl: original,
  };
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Deutsches Architekturmuseum (DAM)',
    collection: 'Architectural Drawings & Photographs',
    website: 'https://sammlungen.dam-online.de/',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'html',
    license: 'CC BY-NC-SA 4.0',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  const compact = MODE === 'full' && artworks.length > 4000;
  fs.writeFileSync(out, JSON.stringify(payload, ...(compact ? [] : [null, 2])));
  const sz = (fs.statSync(out).size / 1048576).toFixed(1);
  console.log(`[write] ${out} (${artworks.length} works, ${sz}MB${compact ? ', compact' : ''}) breakdown=`, cats);
  return out;
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { return { done: {}, uuids: null }; }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS, JSON.stringify(p)); }

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });

  if (MODE === 'classify') {
    // enumerate a few pages, fetch their details, tally scope (sampling — no images)
    const uuids = await enumerateUuids(3);           // 3 pages ≈ 300 objects
    const sample = uuids.slice(0, 60);
    console.log(`\n[classify] fetching ${sample.length} detail pages for scope tally …`);
    const tally = {}; let inScope = 0, out = 0, noImg = 0; const typTally = {};
    for (let i = 0; i < sample.length; i++) {
      const html = await getText(`${BASE}/detail/collection/${sample[i]}`);
      await sleep(REQ_DELAY);
      if (!html) { console.log(`  [classify] ${sample[i].slice(0, 8)}: no body`); continue; }
      const rec = parseDetail(html, sample[i]);
      typTally[rec.objekttyp || '(none)'] = (typTally[rec.objekttyp || '(none)'] || 0) + 1;
      if (rec.category) { inScope++; tally[rec.category] = (tally[rec.category] || 0) + 1; if (!rec.iiifBase) noImg++; }
      else out++;
      if ((i + 1) % 20 === 0) console.log(`  …${i + 1}/${sample.length} (in ${inScope}, out ${out})`);
    }
    console.log('\n[classify] sample size:', sample.length, '| in-scope:', inScope, '| out (3D/unknown):', out, '| in-scope missing IIIF:', noImg);
    console.log('[classify] category breakdown:', tally);
    console.log('[classify] Objekttyp distribution:');
    for (const [t, c] of Object.entries(typTally).sort((a, b) => b[1] - a[1])) console.log(`   ${String(c).padStart(3)}  ${t}`);
    const ratio = inScope / sample.length;
    console.log(`\n[classify] in-scope ratio ≈ ${(ratio * 100).toFixed(0)}% → est in-scope of 3591 imaged ≈ ${Math.round(ratio * 3591)}`);
    return;
  }

  // probe / full
  let prog = loadProgress();
  let uuids;
  if (MODE === 'full' && prog.uuids) {
    uuids = prog.uuids;
    console.log(`[full] resuming with ${uuids.length} enumerated UUIDs (${Object.keys(prog.done).length} already done)`);
  } else {
    uuids = await enumerateUuids(MODE === 'probe' ? 1 : Infinity);
    if (MODE === 'full') { prog.uuids = uuids; saveProgress(prog); }
  }

  const artworks = [];
  // reload any already-finished artworks for resumable full
  if (MODE === 'full') {
    for (const u of Object.keys(prog.done)) if (prog.done[u]) artworks.push(prog.done[u]);
  }

  let done = artworks.length, scanned = 0, outScope = 0, imgErr = 0, min4 = 0;
  const need = MODE === 'probe' ? PROBE_TARGET : Infinity;

  for (const uuid of uuids) {
    if (artworks.length >= need) break;
    if (MODE === 'full' && prog.done[uuid]) continue;
    scanned++;
    const html = await getText(`${BASE}/detail/collection/${uuid}`);
    await sleep(REQ_DELAY);
    if (!html) {
      imgErr++; fs.appendFileSync(FAILED, JSON.stringify({ uuid, err: 'detail no body' }) + '\n');
      continue;
    }
    const rec = parseDetail(html, uuid);
    if (!rec.category || !rec.iiifBase) { outScope++; if (MODE === 'full') { prog.done[uuid] = false; } continue; }
    try {
      const { imageUrl, original } = await processImage(rec);
      const w = toArtwork(rec, imageUrl, original);
      if (!w) { min4++; if (MODE === 'full') prog.done[uuid] = false; continue; }
      artworks.push(w);
      if (MODE === 'full') { prog.done[uuid] = w; }
      done++;
    } catch (e) {
      imgErr++; fs.appendFileSync(FAILED, JSON.stringify({ uuid, url: rec.iiifBase, err: String(e.message || e) }) + '\n');
      if (imgErr <= 8) console.log(`  img err ${uuid.slice(0, 8)}: ${e.message}`);
    }
    if (MODE === 'full' && scanned % 25 === 0) saveProgress(prog);
    if (done % 25 === 0 && done) console.log(`  …kept ${done} (scanned ${scanned}, out-of-scope ${outScope}, imgErr ${imgErr})`);
  }
  if (MODE === 'full') saveProgress(prog);

  artworks.sort((a, b) => (a.objectNumber || '').localeCompare(b.objectNumber || ''));
  const stem = MODE === 'probe' ? `${COLLECTION_STEM}-probe` : COLLECTION_STEM;
  writeCollection(artworks, stem);
  console.log(`\n[${MODE}] DONE. kept ${artworks.length} | scanned ${scanned} | out-of-scope ${outScope} | imgErr ${imgErr} | min4-drops ${min4}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
