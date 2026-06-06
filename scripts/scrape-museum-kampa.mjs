#!/usr/bin/env node
// Museum Kampa — Nadace Jana a Medy Mládkových (Prague) — collection scraper.
//
// Source: eSbirky.cz — the Czech National Museum's national digitization CONSORTIUM
//   portal (the legit "museum ecosystem" portal; Museum Kampa is a registered contributing
//   institution, NOT a forbidden third-party aggregator). The Kampa deposit is 633 objects,
//   ALL licensed CC BY-NC-SA. The museum's OWN marketing site (museumkampa.cz) is a plain
//   WordPress site with NO artwork data (verified in Phase A) — eSbirky is the only source.
//
//   LIST:   GET https://www.esbirky.cz/instituce/museum-kampa-nadace-jana-a-medy-mladkovych?page=N
//           12 objects/page, ~53 pages. Each page links /subject/{slug}-{numericId}.
//   DETAIL: GET https://www.esbirky.cz/subject/{slug}-{numericId}  (Next.js).
//           The page is server-rendered; the FULL structured object lives in the React Flight
//           payload (self.__next_f.push([1,"..."])) as a JSON `{"subject":{…}}` blob — we
//           concatenate the payload string chunks, JSON-unescape, and brace-match the object.
//           All 6 metadata fields come from this DETAIL record (NOT the slug, NOT the image).
//   IMAGE:  subject.mainImage.urls.original  →  https://media.esbirky.cz/predmet/{id}/subject-image/{md5}.jpg
//           Full-size original (verified 1.3 MB for an Arp drawing). No hotlink/referer guard.
//
// METADATA mapping (eSbirky `subject` object → ARMIN):
//   title       = `name` with the leading "Surname Forename" author prefix stripped.
//   artist      = `authorName` ("Surname Forename"); when authorType=unknown_author the artist
//                 is often embedded as the FIRST line of `description` ("Author\\ntechnique") or
//                 as the leading tokens of `name` — recover it from there. Placeholder author
//                 values (Neznámý / Neznámý autor / Anonym…) are treated as MISSING (never kept).
//   year        = a 4-digit year from `datingNote` (e.g. "1968"); else `datingFrom` when it equals
//                 `datingTo` (a single year) or a tight ≤3-yr span. A century span (1901–2000) is
//                 NOT a real creation year → year=null (record then fails min-4 and is dropped).
//   category    = classify(`description`,`materialDetails`) → painting|drawing|print|photograph|
//                 mixed_media_2d. `subjectType` is the broad department label ("Malířství, kresba
//                 a grafika") for EVERY record, so it is useless for fine scope — we drive scope
//                 off the technique text instead. (This deposit is ~91% "kresba"; ~1 painting.)
//   medium      = `materialDetails` (specific technique, e.g. "suchá jehla, papír") else
//                 `description` (the technique bucket) else the `materials[].value` list.
//   dimensions  = `dimension` ("výška=43.8cm; šířka=32.5cm").
//
// SCOPE: flat visual works only. PAINTINGS = collect ALL (no cap). Other 2D (drawing/print/
//   photo/collage) = all in-scope (small corpus, value-filtered: study/sketch/copy terms skipped).
//   3D excluded (none present in this deposit, but the classifier excludes socha/plastika/objekt…
//   using word-safe matching so woodcut prints "dřevořez/dřevoryt" are NOT mistaken for wood 3D).
//
// Usage:
//   node scripts/scrape-museum-kampa.mjs --classify   # dry-run: crawl + scope tally only (no images)
//   node scripts/scrape-museum-kampa.mjs --pilot      # build ~20 in-scope (NO R2 upload), write pilot JSON
//   node scripts/scrape-museum-kampa.mjs --pilot --upload   # pilot WITH R2 upload
//   node scripts/scrape-museum-kampa.mjs --full       # full scrape + R2 upload, write collection JSON

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

