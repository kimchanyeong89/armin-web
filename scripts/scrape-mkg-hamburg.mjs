#!/usr/bin/env node
// MKG — Museum für Kunst und Gewerbe Hamburg (Hamburg, Germany) — full collection scraper.
// GENRE: 제품·산업디자인 / 디자인 (design, poster, graphic design, photography, prints, drawings)
//        — FLAT works only. The applied-arts museum's 3D holdings (furniture, vessels, sword fittings,
//        ceramics, instruments) are EXCLUDED; we keep only flat works on paper / photographs / posters.
//
// LICENSE: MKG famously released its online collection as OPEN DATA. Every in-scope object carries
//   "Public Domain" (Public Domain Mark / CC0) on its detail page (computed-licence-type). We record it.
//
// Source: museum-OWN Drupal "Sammlung Online" (outermedia om_search backend), no auth, no key.
//   The grid is driven by a Search API endpoint, but the plain no-JS LIST page already renders the same
//   24 result cards server-side (each card carries data-result-id + data-result-url with ?position=N),
//   so we enumerate from the list page — simplest, fully paginated, no JS needed:
//
//   1) LISTING (per in-scope work_type, paginated by start, stride 24):
//        GET /sammlung/online?filter[work_type][0]={TYPE}&start={M}
//        → result cards: <... data-result-id="{ID}" data-result-url="/sammlung/objekt/{slug}/{objNo}/{ID}?...position=N">
//        ID has TWO schemes that both resolve at /object/{ID}:  "dc00037276" (photo/old) and "mkg-e00210944" (new).
//        The "{N} Ergebnisse" header gives the per-type total; positions 0..23 prove contiguous full coverage.
//
//   2) DETAIL (metadata — DETAIL-PAGE COMPLETE, every field parsed from the rendered Drupal fields):
//        GET /object/{ID}
//        → <h1> title; field--name-field-work-type (Objektart), field-creators, field-technique-terms (Technik),
//          field-material-terms (Material), field-measurements (Maße), field-inventory-number (Inventarnummer),
//          field-collection (Sammlung), computed-licence-type (Public Domain),
//          computed-creation-events / "Herstellung YYYY" (year), field-places, field-iconography-terms.
//
//   3) IMAGE (full original, no token, ~1200px long edge — the museum's web-release size, ≥600px guaranteed):
//        computed-lightbox-image href → /sites/default/files/externals/{a}/{b}/{hash}.jpg
//        (the styled webp derivative collection_object_desktop also exists but the original .jpg is cleaner).
//
// SCOPE (FLAT visual works only) — driven by work_type. In-scope German work-type terms (IN_SCOPE_TYPES):
//   Photographs: Fotografie (14,449), Stereofotografie (188), Fotogramm
//   Posters:     Plakat (698)
//   Prints:      Holzschnitt (1,287), Ornamentstich (1,302), Lichtdruck (153), Druckgrafik (222),
//                Grafik (20), Einzelblatt (78), Radierung, Kupferstich, Lithografie, Heliogravüre
//   Drawings:    Zeichnung (694), Skizze (401), Entwurfszeichnung (198), Tuschzeichnung (21)
//   Graphic/flat design on paper: Schablone (3,173 — katagami textile stencils, flat works on paper),
//                Postkarte (83), Mappenwerk (39), Skizzenbuch (23), Exlibris, Einladungskarte
//   ≈ 23,000 flat in-scope works (of 24,784 with-image / 27,716 total). EXCLUDED: all 3D object types
//   (Tsuba, Stuhl, Gefäß, Vase, Skulptur, Figur, …). Photographs & drawings are NEVER colour-gated.
//
//   >23k in-scope → COMPACT JSON + prioritize named+dated; cap output under 23MB (see CAP_BYTES).
//
// Usage:
//   node scripts/scrape-mkg-hamburg.mjs --classify   # dry-run: per-type totals from the list headers (no images)
//   node scripts/scrape-mkg-hamburg.mjs --probe       # build ~20 in-scope end-to-end + R2 upload
//   node scripts/scrape-mkg-hamburg.mjs --full        # full in-scope scrape + R2, resumable

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

const SLUG = 'mkg-hamburg';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://www.mkg-hamburg.de';
const LIST = (type, start) =>
  `${BASE}/sammlung/online?filter%5Bwork_type%5D%5B0%5D=${encodeURIComponent(type)}&start=${start}`;
