#!/usr/bin/env node
// Cité internationale de la bande dessinée et de l'image (CIBDI) — Musée de la bande
// dessinée, Angoulême (France). Full ORIGINAL-ART scraper.
//
// SOURCE (museum's own consortium catalogue — Réseau des musées de Nouvelle-Aquitaine /
// Alienor.org, the platform CIBDI publishes its own collection on, linked directly from
// citebd.org/les-collections-…). Solr-backed JSON search API on alienor's own infra:
//   GET https://www.alienor.org/search/results?advancedSearch=1&museums=M0820&page=N
//        (X-Requested-With: XMLHttpRequest) → JSON { results:[...], nbResults, last, ... }
//   museums=M0820 = "Musée de la bande dessinée d'Angoulême" (4,871 catalogued works).
// All metadata lives in the listing JSON record (title, author, denomination, technical,
//   material, formDimensions, exeDate, inventoryNumber, description, image) — no per-object
//   detail fetch needed. Object page (sourceUrl) = /collections/oeuvre/{id}.
// Image: listing `image` is /media/synchro/{sid}/image250.jpeg → swap to image1000.jpeg
//   (alienor's own media host; the only large tier served, long-side up to ~1140px).
//   No login / no watermark. ~80% of records carry a real image; of those ~83% are ≥600px;
//   the rest are an old 360×360 thumbnail digitisation — skipped by the size gate.
//
// SCOPE (comics): ORIGINAL FLAT ART only. Keep planches originales / dessins / illustrations /
//   strips / storyboards / études / découpages / mises en couleur / caricatures / 2D maquettes
//   (→ drawing or mixed_media_2d) and comic-related posters/prints (affiche/sérigraphie/estampe/
//   épreuve/tirage/lithographie → print). EXCLUDE printed reproductions (imprimé alone,
//   coupure de presse) and any 3D/object.
// COPYRIGHT: images are openly served downloadable ≥600px on the museum's own infra → OK.
//
// Usage:
//   node scripts/scrape-cibdi-angouleme.mjs --probe   # ~15 in-scope works end-to-end + R2, write probe JSON
//   node scripts/scrape-cibdi-angouleme.mjs --classify# dry-run: scope/image tally only (no images)
//   node scripts/scrape-cibdi-angouleme.mjs --full    # full scrape + R2, resumable, write collection JSON

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

const SLUG = 'cibdi-angouleme';
const COLLECTION_STEM = `${SLUG}-collection`;
const MUSEUM_CODE = 'M0820';
const API = 'https://www.alienor.org/search/results';
const ORIGIN = 'https://www.alienor.org';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--probe') ? 'probe' : 'classify';
const PROBE_TARGET = 15;
const MAX_JSON_BYTES = 24 * 1024 * 1024;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function stripHtml(s) {
  return (s || '').replace(/<br\s*\/?>(\s*)/gi, ' ').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, ' ').trim();
}

// Extract string payloads from a PHP-serialized array string: a:N:{i:0;s:L:"...";...}
function unphp(s) {
  if (!s || typeof s !== 'string') return [];
  if (!s.startsWith('a:')) return [s];
  const out = [];
  const re = /s:\d+:"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(s))) {
    const v = m[1];
    // skip serialized keys / scaffolding tokens, keep real values
    if (v && !['AFFIXE', 'DEBDATE', 'FINDATE', 'APRÈS JÉSUS-CHRIST', 'AVANT JÉSUS-CHRIST'].includes(v)) out.push(v);
  }
  return out;
}

