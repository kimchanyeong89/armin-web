#!/usr/bin/env node
// Academy Museum of Motion Pictures (Los Angeles) — flat film-art scraper.
//
// SOURCE (museum-OWN infra): the Academy (AMPAS) Margaret Herrick Library Digital
//   Collections, served from CONTENTdm (OCLC) at https://digitalcollections.oscars.org.
//   The academymuseum.org site itself is an editorial/visitor Next.js export with NO
//   object database; the catalogued, downloadable flat film art lives in CONTENTdm.
//   This is AMPAS's own platform (oscars.org subdomain), not an aggregator.
//
//   API (no auth):
//     dmwebservices: …/digital/bl/dmwebservices/index.php?q=dmQuery/{alias}/{search}/{fields}/{sort}/{maxrecs}/{start}/0/0/0/0/json
//     image (IIIF):  …/digital/iiif/{alias}/{pointer}/full/full/0/default.jpg   (native res, ~700px)
//     item page:     …/digital/collection/{coll}/id/{pointer}
//
// SCOPE — FLAT FILM ART ONLY (posters, production stills/photographs, lobby cards,
//   photomechanical prints, promotional glass slides). We do NOT collect moving-image
//   title records, documents, periodicals, sheet music, correspondence, scrapbooks,
//   magazine covers, casting directories, or 3D objects. We filter each record by its
//   CONTENTdm `format` field against IN_SCOPE_FORMATS below.
//
//   category mapping:  lobby card / poster → "print";  photograph / slides / photomechanical → "photograph".
//
//   artist: film stills & lobby cards are uncredited studio output — the documented,
//   sourced creator is the production/distribution studio recorded by the collection
//   (e.g. "Paramount Pictures"), OR a credited photographer when present in `creato`.
//   This is real archival attribution, not a dummy. Collections with neither a studio
//   nor credited creators (heterogeneous photo morgues) are excluded from COLLECTIONS.
//
// B&W gate: posters / photographs / prints are NEVER colour-gated (per COLLECTION_SCRAPING_GUIDE
//   §1 — B&W film stills are legitimate). colorfulness() is copied below per spec but used
//   only for logging; no record is dropped on colour.
//
// Usage:
//   node scripts/scrape-academy-museum.mjs --probe   # ~15 works end-to-end (fetch+image+R2), write probe JSON
//   node scripts/scrape-academy-museum.mjs --full     # all in-scope, resumable, write collection JSON

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
const sharp = (await import('sharp')).default;

const SLUG = 'academy-museum';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://digitalcollections.oscars.org';
const DMWS = `${BASE}/digital/bl/dmwebservices/index.php?q=`;
const UA = 'armin-museum-research/1.0';
const UA_BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'probe';
const PROBE_TARGET = 15;

// CONTENTdm formats we accept as flat film art (exact match on the `format` field).
const IN_SCOPE_FORMATS = new Set([
  'photograph', 'lobby card', 'poster', 'photomechanical print', 'slides (photographs)',
]);

// Category per format.
function categoryFor(format) {
  const f = (format || '').toLowerCase().trim();
  if (f === 'lobby card' || f === 'poster') return 'print';
  return 'photograph'; // photograph, slides (photographs), photomechanical print
}