const DETAIL = (id) => `${BASE}/object/${id}`;
const SOURCE_URL = (id) => `${BASE}/object/${id}`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 armin-museum-research/1.0';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--probe') ? 'probe' : 'classify';
const PROBE_TARGET = 20;
const STRIDE = 24;                   // list page renders 24 result cards (positions 0..23) per page
const CONC = 4;                      // detail+image fetch/upload concurrency (be gentle on the museum)
const LIST_DELAY = 250;              // ms between list-page fetches
const CAP_BYTES = 23 * 1024 * 1024;  // hard JSON size cap (postbuild drops >25MB files)

// FLAT in-scope work_type values (exact German facet labels from work_type_facet).
// Ordered so the probe & the cap keep the most visual/representative types first.
const IN_SCOPE_TYPES = [
  // photographs
  'Fotografie', 'Stereofotografie', 'Fotogramm',
  // posters
  'Plakat',
  // prints
  'Holzschnitt', 'Ornamentstich', 'Lichtdruck', 'Druckgrafik', 'Grafik', 'Einzelblatt',
  'Radierung', 'Kupferstich', 'Lithografie', 'Heliogravüre',
  // drawings
  'Zeichnung', 'Skizze', 'Entwurfszeichnung', 'Tuschzeichnung',
  // flat graphic/design works on paper
  'Schablone', 'Postkarte', 'Mappenwerk', 'Skizzenbuch', 'Exlibris', 'Einladungskarte',
];

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function decode(s) {
  return (s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&bdquo;/g, '„').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const stripTags = (s) => decode((s || '').replace(/<[^>]+>/g, ' '));

// ---------- HTTP ----------
async function getText(url) {
  for (let att = 1; att <= 4; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'de,en' } });
      if (r.status === 429) { await sleep(2000 * att); continue; }
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { if (att === 4) throw new Error(`${url}: ${e.message}`); await sleep(700 * att); }
  }
}

async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) { if (att === 3) throw e; await sleep(500 * att); }
  }
}

// ---------- listing ----------
// Parse one list page → [{ id, objNo, slug }] (the result cards) and the per-type total.
function parseList(html) {
  if (!html) return { items: [], total: 0 };
  const totalM = html.match(/([\d.]+)\s+Ergebnisse/);
  const total = totalM ? parseInt(totalM[1].replace(/\./g, ''), 10) : 0;
  const items = [];
  const seen = new Set();
  // each card: data-result-id="{ID}" ... data-result-url="/.../{objNo}/{ID}?...position=N"
  const re = /data-result-id="([^"]+)"[\s\S]{0,400}?data-result-url="(\/[^"]+?)"/g;
  let m;
  while ((m = re.exec(html))) {
    const id = decode(m[1]);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const url = decode(m[2]);
    // url: /sammlung/objekt/{slug}/{objNo}/{ID}?...  (objNo absent when ID truncated to "mkg")
    const um = url.match(/\/(?:object|sammlung\/objekt)\/([^/?]+)\/([^/?]+)\/([^/?]+)/);
    const slug = um ? um[1] : '';
    const objNo = um ? um[2] : '';
    items.push({ id, slug, objNo });
  }
  return { items, total };
}

// Enumerate every in-scope id for a work_type (paginate until a page yields no cards / past total).
async function enumerateType(type, { max = Infinity } = {}) {
  const out = [];
  const seen = new Set();
  let start = 0;
  let total = 0;
  for (;;) {
    const html = await getText(LIST(type, start));
    const { items, total: t } = parseList(html);
    if (t) total = t;
    if (!items.length) break;
    let added = 0;
    for (const it of items) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      out.push({ ...it, workType: type });
      added++;
      if (out.length >= max) return { items: out, total };
    }
    start += STRIDE;
    if (added === 0) break;                  // safety: no new ids
    if (total && start >= total + STRIDE) break;
    if (start > 60000) break;                // hard ceiling
    await sleep(LIST_DELAY);
  }
  return { items: out, total };
}