// ---------- date parsing ----------
// exeDate serialized examples: ['01.01.1970']  |  ['entre','01.01.1952','01.01.1953']
// Build a human dateStr + earliest year. Fallback to millenniumCentury text.
function parseDate(it) {
  const ds = unphp(it.exeDate).map((x) => x.trim()).filter((x) => /\d{2}\.\d{2}\.\d{4}/.test(x));
  const years = ds.map((x) => parseInt(x.slice(-4), 10)).filter((y) => y >= 1700 && y <= 2100).sort((a, b) => a - b);
  if (years.length) {
    const y0 = years[0], y1 = years[years.length - 1];
    return { dateStr: y0 === y1 ? String(y0) : `${y0}–${y1}`, year: y0 };
  }
  const cent = (it.millenniumCentury || '').trim();
  if (cent) {
    // e.g. "3e quart 20e siècle" → approx earliest year of that century band
    const cm = cent.match(/(\d{1,2})\s*e?\s*siècle/i);
    if (cm) {
      const c = parseInt(cm[1], 10);
      let base = (c - 1) * 100; // start of century
      if (/1er quart/i.test(cent)) base += 0;
      else if (/2e quart/i.test(cent)) base += 25;
      else if (/3e quart/i.test(cent)) base += 50;
      else if (/4e quart/i.test(cent)) base += 75;
      else if (/(1ère|1re) moitié/i.test(cent)) base += 0;
      else if (/2e moitié/i.test(cent)) base += 50;
      return { dateStr: cent, year: base };
    }
    return { dateStr: cent, year: null };
  }
  return { dateStr: '', year: null };
}

// ---------- scope classification (denomination + technical) ----------
// Returns 'drawing' | 'mixed_media_2d' | 'print' (in-scope) or null (excluded).
function classify(it) {
  const den = (it.denomination || '').toLowerCase();
  const tech = unphp(it.technical).join(' ').toLowerCase();
  const all = `${den} ${tech}`;

  // hard EXCLUDE — printed reproductions & 3D objects
  // (a record whose denomination is ONLY a reproduction/3d, with no original-art token)
  const ORIGINAL = /planche|dessin|illustration|\bstrip\b|storyboard|découpage|decoupage|étude|etude|croquis|esquisse|aquarelle|gouache|mise en couleur|sélection couleur|selection couleur|caricature|vignette|crayonné|crayonne|encrage|lavis|pastel|fusain|maquette|projet|carton/;
  const PRINT = /affiche|sérigraphie|serigraphie|estampe|lithographie|gravure|épreuve|epreuve|tirage|sérigraph|linogravure|eau-forte|xylographie/;
  const REPRO_ONLY = /^(?:imprimé|imprime|coupure de presse|fascicule|livre|revue|magazine|album|périodique|periodique|photographie|carte postale|affiche imprimée)[ ,]*$/;
  const OBJECT3D = /sculpture|statuette|figurine|objet|moulage|médaille|medaille|jeu\b|jouet|costume|maquette en volume|céramique|ceramique/;

  if (REPRO_ONLY.test(den.trim())) return null;
  if (OBJECT3D.test(den) && !ORIGINAL.test(den)) return null;

  // original flat art (most of the collection)
  if (ORIGINAL.test(all)) {
    if (/collage|maquette|projet|carton/.test(all) && !/planche|dessin|illustration/.test(den)) return 'mixed_media_2d';
    return 'drawing';
  }
  // comic-related posters / prints
  if (PRINT.test(all)) return 'print';

  // pure 'imprimé' / press-clipping reproductions → excluded
  if (/imprimé|imprime|coupure de presse|fascicule/.test(den)) return null;

  return null; // unknown → conservative exclude
}

// ---------- listing record → ARMIN candidate ----------
function parseRecord(it) {
  const title = stripHtml(it.title) || stripHtml(it.appellation) || stripHtml(it.vernacularName);
  const artist = (it.author || '').trim();              // source format e.g. "Poïvet Raymond, Lecureux Roger"
  const { dateStr, year } = parseDate(it);
  const technical = unphp(it.technical).join(', ');
  const material = (it.material || '').trim();
  const medium = technical || material;                 // prefer technique; else support material
  const dimensions = (it.formDimensions || '').trim();
  const description = stripHtml(it.description);
  const objectNumber = (it.inventoryNumber || '').trim();
  const category = classify(it);

  // image: /media/synchro/{sid}/image250.jpeg → image1000.jpeg
  const img = it.image || '';
  const hasImg = img && !/image-not-found/i.test(img);
  const imgUrl = hasImg ? `${ORIGIN}${img.replace(/image\d+\.(jpe?g|png)$/i, 'image1000.jpeg')}` : null;

  return {
    id: `${SLUG}-${it.id}`, rawId: String(it.id), title, artist, year, dateStr,
    medium, material, dimensions, description, objectNumber, category, imgUrl,
    sourceUrl: `${ORIGIN}/collections/oeuvre/${it.id}`,
  };
}