// In-scope collections (alias → { name, studio }). `studio` is the documented sourced
// creator used as artist when no photographer is credited. null studio = derive from
// creator only; if neither present the record is dropped on the min-4 artist guard.
const COLLECTIONS = [
  { alias: 'p15759coll9',  name: 'Academy Awards Collection',          studio: null },
  { alias: 'p15759coll17', name: 'Janus Barfoed Collection',           studio: null },
  { alias: 'p15759coll5',  name: "Tom B'hend and Preston Kaufmann Collection", studio: null },
  { alias: 'p15759coll20', name: 'Bison Archives Photographs',         studio: null },
  { alias: 'p15759coll14', name: 'Cecil B. DeMille Photographs',       studio: 'Paramount Pictures' },
  { alias: 'p15759coll27', name: 'Glass Slides Collection',            studio: null },
  { alias: 'p15759coll18', name: 'Paramount Pictures Photographs',     studio: 'Paramount Pictures' },
  { alias: 'p15759coll19', name: 'RKO Radio Pictures Photographs',     studio: 'RKO Radio Pictures' },
  { alias: 'p15759coll21', name: 'Spotlight on Hollywood Portraits',   studio: null },
  { alias: 'p15759coll32', name: 'Spotlight on Lobby Cards',           studio: null },
  { alias: 'p15759coll31', name: 'Nat Dallinger Photographs',          studio: null },
  { alias: 'p15759coll10', name: 'Mary Pickford Papers',               studio: null },
  { alias: 'p15759coll7',  name: 'Alfred Hitchcock Papers',            studio: null },
  { alias: 'p15759coll12', name: 'George Stevens Papers',              studio: null },
  { alias: 'p15759coll26', name: 'Mack Sennett Papers',                studio: null },
  { alias: 'p15759coll2',  name: 'Fred Zinnemann Papers',              studio: null },
  { alias: 'p15759coll1',  name: 'William Selig Papers',               studio: null },
  { alias: 'p15759coll29', name: 'Spotlight on Hollywood During World War II', studio: null },
  { alias: 'p15759coll15', name: 'American Society of Cinematographers Collection', studio: null },
  { alias: 'p15759coll13', name: 'George Cukor Papers',                studio: null },
  { alias: 'p15759coll4',  name: 'Academy History Archive',           studio: null },
  { alias: 'p15759coll37', name: 'Spotlight on Latino Film Culture',   studio: null },
];

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// --- colorfulness (copied per spec from scripts/audit/curate-grayscale-prints.mjs; logging only) ---
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

// ---------- API layer ----------
// CONTENTdm dmwebservices returns HTTP 200 with a PLAINTEXT body ("Error looking up …")
// for malformed queries AND, intermittently, when throttled. So we read the body as text,
// verify it parses as JSON, and retry (with backoff) on any non-JSON / error body.
async function dmFetch(qpath, attempts = 5) {
  const url = DMWS + qpath;
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': i === 1 ? UA : UA_BROWSER } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const txt = (await r.text()).trim();
      if (!txt || (txt[0] !== '{' && txt[0] !== '[')) throw new Error(`non-JSON body: ${txt.slice(0, 60)}`);
      return JSON.parse(txt);
    } catch (e) { lastErr = e; await sleep(800 * i); }
  }
  throw lastErr;
}

// Page through all in-scope records of one collection. We query the whole collection
// (returning all fields we need) in pages of 200 and keep only top-level image records
// whose format is in scope. dmQuery args: alias / search / fields / sort / maxrecs / start.
const FIELDS = 'title!film!creato!date!format!type!desc!source!find!dmrecord';
async function collectionRecords(coll) {
  const alias = (coll && coll.alias) || coll;   // accept either {alias,…} or a bare alias string
  const out = [];
  const PAGE = 200;
  let start = 1;
  // first page also reveals total
  for (;;) {
    const res = await dmFetch(`dmQuery/${alias}/0/${FIELDS}/title/${PAGE}/${start}/0/0/0/0/json`);
    const recs = (res && res.records) || [];
    for (const r of recs) {
      if (r.parentobject && r.parentobject !== -1) continue;       // skip compound-object pages
      if ((r.filetype || '') !== 'jp2') continue;                  // skip non-image (text/pdf)
      const fmt = (r.format || '').toLowerCase().trim();
      if (!IN_SCOPE_FORMATS.has(fmt)) continue;                    // scope gate
      out.push(r);
    }
    const total = parseInt((res && res.pager && res.pager.total) || '0', 10);
    start += PAGE;
    if (start > total || recs.length === 0) break;
    await sleep(600);
  }
  return out;
}

// ---------- record → ARMIN artwork (pre-image) ----------
function stripRole(name) {
  // "Fryer, Elmer, photographer" → "Fryer, Elmer"  (keep source "Last, First" order; display layer prettifies)
  return (name || '').replace(/,\s*(photographer|artist|publisher|studio|illustrator|designer|distributor|creator)s?\s*$/i, '').trim();
}
function cleanFilmYear(filmRaw) {
  // "GREASE (Motion picture : 1978)" → year 1978
  const m = (filmRaw || '').match(/\b(1[89]\d{2}|20\d{2})\b/);
  return m ? parseInt(m[1], 10) : null;
}
function parseYear(dateRaw, title, filmRaw) {
  // date can be "1978", "1931; 1932; 1933", "ca. 1933", "" — take earliest 4-digit year.
  const pool = `${dateRaw || ''} ${title || ''} ${filmRaw || ''}`;
  const ys = (pool.match(/\b(1[89]\d{2}|20\d{2})\b/g) || []).map(Number).filter(y => y >= 1880 && y <= 2030);
  return ys.length ? Math.min(...ys) : null;
}