// ---------- detail parse ----------
// Each Drupal field renders as:
//   <div class="field field--name-{name} ..."><div class="field__label">Label</div>
//     <div class="field__item">VALUE</div>[<div class="field__item">VALUE2</div>…]</div>
// We locate the field, then read its field__item div(s). Multi-value fields (creators) → joined by "; ".
function fieldBlock(html, name, join = '; ', firstOnly = false) {
  const start = html.indexOf('field--name-' + name);
  if (start < 0) return '';
  // window from this field to the next field--name- (or +1200 chars) — items live inside this slice
  let end = html.indexOf('field--name-', start + 12);
  if (end < 0 || end - start > 1600) end = Math.min(html.length, start + 1600);
  const slice = html.slice(start, end);
  const items = [...slice.matchAll(/field__item[^>]*>([\s\S]*?)<\/div>/g)].map((m) => stripTags(m[1])).filter(Boolean);
  if (items.length) return firstOnly ? items[0] : items.join(join);
  // some computed fields have no field__item wrapper (label-hidden, value is a bare <a> after the open div)
  const open = slice.match(/field--name-[a-z0-9-]+[^>]*>([\s\S]*)/);
  if (open) {
    let v = stripTags(open[1]);
    v = v.replace(/^\s*(?:Objektart|Technik|Material|Maße|Inventarnummer|Sammlung|Epoche\/Stil|Tags)\s+/i, '');
    return v.trim();
  }
  return '';
}

function parseYear(creationText, dateText) {
  const blob = `${creationText} ${dateText}`;
  // 1) explicit 4-digit year (prefer the earliest = creation/Entwurf)
  const years = [...blob.matchAll(/\b(1[0-9]{3}|20[0-2][0-9])\b/g)].map((m) => parseInt(m[1], 10));
  if (years.length) return Math.min(...years);
  // 2) "19. Jahrhundert" / "frühes 18. Jh." → century start (best available estimate)
  const cm = blob.match(/(\d{1,2})\s*\.\s*(?:Jahrhundert|Jh\.?)/);
  if (cm) return (parseInt(cm[1], 10) - 1) * 100; // 19. Jh → 1800
  return null;
}

// map an MKG work_type (+ technique) to the ARMIN category enum
function categoryOf(workType, technique) {
  const wt = (workType || '').toLowerCase();
  const tq = (technique || '').toLowerCase();
  if (/fotograf|fotogramm|lichtbild|daguerreotyp|stereofoto/.test(wt)) return 'photograph';
  if (/plakat/.test(wt)) return 'print';                 // posters → print (flat graphic multiple)
  if (/zeichnung|skizze|entwurf|aquarell|gouache|pastell|tusch/.test(wt)) return 'drawing';
  if (/holzschnitt|ornamentstich|lichtdruck|druckgrafik|^grafik|radierung|kupferstich|lithograf|heliogravüre|stich|gravüre|einzelblatt|exlibris/.test(wt))
    return 'print';
  // technique-based fallback for graphic terms
  if (/lithograf|radier|kupferstich|holzschnitt|heliogravüre|lichtdruck|offsetdruck|siebdruck/.test(tq)) return 'print';
  if (/feder|tusche|bleistift|kohle|kreide|aquarell|gouache|pastell|gezeichnet/.test(tq)) return 'drawing';
  // Schablone (katagami stencils), Postkarte, Mappenwerk, Skizzenbuch, Einladungskarte → flat works on paper
  if (/schablone|postkarte|mappenwerk|skizzenbuch|einladungskarte/.test(wt)) return 'print';
  return 'print'; // all IN_SCOPE_TYPES are flat → safe default
}