const SLUG = 'museum-kampa';
const COLLECTION_STEM = `${SLUG}-collection`;
const ORIGIN = 'https://www.esbirky.cz';
const LIST_URL = `${ORIGIN}/instituce/museum-kampa-nadace-jana-a-medy-mladkovych`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--pilot') ? 'pilot' : 'classify';
const DO_UPLOAD = MODE === 'full' || args.includes('--upload');
const PILOT_TARGET = 20;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- fetch helpers (retry) ----------
async function getText(url, tries = 3) {
  for (let att = 1; att <= tries; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { if (att === tries) throw e; await sleep(500 * att); }
  }
}

// ---------- list crawl: paginate until an empty page ----------
async function crawlLinks() {
  const seen = new Set();
  for (let page = 1; page <= 80; page++) {
    let html;
    try { html = await getText(`${LIST_URL}?page=${page}`); }
    catch (e) { console.log(`  [list] page ${page} error: ${e.message}`); continue; }
    const links = [...html.matchAll(/\/subject\/[a-z0-9-]+-[0-9]+/g)].map((m) => m[0]);
    const uniq = [...new Set(links)];
    for (const l of uniq) seen.add(l);
    if (uniq.length === 0) { console.log(`  [list] page ${page}: 0 links → stop`); break; }
    if (page % 10 === 0) console.log(`  [list] …page ${page}, ${seen.size} links so far`);
    await sleep(300);
  }
  return [...seen].sort();
}

