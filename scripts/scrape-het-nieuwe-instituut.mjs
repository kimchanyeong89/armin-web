#!/usr/bin/env node
// Het Nieuwe Instituut / Nieuwe Instituut (Rotterdam) — National Collection for Dutch
// architecture & urban planning. Full FLAT-works scraper.
//
// Source: museum-OWN Linked Open Data knowledge graph (TriplyDB / Virtuoso), no auth.
//   SPARQL endpoint:
//     https://api.collectiedata.hetnieuweinstituut.nl/datasets/the-other-interface/knowledge-graph/services/default/sparql
//   Account `the-other-interface`, dataset `knowledge-graph` (40.3M statements, public).
//   Data model: schema.org VisualArtwork + RiC (Records-in-Contexts) + CIDOC-CRM dates.
//     ?obj a schema:VisualArtwork
//          schema:prefLabel  -> title (skos:prefLabel, EN + NL)
//          schema:artform    -> thesaurus concept ; skos:prefLabel = medium taxonomy
//          schema:creator    -> role node ; schema:name = architect/firm name
//          schema:dateCreated-> E52_Time-Span ; cidoc:P82a_begin_of_the_begin = begin date
//          schema:associatedMedia -> MediaObject ; dcterms:identifier = CDN key
//          schema:url        -> persistent handle permalink
//   Image (own CDN): https://hni-cdn.qonqord.cloud/preview/{cdnKey}  -> 1600px JPEG (colour, unwatermarked).
//
// SCOPE (architecture, FLAT only): keep drawings/plans/sections/elevations/blueprints/
//   sketches/perspectives/calques/diazotypes/views/situational drawings/maps AND architectural
//   photos/transparencies/reproductions. EXCLUDE 3D: scale models, maquettes, design/study models,
//   furniture/objects (chairs, lamps, tableware, …). Discriminator = schema:artform prefLabel (EN).
//   category bucket: photo|transparency|reproduction -> "photograph", everything else -> "drawing".
//   (Architectural drawings/photographs are NEVER colour-gated — monochrome blueprints kept.)
//
// QUALITY: this is a 4.5M-document national ARCHIVE; ~60% of in-scope drawings have no individual
//   creator attributed and ~72% of named works carry no parseable date. Per the min-4 rule (title,
//   artist, year, category all MUST; no placeholders), we keep ONLY works that have a NAMED creator
//   AND a parseable begin-year AND a title AND an image. That yields ~490 fully-attributed, dated,
//   titled architectural works with 1600px images — the "named + dated" priority slice.
//
// Usage:
//   node scripts/scrape-het-nieuwe-instituut.mjs --probe   # ~15 works end-to-end (R2 upload + JSON)
//   node scripts/scrape-het-nieuwe-instituut.mjs --full    # all in-scope named+dated, resumable
//   node scripts/scrape-het-nieuwe-instituut.mjs --count   # dry-run: SPARQL counts only, no images

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { autocropToWebp } from './lib/autocrop.mjs';

const require = createRequire(import.meta.url);
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
// hni-cdn.qonqord.cloud serves a valid (browser-trusted) cert but omits the intermediate,
// so Node's strict chain check throws UNABLE_TO_VERIFY_LEAF_SIGNATURE. Scope a lenient
// dispatcher to image downloads only (public images, hash-verified) — SPARQL stays strict.
const { Agent } = require('undici');
const CDN_DISPATCHER = new Agent({ connect: { rejectUnauthorized: false } });
const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
require('dotenv').config({ path: path.join(REPO, '.env.local') });

const SLUG = 'het-nieuwe-instituut';
const COLLECTION_STEM = `${SLUG}-collection`;
const SPARQL = 'https://api.collectiedata.hetnieuweinstituut.nl/datasets/the-other-interface/knowledge-graph/services/default/sparql';
const CDN = 'https://hni-cdn.qonqord.cloud/preview';
const UA = 'armin-museum-research/1.0';
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--count') ? 'count' : 'probe';
const PROBE_TARGET = 15;
const PAGE = 500;          // SPARQL paging window
const CONC = 4;            // image-processing concurrency
const MAX_CAP_BYTES = 23 * 1024 * 1024; // hard JSON size cap (compact)