// detail page → pre-image artwork record (returns null if not in scope / no image)
function parseDetail(html, base) {
  if (!html) return null;
  // <h1 ...><div class="field field--name-title ...">TITLE</div></h1>
  const t = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const title = t ? stripTags(t[1]) : '';

  // field__item extraction already drops the sibling <div class="field__label"> (Objektart/Technik/…)
  const workType = fieldBlock(html, 'field-work-type');
  const technique = fieldBlock(html, 'field-technique-terms', ', ');
  const material = fieldBlock(html, 'field-material-terms', ', ');
  const measurements = fieldBlock(html, 'field-measurements', '; ');
  // inventory: the first field__item is the accession no; later items are donor/collection provenance — drop them
  const inventory = fieldBlock(html, "field-inventory-number", "", true).replace(/\s+Sammlung.*$/i, "").trim();
  const collection = fieldBlock(html, 'field-collection');
  const licence = fieldBlock(html, 'computed-licence-type').replace(/\s*Tags.*$/i, '').trim();
  const creators = fieldBlock(html, 'field-creators', '; ');

  // creation events block (Entwurf/Herstellung YYYY or "19. Jahrhundert")
  const ce = html.match(/field--name-(?:computed-creation-events|field-creation-events)\b([\s\S]*?)(?:Das Objekt|field--name-field-collection|field--name-computed)/);
  const creationText = ce ? stripTags(ce[1]) : '';

  // image: lightbox original → /sites/default/files/externals/{a}/{b}/{hash}.jpg
  let imgPath = null;
  const lb = html.match(/computed-lightbox-image[\s\S]*?(?:href|src|data-src)="([^"]+externals\/[^"]+?\.jpg)"/);
  if (lb) imgPath = decode(lb[1]);
  if (!imgPath) {
    const any = html.match(/(?:href|src)="(\/sites\/default\/files\/externals\/[a-z0-9]\/[a-z0-9]\/[a-f0-9]+\.jpg)"/);
    if (any) imgPath = any[1];
  }
  if (!imgPath) return null; // no downloadable original image (placeholder only)
  if (!/^https?:/.test(imgPath)) imgPath = BASE + imgPath;

  const year = parseYear(creationText, measurements);
  const category = categoryOf(workType, technique);
  // combine technique + material into a medium string
  const medium = [technique, material].filter(Boolean).join(', ');

  return {
    id: base.id,
    objectNumber: inventory || base.objNo || '',
    title,
    artist: creators,
    year,
    dateStr: creationText.replace(/^(Entwurf|Herstellung)\s*/, '').slice(0, 80),
    medium,
    dimensions: measurements,
    category,
    workType,
    collection,
    licence,
    imgUrl: imgPath,
    sourceUrl: SOURCE_URL(base.id),
  };
}

async function fetchDetail(base) {
  const html = await getText(DETAIL(base.id));
  return parseDetail(html, base);
}