// ---------- flight-payload parse: extract the {"subject":{…}} object ----------
function extractSubject(html) {
  const pushes = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map((m) => m[1]);
  let big = '';
  for (const p of pushes) { try { big += JSON.parse(p); } catch { /* skip malformed chunk */ } }
  const idx = big.indexOf('{"subject":{');
  if (idx < 0) return null;
  let start = big.indexOf('{', idx + '{"subject":'.length), depth = 0;
  for (let i = start; i < big.length; i++) {
    const c = big[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { try { return JSON.parse(big.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}

// ---------- scope classifier (Czech technique text) ----------
// Driven by `description` (the museum's technique bucket, 100% filled) refined by `materialDetails`.
// Returns painting|drawing|print|photograph|mixed_media_2d (in-scope) or null (drop).
const norm = (s) => (s || '').toLowerCase().normalize('NFC').replace(/\n/g, ' ');
// word-safe match: keyword as a whole word (Unicode letters), so "dřevo" (wood material) does
// NOT match inside "dřevořez"/"dřevoryt" (woodcut/wood-engraving prints).
function hasWord(blob, kw) {
  const re = new RegExp(`(^|[^\\p{L}])${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'u');
  return re.test(blob);
}
const anyWord = (blob, list) => list.some((k) => hasWord(blob, k));
const anySub = (blob, list) => list.some((k) => blob.includes(k));

// value-filter: skip low-value derivative works (study/sketch/copy/squeeze/reproduction-only).
function isLowValue(blob) {
  return anyWord(blob, ['studie', 'skica', 'náčrt', 'nacrt', 'kopie', 'replika', 'reprodukce', 'otisk', 'frotáž', 'frotaz', 'squeeze']);
}

function classify(description, materialDetails) {
  const blob = norm(`${description || ''} ${materialDetails || ''}`);
  if (!blob.trim()) return null;

  // 1) hard EXCLUDE — true 3D / object forms (word-safe; none present in this deposit, safety net).
  const EXCLUDE3D = [
    'socha', 'sochy', 'plastika', 'plastiky', 'busta', 'reliéf', 'reliéfy', 'relief',
    'objekt', 'objekty', 'asambláž', 'assemblage', 'medaile', 'mince', 'odlitek', 'odlitky',
    'bronz', 'sádra', 'sádry', 'porcelán', 'keramika', 'terakota', 'instalace', 'nábytek',
    'tapiserie', 'gobelín', 'plaketa', 'model',
  ];
  if (anyWord(blob, EXCLUDE3D)) return null;

  // 2) PHOTOGRAPH
  if (anyWord(blob, ['fotografie', 'fotografia', 'fotomontáž', 'fotogram']) || anySub(blob, ['černobílá fotograf', 'fotograf'])) return 'photograph';

  // 3) PRINT (multiples / intaglio / relief / planographic). Substring match is safe here —
  //    these stems do not collide with the 3D/material nouns above.
  if (anySub(blob, [
    'litografie', 'litograf', 'serigrafie', 'seriografie', 'serografie', 'sítotisk', 'sitotisk',
    'lept', 'suchá jehla', 'sucha jehla', 'mezzotinta', 'akvatinta', 'mědiryt', 'mediryt', 'mědioryt',
    'dřevoryt', 'drevoryt', 'dřevořez', 'drevorez', 'linoryt', 'linořez', 'linorez', 'linoleoryt',
    'monotyp', 'heliogravur', 'světlotisk', 'svetlotisk', 'offset', 'rytina', 'rytiny',
    'tisk', 'grafika', 'grafik', 'dekoltáž', 'dekoltaz', 'décollage', 'decollage',
  ])) return 'print';

  // 4) PAINTING (collect ALL)
  if (anySub(blob, ['olej', 'tempera', 'akryl', 'akril', 'kvaš', 'kvas', 'gouache', 'malba', 'plátno', 'platno', 'plátně', 'platne', 'enkaustik'])) return 'painting';

  // 5) DRAWING (unique works on paper)
  if (anySub(blob, ['kresba', 'akvarel', 'tužka', 'tuzka', 'tuš', 'tus', 'pastel', 'uhel', 'křída', 'krida', 'rudka', 'perokresba', 'kresba štětcem'])) return 'drawing';

  // 6) collage / mixed flat
  if (anySub(blob, ['koláž', 'kolaz', 'collage', 'dekoláž', 'kombinovaná technika', 'kombinovana technika', 'arabská guma', 'arabska guma', 'otisky prstů', 'otisky prstu'])) return 'mixed_media_2d';

  return null; // unknown technique → out of scope (conservative)
}

// ---------- artist / title / year extraction ----------
const PLACEHOLDER_AUTHOR = /^(neznámý|neznamy|neznámý autor|neznamy autor|nezn\. autor|anonym|anonymní|nezjištěn|nezjisten|bez autora|n\/?a)\.?$/i;

// recover an artist name from the description first line ("Author\\ntechnique") or from the
// leading "Surname Forename" tokens of `name` — used when authorName is empty/placeholder.
function recoverArtist(s) {
  const desc = s.description || '';
  if (desc.includes('\n')) {
    const first = desc.split('\n')[0].trim();
    const toks = first.split(/\s+/);
    const looksLikeName = toks.length >= 1 && toks.length <= 4
      && toks.every((t) => t && t[0] === t[0].toUpperCase() && t[0] !== t[0].toLowerCase())
      && !/kresba|olej|papír|papir|tuš|tus|lept|tisk|grafik|akvarel|pastel|uhel|tužka|tuzka|barva|karton|technika/i.test(first);
    if (looksLikeName && !PLACEHOLDER_AUTHOR.test(first)) return first;
  }
  return null;
}

function extractArtist(s) {
  const a = (s.authorName || '').trim();
  if (a && !PLACEHOLDER_AUTHOR.test(a)) return a;
  return recoverArtist(s); // may be null → record drops on min-4
}

function extractYear(s) {
  const note = (s.datingNote || '').trim();
  const m = note.match(/\b(1[5-9]\d\d|20[0-2]\d)\b/);
  if (m) return parseInt(m[1], 10);
  const df = s.datingFrom, dt = s.datingTo;
  if (Number.isInteger(df) && df === dt) return df;            // single specific year
  if (Number.isInteger(df) && Number.isInteger(dt) && dt - df >= 0 && dt - df <= 3) return df; // tight span
  return null;                                                  // century range → not a real year
}

function buildDateStr(s, year) {
  const label = (s.dating && s.dating.value || '').trim();      // e.g. "20. století"
  const note = (s.datingNote || '').trim();                     // e.g. "1968"
  if (label && note && note !== label) return `${label}, ${note}`;
  if (note) return note;
  if (label) return label;
  return year != null ? String(year) : '';
}

// strip a leading "Artist " (or "Artist, ") prefix from the combined `name` to get the bare title.
function extractTitle(s, artist) {
  let title = (s.name || '').trim();
  if (artist) {
    const lc = title.toLowerCase();
    const al = artist.toLowerCase();
    if (lc.startsWith(al)) title = title.slice(artist.length).replace(/^[\s,]+/, '').trim();
    else {
      // author stored "Surname Forename" but title may repeat it reversed — also try token-prefix strip
      const at = artist.split(/\s+/);
      const tt = title.split(/\s+/);
      if (tt.length > at.length && at.every((w, i) => tt[i] && tt[i].toLowerCase() === w.toLowerCase()))
        title = tt.slice(at.length).join(' ').replace(/^[\s,]+/, '').trim();
    }
  }
  return title;
}

// ---------- detail record → intermediate artwork ----------
function parseSubject(s) {
  const id = String(s.id);
  const artist = extractArtist(s);
  const title = extractTitle(s, artist);
  const year = extractYear(s);
  const dateStr = buildDateStr(s, year);
  const category = classify(s.description, s.materialDetails);
  const medium = (s.materialDetails || '').trim()
    || (s.description || '').replace(/\n/g, ' ').trim()
    || ((s.materials || []).map((m) => m.value).filter(Boolean).join(', '));
  const dimensions = (s.dimension || '').trim();
  const img = (s.mainImage && s.mainImage.urls && (s.mainImage.urls.original
    || s.mainImage.urls.large || s.mainImage.urls.medium)) || null;
  return {
    id, slug: s.slug, title, artist, year, dateStr, medium, dimensions, category,
    imgUrl: img, inventoryNumber: (s.inventoryNumber || '').trim(),
    license: (s.license && s.license.value) || '',
    sourceUrl: `${ORIGIN}/subject/${s.slug}`,
  };
}

// ---------- image: download full-size, webp-reencode, upload to R2 ----------
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
  const meta = await (await import('sharp')).default(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(src);                 // pure webp(2048/q85) re-encode (no trim)
  const hash8 = sha(a.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
  if (DO_UPLOAD) await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null, bytes: buffer.length };
}

// ---------- record assembly (min-4 guard) ----------
function toArtwork(a, imageUrl) {
  if (!a.title || !a.artist || a.year == null || !a.category) return null; // min-4 → drop
  return {
    id: a.id,
    objectNumber: a.inventoryNumber,
    title: a.title,
    artist: a.artist,
    date: a.dateStr || (a.year != null ? String(a.year) : ''),
    year: a.year,
    medium: a.medium,
    dimensions: a.dimensions,
    category: a.category,
    description: '',
    imageUrl,
    thumbnailUrl: a.imgUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: { esbirky_id: a.id, esbirky_slug: a.slug, inventory_number: a.inventoryNumber, license: a.license },
    original_imageUrl: a.imgUrl,
  };
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Museum Kampa',
    collection: 'Collection',
    website: 'https://www.esbirky.cz/instituce/museum-kampa-nadace-jana-a-medy-mladkovych',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'html',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`[write] ${out} (${artworks.length} works) breakdown=`, cats);
  return out;
}

// ---------- fetch + parse a batch of subject pages, with concurrency ----------
async function fetchSubjects(links, label) {
  const out = new Array(links.length);
  let idx = 0, done = 0, fail = 0;
  const CONC = 6;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < links.length) {
      const i = idx++;
      const url = `${ORIGIN}${links[i]}`;
      try {
        const html = await getText(url);
        const s = extractSubject(html);
        if (!s) { fail++; fs.appendFileSync(path.join(STATE_DIR, `${SLUG}-failed.ndjson`), JSON.stringify({ url, err: 'no-subject-payload' }) + '\n'); }
        else out[i] = parseSubject(s);
      } catch (e) {
        fail++;
        fs.appendFileSync(path.join(STATE_DIR, `${SLUG}-failed.ndjson`), JSON.stringify({ url, err: String(e.message || e) }) + '\n');
      }
      if (++done % 50 === 0) console.log(`  [${label}] …${done}/${links.length} (fail ${fail})`);
      await sleep(120);
    }
  }));
  if (fail) console.log(`  [${label}] detail fetch failures: ${fail} (logged to .state/${SLUG}-failed.ndjson)`);
  return out.filter(Boolean);
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  console.log(`[crawl] listing pages of ${LIST_URL} …`);
  const links = await crawlLinks();
  console.log(`[crawl] ${links.length} subject links.`);

  // For --classify and --pilot we still need detail records to classify accurately. For --pilot
  // we only need enough IN-SCOPE records to hit PILOT_TARGET, but scope is known only after the
  // detail fetch, so we fetch detail for the first chunk in pilot mode and the whole set otherwise.
  const linkSubset = MODE === 'pilot' ? links.slice(0, Math.min(links.length, 60)) : links;
  console.log(`[detail] fetching ${linkSubset.length} subject records …`);
  const parsed = await fetchSubjects(linkSubset, 'detail');

  // classification tally
  const tally = {};
  let inScope = 0, outScope = 0, noImg = 0, dropMin4 = 0, noArtist = 0, noYear = 0;
  for (const p of parsed) {
    if (p.category) { inScope++; tally[p.category] = (tally[p.category] || 0) + 1; if (!p.imgUrl) noImg++; }
    else outScope++;
    if (!p.artist) noArtist++;
    if (p.year == null) noYear++;
    if (p.category && (!p.title || !p.artist || p.year == null)) dropMin4++;
  }
  console.log('\n[classify] parsed:', parsed.length, '| in-scope:', inScope, '| out-of-scope:', outScope, '| in-scope missing image:', noImg);
  console.log('[classify] breakdown:', tally);
  console.log(`[classify] missing artist: ${noArtist} | missing year: ${noYear} | in-scope that DROP on min-4: ${dropMin4}`);
  console.log(`[classify] → would KEEP (in-scope ∧ min-4 ∧ image): ${parsed.filter((p) => p.category && p.imgUrl && p.title && p.artist && p.year != null).length}`);

  if (MODE === 'classify') {
    const ex = parsed.filter((p) => !p.category).slice(0, 20);
    console.log('\n[classify] sample EXCLUDED/unknown (medium | title):');
    for (const p of ex) console.log('   -', JSON.stringify((p.medium || '').slice(0, 40)), '|', (p.title || '').slice(0, 40));
    const keep = parsed.filter((p) => p.category && p.imgUrl && p.title && p.artist && p.year != null).slice(0, 12);
    console.log('\n[classify] sample KEEP (cat | year | artist | title):');
    for (const p of keep) console.log(`   - ${p.category} | ${p.year} | ${p.artist} | ${p.title.slice(0, 36)}`);
    return;
  }

  // in-scope, with image, passing min-4 → candidates
  let candidates = parsed.filter((p) => p.category && p.imgUrl && p.title && p.artist && p.year != null);
  if (MODE === 'pilot') candidates = candidates.slice(0, PILOT_TARGET);
  console.log(`\n[${MODE}] image-processing ${candidates.length} candidates (upload=${DO_UPLOAD}) …`);

  const artworks = [];
  let done = 0, imgErr = 0;
  const CONC = 4;
  let idx = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < candidates.length) {
      const a = candidates[idx++];
      try {
        const { imageUrl } = await processImage(a);
        const w = toArtwork(a, imageUrl);
        if (w) artworks.push(w); else dropMin4++;
      } catch (e) {
        imgErr++;
        fs.appendFileSync(path.join(STATE_DIR, `${SLUG}-failed.ndjson`), JSON.stringify({ id: a.id, url: a.imgUrl, err: String(e.message || e) }) + '\n');
        if (imgErr <= 8) console.log(`  img err id=${a.id}: ${e.message}`);
      }
      if (++done % 50 === 0) console.log(`  …${done}/${candidates.length} (ok ${artworks.length}, imgErr ${imgErr})`);
    }
  }));

  artworks.sort((x, y) => Number(x.id) - Number(y.id));
  const stem = MODE === 'pilot' ? `${COLLECTION_STEM}-pilot` : COLLECTION_STEM;
  writeCollection(artworks, stem);
  console.log(`\n[${MODE}] DONE. collected ${artworks.length} | img errors ${imgErr} | min4-drops ${dropMin4}`);
  console.log(`[${MODE}] total in-scope offered = ${inScope}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