// in-scope artform discriminator (EN prefLabel). keep flat; drop 3D models/objects.
const SCOPE_RE = /drawing|plan|section|elevation|blueprint|sketch|calque|diazotype|perspective|axonometric|view|situational|photo|transparenc|reproduction|render|map/i;
const OUT_RE = /model|maquette/i;
const PHOTO_RE = /photo|transparenc|reproduction/i;
// schema:name values that are not real attributions (min-4: no placeholder artists)
const ANON_RE = /^(anoniem|anonymous|onbekend|unknown|n\.?n\.?|diverse|various|-)$/i;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- SPARQL layer ----------
async function sparql(query) {
  const body = new URLSearchParams({ query });
  for (let att = 1; att <= 4; att++) {
    try {
      const r = await fetch(SPARQL, {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/sparql-results+json',
        },
        body,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      return j.results.bindings;
    } catch (e) {
      if (att === 4) throw e;
      await sleep(800 * att);
    }
  }
}
const V = (row, k) => (row[k] ? row[k].value : '');

// One row per object: title (EN preferred, NL fallback), medium artform, creator name,
// begin date, CDN key, object id, source handle. Requires creator-name + dateCreated + media.
function pageQuery(limit, offset) {
  return `
SELECT ?objid
  (SAMPLE(?titleEn) AS ?tEn) (SAMPLE(?titleNl) AS ?tNl)
  (SAMPLE(?afl) AS ?artform)
  (SAMPLE(?cname) AS ?creator)
  (SAMPLE(?descEn) AS ?dEn) (SAMPLE(?descNl) AS ?dNl)
  (SAMPLE(?dimRaw) AS ?dim)
  (MIN(?beginRaw) AS ?begin)
  (SAMPLE(?cdnid) AS ?cdn)
  (SAMPLE(?handle) AS ?handle)
WHERE {
  ?obj a <https://schema.org/VisualArtwork> ;
       <https://schema.org/identifier> ?objid ;
       <https://schema.org/artform> ?af ;
       <https://schema.org/creator> ?cr ;
       <https://schema.org/associatedMedia> ?m ;
       <https://schema.org/dateCreated> ?dc .
  ?af <http://www.w3.org/2004/02/skos/core#prefLabel> ?afl . FILTER(lang(?afl)="en")
  ?cr <https://schema.org/name> ?cname .
  ?m <http://purl.org/dc/terms/identifier> ?cdnid .
  ?dc <http://www.cidoc-crm.org/cidoc-crm/P82a_begin_of_the_begin> ?beginRaw .
  ?obj <http://www.w3.org/2004/02/skos/core#prefLabel> ?anyTitle .
  OPTIONAL { ?obj <http://www.w3.org/2004/02/skos/core#prefLabel> ?titleEn . FILTER(lang(?titleEn)="en") }
  OPTIONAL { ?obj <http://www.w3.org/2004/02/skos/core#prefLabel> ?titleNl . FILTER(lang(?titleNl)="nl") }
  OPTIONAL { ?obj <https://schema.org/description> ?descEn . FILTER(lang(?descEn)="en") }
  OPTIONAL { ?obj <https://schema.org/description> ?descNl . FILTER(lang(?descNl)="nl") }
  OPTIONAL { ?obj <https://schema.org/url> ?handle }
}
GROUP BY ?objid
ORDER BY ?objid
LIMIT ${limit} OFFSET ${offset}`;
}

async function fetchAllRows() {
  const out = [];
  for (let off = 0; ; off += PAGE) {
    const rows = await sparql(pageQuery(PAGE, off));
    out.push(...rows);
    console.log(`  [sparql] +${rows.length} (total ${out.length}) @ offset ${off}`);
    if (rows.length < PAGE) break;
    await sleep(400);
  }
  return out;
}

// ---------- row -> candidate (scope filter + field parse) ----------
function toCandidate(row) {
  const artform = V(row, 'artform');
  if (!artform || !SCOPE_RE.test(artform) || OUT_RE.test(artform)) return null; // out of scope

  const objid = V(row, 'objid');
  const title = (V(row, 'tEn') || V(row, 'tNl')).trim();
  const artist = V(row, 'creator').trim();         // schema:name on creator role node
  const beginRaw = V(row, 'begin').trim();          // e.g. "1933-09-18" / "1916" / "1955-05"
  const ym = beginRaw.match(/^-?\d{1,4}/);
  const year = ym ? parseInt(ym[0], 10) : null;
  const cdn = V(row, 'cdn').trim();

  if (!objid || !title || !artist || year == null || !cdn) return null; // min-4 guard
  if (ANON_RE.test(artist)) return null;            // anonymous/placeholder is not a real attribution

  const description = (V(row, 'dEn') || V(row, 'dNl')).trim();
  const handle = V(row, 'handle').trim();
  const category = PHOTO_RE.test(artform) ? 'photograph' : 'drawing';
  const imgUrl = `${CDN}/${cdn}`;
  const sourceUrl = handle ||
    `https://collectie.hetnieuweinstituut.nl/en/page/${encodeURIComponent(objid)}/`;

  return {
    id: `${SLUG}-${objid}`,
    objectNumber: String(objid),
    title,
    artist,                          // raw source order ("Dudok, Willem Marinus") — display/match layers normalize
    date: beginRaw,
    year,
    medium: artform,                 // archival artform/medium term (EN), e.g. "design drawings"
    dimensions: '',                  // not reliably modeled at object level in this graph
    category,
    description,
    imgUrl,
    sourceUrl,
    cdn,
  };
}

// ---------- image: download 1600px preview, webp, R2 ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const ua = att === 1 ? UA : BROWSER_UA;
      const r = await fetch(url, { headers: { 'User-Agent': ua }, redirect: 'follow', dispatcher: CDN_DISPATCHER });
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
  const sharp = (await import('sharp')).default;
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(src);   // default: webp convert (no trim)
  const hash8 = sha(a.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

function toArtwork(a, imageUrl) {
  return {
    id: a.id,
    objectNumber: a.objectNumber,
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
    metadata: { object_id: a.objectNumber, cdn_key: a.cdn, artform: a.medium },
    original_imageUrl: a.imgUrl,
  };
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Nieuwe Instituut',
    collection: 'National Collection — Dutch Architecture & Urban Planning',
    website: 'https://collectie.hetnieuweinstituut.nl/en',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'api',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  // COMPACT (no indent) to honour the <23MB cap on large collections.
  let json = JSON.stringify(payload);
  if (Buffer.byteLength(json) > MAX_CAP_BYTES) {
    // keep named+dated, drop longest descriptions first if ever needed
    for (const w of payload.artworks) w.description = '';
    payload.total_count = payload.artworks.length;
    json = JSON.stringify(payload);
  }
  fs.writeFileSync(out, json);
  console.log(`[write] ${out} (${artworks.length} works, ${(Buffer.byteLength(json) / 1e6).toFixed(2)}MB) breakdown=`, cats);
  return out;
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  console.log(`[${MODE}] fetching in-scope named+dated rows from SPARQL …`);
  const rows = await fetchAllRows();
  const candidates = rows.map(toCandidate).filter(Boolean);
  console.log(`[${MODE}] rows=${rows.length} -> in-scope candidates=${candidates.length}`);

  if (MODE === 'count') {
    const cats = {};
    for (const c of candidates) cats[c.category] = (cats[c.category] || 0) + 1;
    console.log('[count] category split:', cats);
    console.log('[count] sample:', candidates.slice(0, 8).map((c) => `${c.year} | ${c.artist} | ${c.title.slice(0, 36)}`));
    return;
  }

  let work = candidates;
  if (MODE === 'probe') work = candidates.slice(0, PROBE_TARGET);

  // resume: skip ids already present in existing collection file (full mode)
  const stem = MODE === 'probe' ? `${COLLECTION_STEM}-probe` : COLLECTION_STEM;
  const outPath = path.join(REPO, 'public/data', `${stem}.json`);
  const existing = [];
  const haveIds = new Set();
  if (MODE === 'full' && fs.existsSync(outPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      for (const w of (prev.artworks || [])) { existing.push(w); haveIds.add(w.id); }
      console.log(`[full] resume: ${existing.length} already collected`);
    } catch { /* ignore corrupt */ }
  }
  work = work.filter((c) => !haveIds.has(c.id));

  console.log(`[${MODE}] image-processing ${work.length} → R2 …`);
  const collected = [...existing];
  let done = 0, imgErr = 0, idx = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < work.length) {
      const a = work[idx++];
      try {
        const { imageUrl } = await processImage(a);
        collected.push(toArtwork(a, imageUrl));
      } catch (e) {
        imgErr++;
        fs.appendFileSync(path.join(STATE_DIR, `${SLUG}-failed.ndjson`), JSON.stringify({ id: a.id, url: a.imgUrl, err: String(e.message || e) }) + '\n');
        if (imgErr <= 5) console.log(`  img err ${a.id}: ${e.message}`);
      }
      if (++done % 50 === 0) {
        console.log(`  …${done}/${work.length} (ok ${collected.length}, err ${imgErr})`);
        if (MODE === 'full') writeCollection(collected.slice().sort((x, y) => x.id.localeCompare(y.id)), stem); // checkpoint
      }
    }
  }));

  collected.sort((x, y) => x.id.localeCompare(y.id));
  writeCollection(collected, stem);
  console.log(`\n[${MODE}] DONE. collected ${collected.length} | img errors ${imgErr} | in-scope offered ${candidates.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