// ---------- fetch one search page (with retry) ----------
async function fetchPage(page) {
  const url = `${API}?advancedSearch=1&museums=${MUSEUM_CODE}&page=${page}`;
  for (let att = 1; att <= 4; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ct = r.headers.get('content-type') || '';
      if (!ct.includes('json')) throw new Error(`non-json ${ct}`);
      return await r.json();
    } catch (e) { if (att === 4) throw e; await sleep(800 * att); }
  }
}

// ---------- image: download image1000, size-gate ≥600px, autocrop, upload R2 ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: ORIGIN } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 4000) throw new Error(`tiny ${buf.length}b`);
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
  const sharp = (await import('sharp')).default;
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(src);          // webp(2048/q85); white-trim only when full
  const hash8 = sha(a.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (min-4 guard: title, artist, year, category) ----------
function toArtwork(a, imageUrl) {
  if (!a.title || !a.artist || a.year == null || !a.category) return null;
  return {
    id: a.id,
    objectNumber: a.objectNumber,
    title: a.title,
    artist: a.artist,
    date: a.dateStr || String(a.year),
    year: a.year,
    medium: a.medium,
    dimensions: a.dimensions,
    category: a.category,
    description: a.description || '',
    imageUrl,
    thumbnailUrl: a.imgUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: { alienor_id: a.rawId, museum_code: MUSEUM_CODE, support: a.material },
    original_imageUrl: a.imgUrl,
  };
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Cité internationale de la bande dessinée et de l’image — Musée de la bande dessinée',
    collection: 'Original comic art (planches originales)',
    website: 'https://www.alienor.org/musees/angouleme/24-musee-de-la-bande-dessinee-d-angouleme',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'api',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  let json = JSON.stringify(payload, null, 2);
  if (Buffer.byteLength(json) > MAX_JSON_BYTES) {
    console.log(`[write] JSON ${(Buffer.byteLength(json) / 1e6).toFixed(1)}MB > cap — minifying`);
    json = JSON.stringify(payload);
  }
  fs.writeFileSync(out, json);
  console.log(`[write] ${out} (${artworks.length} works, ${(Buffer.byteLength(json) / 1e6).toFixed(1)}MB) breakdown=`, cats);
  return out;
}

// ---------- progress (resumable --full) ----------
function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { return { lastPage: 0, doneIds: [], artworks: [] }; }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS, JSON.stringify(p)); }

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const first = await fetchPage(1);
  const last = first.last;
  const total = first.nbResults;
  console.log(`[fetch] museum ${MUSEUM_CODE}: nbResults=${total}, pages=${last}`);

  // gather all candidate records across pages (cheap JSON; metadata complete in listing)
  const pageData = { 1: first };
  if (MODE === 'classify') {
    // full classification tally
    let withImg = 0, noImg = 0, inScope = 0, inScopeImg = 0;
    const tally = {};
    for (let p = 1; p <= last; p++) {
      const d = p === 1 ? first : await fetchPage(p);
      if (p !== 1) await sleep(250);
      for (const it of d.results) {
        const a = parseRecord(it);
        if (a.imgUrl) withImg++; else noImg++;
        if (a.category) { inScope++; if (a.imgUrl) { inScopeImg++; tally[a.category] = (tally[a.category] || 0) + 1; } }
      }
      if (p % 25 === 0) console.log(`  …scanned page ${p}/${last}`);
    }
    console.log(`\n[classify] total=${total} withImage=${withImg} noImage=${noImg}`);
    console.log(`[classify] in-scope=${inScope} | in-scope WITH image=${inScopeImg}`);
    console.log('[classify] in-scope(image) category breakdown:', tally);
    console.log('[classify] NOTE: ~32% of imaged records are old 360px thumbs (skipped by the ≥600px size gate at scrape time) → ~68% collectible.');
    return;
  }

  // probe / full: build candidate list (in-scope + has image), prioritising named-artist & dated.
  // PROBE samples pages spread across the whole collection (the newest pages are image-less or
  // hold old 360px thumbs; good ≥600px works live throughout the older pages) so the size gate
  // is exercised on real full-size images. FULL walks every page in order (resumable).
  const candidates = [];
  const pagesToVisit = MODE === 'probe'
    ? Array.from(new Set([1, 2, ...Array.from({ length: 14 }, (_, i) => Math.min(last, 8 + i * Math.max(1, Math.floor(last / 14)))) ])).sort((a, b) => a - b)
    : Array.from({ length: last }, (_, i) => i + 1);
  for (const p of pagesToVisit) {
    const d = pageData[p] || (await fetchPage(p));
    if (p !== 1) await sleep(250);
    for (const it of d.results) {
      const a = parseRecord(it);
      if (a.category && a.imgUrl && a.title && a.artist && a.year != null) candidates.push(a);
    }
    if (MODE === 'probe' && candidates.length >= PROBE_TARGET * 4) break;
  }
  console.log(`[${MODE}] candidate in-scope records gathered: ${candidates.length}`);

  // resumable state (full only)
  const prog = MODE === 'full' ? loadProgress() : { doneIds: [], artworks: [] };
  const done = new Set(prog.doneIds);
  const artworks = prog.artworks || [];
  // PROBE: ~32% of imaged works are old 360px thumbs (skipped by the size gate), so over-feed
  // the worker pool and stop once PROBE_TARGET full-size works are collected.
  let target = candidates.filter((a) => !done.has(a.id));
  if (MODE === 'probe') target = target.slice(0, PROBE_TARGET * 4);
  console.log(`[${MODE}] to process: ${target.length} (already done ${done.size})`);

  let processed = 0, imgErr = 0, sizeSkip = 0, min4 = 0;
  const CONC = MODE === 'probe' ? 3 : 4;
  let idx = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < target.length) {
      if (MODE === 'probe' && artworks.length >= PROBE_TARGET) break;
      const a = target[idx++];
      try {
        const { imageUrl } = await processImage(a);
        const w = toArtwork(a, imageUrl);
        if (w) { artworks.push(w); done.add(a.id); }
        else { min4++; }
      } catch (e) {
        const msg = String(e.message || e);
        if (/^thumb /.test(msg)) sizeSkip++;
        else { imgErr++; fs.appendFileSync(FAILED, JSON.stringify({ id: a.id, url: a.imgUrl, err: msg }) + '\n'); }
        if (imgErr <= 5 && !/^thumb /.test(msg)) console.log(`  img err id=${a.id}: ${msg}`);
      }
      processed++;
      if (MODE === 'full' && processed % 100 === 0) {
        prog.doneIds = [...done]; prog.artworks = artworks; saveProgress(prog);
        console.log(`  …${processed}/${target.length} (ok ${artworks.length}, sizeSkip ${sizeSkip}, imgErr ${imgErr})`);
      }
    }
  }));

  if (MODE === 'full') { prog.doneIds = [...done]; prog.artworks = artworks; saveProgress(prog); }
  artworks.sort((x, y) => Number(x.metadata?.alienor_id || 0) - Number(y.metadata?.alienor_id || 0));
  const stem = MODE === 'probe' ? `${COLLECTION_STEM}-probe` : COLLECTION_STEM;
  writeCollection(artworks, stem);
  console.log(`\n[${MODE}] DONE. collected ${artworks.length} | sizeSkip(<600px) ${sizeSkip} | imgErr ${imgErr} | min4-drop ${min4}`);
  if (MODE === 'probe') {
    const s = artworks.slice(0, 5).map((w) => `${w.id} | ${w.artist} — ${w.title.slice(0, 32)} | ${w.date} | ${w.category}`);
    console.log('[probe] sample:\n  ' + s.join('\n  '));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