// ---------- image → R2 ----------
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
  if (meta.width && meta.height && Math.max(meta.width, meta.height) < 600)
    throw new Error(`thumb ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(src); // webp(2048/q85), no trim by default
  const hash8 = sha(a.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (min-4 guard) — COMPACT shape ----------
function toArtwork(a, imageUrl) {
  if (!a.title || !a.artist || a.year == null || !a.category) return null; // min-4 → drop
  return {
    id: a.id,
    objectNumber: a.objectNumber || '',
    title: a.title,
    artist: a.artist,
    date: a.dateStr || String(a.year),
    year: a.year,
    medium: a.medium || '',
    dimensions: a.dimensions || '',
    category: a.category,
    description: '',
    imageUrl,
    thumbnailUrl: a.imgUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: {
      work_type: a.workType || '',
      collection: a.collection || '',
      licence: a.licence || '',
    },
    original_imageUrl: a.imgUrl,
  };
}

function writeCollection(artworks, stem, compact) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Museum für Kunst und Gewerbe Hamburg (MKG)',
    collection: 'Design, Posters, Photography & Graphic Arts',
    website: 'https://www.mkg-hamburg.de/sammlung/online',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'html',
    license: 'Public Domain (CC0 / Public Domain Mark) — MKG open data',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, compact ? JSON.stringify(payload) : JSON.stringify(payload, null, 2));
  const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
  console.log(`[write] ${out} (${artworks.length} works, ${mb} MB) breakdown=`, cats);
  return out;
}

// prioritize named + dated works when capping a huge corpus
function priorityScore(a) {
  let s = 0;
  if (a.artist && !/^(anonym|unbekannt|ohne|n\.\s?n\.)/i.test(a.artist)) s += 2;
  if (a.year != null) s += 1;
  if (a.dimensions) s += 1;
  if (a.medium) s += 1;
  return s;
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });

  if (MODE === 'classify') {
    // pull just the first list page per type → per-type total from the "{N} Ergebnisse" header
    let grand = 0;
    const rows = [];
    for (const type of IN_SCOPE_TYPES) {
      const html = await getText(LIST(type, 0));
      const { total } = parseList(html);
      rows.push([type, total]);
      grand += total;
      await sleep(LIST_DELAY);
    }
    rows.sort((a, b) => b[1] - a[1]);
    console.log('\n[classify] in-scope FLAT work types (with-image totals):');
    for (const [t, n] of rows) console.log('   ' + String(n).padStart(6) + '  ' + t);
    console.log('[classify] GRAND TOTAL in-scope (sum, pre-dedup across types):', grand);
    return;
  }

  // probe / full: enumerate in-scope ids. In probe mode cap per type small so the sample spans
  // many work types (photo + poster + print + drawing + stencil), not 40× Fotografie.
  const perTypeMax = MODE === 'probe' ? 4 : Infinity;
  const bases = [];
  const seenIds = new Set();
  for (const type of IN_SCOPE_TYPES) {
    const { items, total } = await enumerateType(type, { max: perTypeMax });
    let added = 0;
    for (const it of items) { if (!seenIds.has(it.id)) { seenIds.add(it.id); bases.push(it); added++; } }
    if (MODE === 'full') console.log(`[enum] ${type}: total=${total}, collected=${added} (running ${bases.length})`);
    if (MODE === 'probe' && bases.length >= PROBE_TARGET * 2) break;
  }
  console.log(`[${MODE}] enumerated in-scope ids: ${bases.length}`);

  // resumable (full): skip already-done ids
  let doneIds = new Set();
  if (MODE === 'full' && fs.existsSync(PROGRESS)) {
    try { doneIds = new Set(JSON.parse(fs.readFileSync(PROGRESS, 'utf8')).doneIds || []); } catch {}
    console.log(`[full] resuming: ${doneIds.size} ids already processed`);
  }

  const artworks = [];
  let done = 0, metaErr = 0, imgErr = 0, drop4 = 0, noImg = 0, bytesEst = 0;
  let idx = 0, capped = false;
  const persist = () => { if (MODE === 'full') fs.writeFileSync(PROGRESS, JSON.stringify({ doneIds: [...doneIds] })); };

  // probe wants a representative, named+dated sample: pre-fetch a wider slice then prioritize.
  const worklist = bases;

  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < worklist.length && !capped) {
      const base = worklist[idx++];
      if (doneIds.has(base.id)) continue;
      try {
        const a = await fetchDetail(base);
        if (!a) { noImg++; doneIds.add(base.id); continue; }
        try {
          const { imageUrl } = await processImage(a);
          const w = toArtwork(a, imageUrl);
          if (w) {
            artworks.push(w);
            bytesEst += JSON.stringify(w).length + 2;
            if (MODE === 'full' && bytesEst > CAP_BYTES) { capped = true; console.log(`[full] hit size cap (~${(bytesEst / 1024 / 1024).toFixed(1)}MB) at ${artworks.length} works`); }
          } else drop4++;
          doneIds.add(base.id);
        } catch (e) {
          imgErr++;
          fs.appendFileSync(FAILED, JSON.stringify({ id: base.id, url: a.imgUrl, err: String(e.message || e) }) + '\n');
          if (imgErr <= 8) console.log(`  img err id=${base.id}: ${e.message}`);
        }
      } catch (e) {
        metaErr++;
        fs.appendFileSync(FAILED, JSON.stringify({ id: base.id, err: 'meta:' + String(e.message || e) }) + '\n');
        if (metaErr <= 8) console.log(`  meta err id=${base.id}: ${e.message}`);
      }
      if (++done % 100 === 0) { console.log(`  …${done}/${worklist.length} (ok ${artworks.length}, noImg ${noImg}, imgErr ${imgErr}, drop4 ${drop4}, ~${(bytesEst / 1024 / 1024).toFixed(1)}MB)`); persist(); }
      await sleep(60);
    }
  }));
  persist();

  if (MODE === 'probe') {
    artworks.sort((x, y) => priorityScore(y) - priorityScore(x));
    artworks.length = Math.min(artworks.length, PROBE_TARGET);
  }
  artworks.sort((x, y) => String(x.id).localeCompare(String(y.id)));

  const stem = MODE === 'probe' ? `${COLLECTION_STEM}-probe` : COLLECTION_STEM;
  writeCollection(artworks, stem, /*compact*/ MODE === 'full');
  console.log(`\n[${MODE}] DONE. collected ${artworks.length} | noImg ${noImg} | imgErr ${imgErr} | metaErr ${metaErr} | min4-drops ${drop4}`);
  if (MODE === 'probe') {
    const sample = artworks.slice(0, 6).map((w) => ({ id: w.id, cat: w.category, wt: w.metadata.work_type, title: w.title.slice(0, 36), artist: w.artist.slice(0, 28), year: w.year, lic: w.metadata.licence, img: w.imageUrl }));
    console.log('[probe] sample:', JSON.stringify(sample, null, 2));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