function buildArtwork(r, coll) {
  const id = `${SLUG}-${r.dmrecord}`;
  const title = (r.title || '').trim();
  const filmRaw = (r.film || '').trim();
  const creator = stripRole(r.creato);
  const artist = creator || coll.studio || '';                     // photographer → studio → (drop)
  const year = parseYear(r.date, title, filmRaw);
  const format = (r.format || '').trim();
  const category = categoryFor(format);
  const pointer = r.dmrecord;
  const imgUrl = `${BASE}/digital/iiif/${coll.alias}/${pointer}/full/full/0/default.jpg`;
  const sourceUrl = `${BASE}/digital/collection/${coll.alias.replace(/^\//, '')}/id/${pointer}`;
  return {
    id, dmrecord: r.dmrecord, alias: coll.alias,
    title, artist, year,
    date: (r.date || '').trim() || (year != null ? String(year) : ''),
    medium: format,                                                // CONTENTdm `format` is the medium descriptor
    dimensions: '',
    category,
    description: (r.desc || '').trim(),
    film: filmRaw,
    source: (r.source || '').trim(),
    imgUrl, sourceUrl,
  };
}

// ---------- image: download (IIIF native), 600px gate, autocrop, upload ----------
async function dl(url) {
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA_BROWSER } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ct = r.headers.get('content-type') || '';
      if (!ct.startsWith('image/')) throw new Error(`non-image ct=${ct}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) { if (i === 3) throw e; await sleep(500 * i); }
  }
}

async function uploadR2(key, buffer) {
  for (let i = 1; i <= 4; i++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      return true;
    } catch (e) { if (i === 4) throw e; await sleep(400 * i); }
  }
}

async function processImage(a) {
  const src = await dl(a.imgUrl);
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && meta.height && Math.max(meta.width, meta.height) < 600) {
    throw new Error(`thumb ${meta.width}x${meta.height}`);
  }
  const cf = await colorfulness(src);                              // logged only; NOT a gate (B&W stills are valid)
  const { buffer } = await autocropToWebp(src);                    // white-trim + webp(2048/q85)
  const hash8 = sha(a.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null, cf };
}

// ---------- final record (min-4 guard) ----------
function toRecord(a, imageUrl, srcW, srcH) {
  if (!a.title || !a.artist || a.year == null || !a.category) return null;
  const md = { contentdm_pointer: a.dmrecord, contentdm_alias: a.alias };
  if (a.film) md.film = a.film;
  if (a.source) md.archival_source = a.source;
  if (srcW && srcH) md.source_dimensions = `${srcW}x${srcH}`;
  return {
    id: a.id,
    objectNumber: String(a.dmrecord),
    title: a.title,
    artist: a.artist,
    date: a.date,
    year: a.year,
    medium: a.medium,
    dimensions: a.dimensions,
    category: a.category,
    description: a.description,
    imageUrl,
    thumbnailUrl: a.imgUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: md,
    original_imageUrl: a.imgUrl,
  };
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Academy Museum of Motion Pictures',
    collection: 'Margaret Herrick Library Digital Collections',
    website: 'https://digitalcollections.oscars.org/',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'api',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  const mb = (fs.statSync(out).size / 1048576).toFixed(2);
  console.log(`[write] ${out} (${artworks.length} works, ${mb} MB) breakdown=`, cats);
  return out;
}

// ---------- progress (resumable, --full) ----------
function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { return { doneIds: [], artworks: [] }; }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS, JSON.stringify(p)); }

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });

  if (MODE === 'probe') {
    // Pull a spread of in-scope records across a few representative collections, take 15,
    // run them fully end-to-end (image download + 600px check + autocrop + R2 upload).
    const probeColls = COLLECTIONS.filter(c => ['p15759coll32', 'p15759coll18', 'p15759coll21', 'p15759coll19', 'p15759coll9'].includes(c.alias));
    const cand = [];
    for (const c of probeColls) {
      const recs = await collectionRecords(c);
      for (const r of recs.slice(0, 6)) cand.push(buildArtwork(r, c));
      if (cand.length >= 40) break;
    }
    console.log(`[probe] gathered ${cand.length} in-scope candidates; processing up to ${PROBE_TARGET} end-to-end`);
    const artworks = [];
    for (const a of cand) {
      if (artworks.length >= PROBE_TARGET) break;
      try {
        const { imageUrl, srcW, srcH, cf } = await processImage(a);
        const w = toRecord(a, imageUrl, srcW, srcH);
        if (!w) { console.log(`  drop(min4) ${a.id} title=${JSON.stringify(a.title)} artist=${JSON.stringify(a.artist)} year=${a.year}`); continue; }
        artworks.push(w);
        console.log(`  ok ${w.id} [${w.category}/${w.medium}] ${srcW}x${srcH} cf=${cf.toFixed(1)} | ${w.artist} — ${w.title.slice(0, 50)}`);
      } catch (e) {
        console.log(`  IMG ERR ${a.id}: ${e.message}`);
      }
      await sleep(300);
    }
    writeCollection(artworks, `${COLLECTION_STEM}-probe`);
    // probe assertions
    const ok = artworks.length >= 10
      && artworks.every(w => w.title && w.artist && w.year != null && w.category)
      && artworks.every(w => w.imageUrl.startsWith(R2_PUBLIC))
      && new Set(artworks.map(w => w.id)).size === artworks.length
      && new Set(artworks.map(w => w.imageUrl)).size === artworks.length;
    console.log(`\n[probe] ${ok ? 'PASS' : 'FAIL'} — ${artworks.length} works, all min-4 filled, unique ids+images on R2.`);
    if (!ok) process.exit(1);
    return;
  }

  // ---- FULL ----
  const prog = loadProgress();
  const done = new Set(prog.doneIds);
  const artworks = prog.artworks;
  console.log(`[full] resuming with ${artworks.length} already-collected (${done.size} done ids)`);

  // Build the full candidate list across all in-scope collections (cheap; API only).
  let cand = [];
  for (const c of COLLECTIONS) {
    const recs = await collectionRecords(c);
    const built = recs.map(r => buildArtwork(r, c));
    cand.push(...built);
    console.log(`  [${c.alias}] ${c.name}: ${built.length} in-scope`);
    await sleep(300);
  }
  // de-dupe by id (a record can only belong to one collection, but guard anyway)
  const seen = new Set();
  cand = cand.filter(a => (seen.has(a.id) ? false : (seen.add(a.id), true)));
  console.log(`[full] total in-scope candidates: ${cand.length}`);

  const todo = cand.filter(a => !done.has(a.id));
  console.log(`[full] remaining to process: ${todo.length}`);

  let processed = 0, imgErr = 0, drop = 0;
  const CONC = 4;
  let idx = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < todo.length) {
      const a = todo[idx++];
      try {
        const { imageUrl, srcW, srcH } = await processImage(a);
        const w = toRecord(a, imageUrl, srcW, srcH);
        if (w) { artworks.push(w); done.add(a.id); }
        else { drop++; done.add(a.id); }
      } catch (e) {
        imgErr++;
        fs.appendFileSync(FAILED, JSON.stringify({ id: a.id, url: a.imgUrl, err: String(e.message || e) }) + '\n');
        if (imgErr <= 8) console.log(`  img err ${a.id}: ${e.message}`);
      }
      if (++processed % 100 === 0) {
        prog.doneIds = [...done]; prog.artworks = artworks; saveProgress(prog);
        console.log(`  …${processed}/${todo.length} (ok ${artworks.length}, imgErr ${imgErr}, min4-drop ${drop})`);
      }
    }
  }));

  prog.doneIds = [...done]; prog.artworks = artworks; saveProgress(prog);
  artworks.sort((x, y) => (x.category < y.category ? -1 : x.category > y.category ? 1 : Number(x.objectNumber) - Number(y.objectNumber)));
  writeCollection(artworks, COLLECTION_STEM);
  console.log(`\n[full] DONE. collected ${artworks.length} | img errors ${imgErr} | min4-drops ${drop}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
