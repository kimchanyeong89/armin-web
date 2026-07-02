#!/usr/bin/env node
// Sir John Soane's Museum (London) — ARCHITECTURAL DRAWINGS scraper.
// Genre: architecture (건축). Source: museum's OWN collection DB collections.soane.org
//   (System Simulation "MuseumIndex+" platform — no auth, no aggregator, behind Cloudflare
//    but NOT bot-blocked for a browser User-Agent + plain fetch).
//
// WHY this collection: our existing soane-paintings.json is 385 classical PAINTINGS, but Soane's
//   Museum is famous for ARCHITECTURE — ~30,000 architectural drawings (Adam brothers, Soane's own
//   office, George Dance, Piranesi). ~9,000+ are catalogued & digitised online with images. This
//   scraper harvests those DRAWINGS so the museum's "Architecture" genre actually shows architecture.
//
// SOURCE STRUCTURE (reverse-engineered):
//   • "Architectural & Other Drawings" is a hierarchical ARCHIVE tree (ci_search_type=ARCI). Top
//     schemes: SCHEME472 (Soane office), SCHEME690 (Adam office), SCHEME471 (Adam travel),
//     SCHEME473 (English Baroque), ARC14702 (George Dance office), ARC20058 (Italian Renaissance).
//   • Tree nodes:  /drawings?ci_search_type=ARCI&mi_search_type=adv&sort=7&tn=Drawings&t={SCHEME|ARC id}
//     Intermediate nodes hold child nodes; LEAF nodes hold 10 drawing cards per page in
//     `summary_item_container` divs, each linking to a detail page /OBJECT{n} or /ARC{n}.
//   • Pagination is POST (not GET): a leaf page embeds a <form name="page2"> with hidden inputs
//     {session, search, page, t, tn, mi_search_type, ...}. POST /drawings with page=N to advance.
//   • The persistent LEFT-NAV repeats the top scheme links on every page, so child-node discovery
//     must read links only from the page body, and "is this a leaf?" = "does it have summary cards?".
//
// METADATA — parsed from the DETAIL page (Detail-Page Completeness). Drawing records use
//   `full_record_data_caption` <h4>Label</h4> + `full_record_data_value` pairs:
//     Reference number      → objectNumber / id base   (e.g. "SM 45/1/10")
//     Purpose               → title                    (e.g. "[1] Preliminary design drawn by George Dance, 1776")
//     Aspect                → description / title-fallback (what the drawing depicts)
//     Hand                  → artist (draughtsman)     (e.g. "George Dance (1741-1825)", or "pupil")
//     Medium and dimensions → split into medium + dimensions  ("Pencil, pen and sepia wash on laid paper (377 x 477)")
//     Signed and dated      → year source              ("1770" | "datable to 1772" | "November 1776")
//     Level                 → MUST be "Drawing" (category discriminator; skip non-drawings)
//     Notes                 → description (longer)
//   When Hand is generic ("pupil"/"office"/"n/a"), artist falls back to the seed scheme's architect.
//
// IMAGE — derivatives at assets/object_images/.../{v0_high|v0_web|v0_soane_fullview|v0_soane_thumbnail}.jpg
//   v0_high.jpg is the largest (we prefer it, then fullview, then web). Drawings are NEVER colour-gated
//   (COLLECTION_SCRAPING_GUIDE §1: drawings kept even if monochrome). autocrop trim OFF by default.
//
// LICENSING: collections.soane.org terms — "Material may be reproduced free of charge in any format or
//   medium for research, private study or for internal circulation within an educational organisation …
//   subject to the material being reproduced accurately." Non-commercial reuse w/ attribution permitted
//   (same basis as the already-shipped soane-paintings collection).
//
// Usage:
//   node scripts/scrape-soane-architecture.mjs --pilot   # ≤25 drawings end-to-end + R2, write *-pilot.json
//   node scripts/scrape-soane-architecture.mjs --full     # walk the whole drawings tree, resumable, write collection JSON
//   node scripts/scrape-soane-architecture.mjs --enumerate # count drawing detail-targets across the tree (no images)

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

const SLUG = 'soane-architecture';
const COLLECTION_STEM = `${SLUG}-collection`;
const ORIGIN = 'https://collections.soane.org';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--enumerate') ? 'enumerate' : 'pilot';
const PILOT_TARGET = 25;

// Top-level drawing schemes (label → architect fallback for generic "Hand"). The crawl starts here
// and walks down. Architect fallback is used only when Hand is a generic role, never to override a name.
const TOP_SCHEMES = [
  { id: 'SCHEME472', label: 'Sir John Soane office drawings', architect: 'John Soane' },
  { id: 'SCHEME690', label: 'Robert and James Adam office drawings', architect: 'Robert Adam' },
  { id: 'SCHEME471', label: 'Robert and James Adam travel drawings', architect: 'Robert Adam' },
  { id: 'SCHEME473', label: 'English Baroque Drawings', architect: '' },
  { id: 'ARC14702', label: 'George Dance office drawings', architect: 'George Dance' },
  { id: 'ARC20058', label: 'Italian Renaissance Drawings', architect: '' },
];
const GENERIC_HAND = /^(pupil|pupils|office|unknown|unidentified|anon(ymous)?|n\/?a|not recorded|various)\b/i;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function decodeEntities(s) {
  return (s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x27;/gi, "'")
    .replace(/&#8217;/g, '’').replace(/&#8216;/g, '‘')
    .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
    .replace(/&hellip;/g, '…').replace(/&nbsp;/g, ' ').replace(/&deg;/g, '°')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}
const stripTags = (s) => decodeEntities((s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// ---------- HTTP (GET + POST) with retry ----------
async function getHtml(url, tries = 3) {
  let lastErr;
  for (let att = 0; att < tries; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9' }, redirect: 'follow' });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { lastErr = e; await sleep(700 * (att + 1)); }
  }
  throw lastErr;
}
async function postHtml(url, fields, tries = 3) {
  const body = new URLSearchParams(fields).toString();
  let lastErr;
  for (let att = 0; att < tries; att++) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept-Language': 'en-GB,en;q=0.9' },
        body, redirect: 'follow',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { lastErr = e; await sleep(700 * (att + 1)); }
  }
  throw lastErr;
}

const schemeUrl = (id) => `${ORIGIN}/drawings?ci_search_type=ARCI&mi_search_type=adv&sort=7&tn=Drawings&t=${id}`;

// ---------- tree walk: discover leaf scheme pages + enumerate their drawing detail-targets ----------

// detail targets (OBJECTnnn / ARCnnn) that sit inside `summary_item_container` cards
function extractCardTargets(html) {
  const out = [];
  const re = /summary_item_container[\s\S]*?href="(OBJECT\d+|ARC\d+)"/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  // some cards put the link before the container class; also catch direct card anchors
  const re2 = /<a\s+href="(OBJECT\d+|ARC\d+)">\s*<div class="image_wrapper"/g;
  while ((m = re2.exec(html))) out.push(m[1]);
  return [...new Set(out)];
}

// child scheme ids referenced from the page BODY (skip the persistent left-nav, which only ever
// repeats the TOP_SCHEMES ids). We read child links from result/summary regions.
function extractChildSchemes(html, exclude) {
  const ids = new Set();
  const re = /href="(drawings\?[^"]*?t=((?:SCHEME|ARC)\d+))"/g;
  let m;
  while ((m = re.exec(html))) {
    const id = m[2];
    if (!exclude.has(id)) ids.add(id);
  }
  return [...ids];
}

// read the POST-pagination form (name="page2" or "next_page") → its hidden field map
function paginationFields(html) {
  for (const nm of ['page2', 'next_page']) {
    const m = html.match(new RegExp(`<form[^>]*name="${nm}"[^>]*>([\\s\\S]*?)</form>`, 'i'));
    if (!m) continue;
    const f = {};
    for (const inp of m[1].match(/<input\b[^>]*>/g) || []) {
      const n = inp.match(/name="([^"]*)"/);
      const v = inp.match(/value="([^"]*)"/);
      if (n) f[n[1]] = v ? decodeEntities(v[1]) : '';
    }
    if (f.session != null) return f;
  }
  return null;
}

// fully enumerate one leaf scheme's drawing targets across all its pages (POST pagination)
async function enumerateLeaf(leafId, seen) {
  const first = await getHtml(schemeUrl(leafId));
  await sleep(350);
  if (!first) return [];
  let targets = extractCardTargets(first);
  if (!targets.length) return [];
  const collected = new Set(targets);
  let fields = paginationFields(first);
  let guard = 0;
  while (fields && guard < 400) {
    guard++;
    const page = (parseInt(fields.page, 10) || 2);
    const html = await postHtml(`${ORIGIN}/drawings`, { ...fields, page: String(page) });
    await sleep(350);
    const tg = extractCardTargets(html);
    const fresh = tg.filter((t) => !collected.has(t));
    tg.forEach((t) => collected.add(t));
    if (!fresh.length) break;            // page returned nothing new → end
    fields = paginationFields(html);     // advance to next page's form (page auto-increments)
    if (fields) fields.page = String(page + 1);
  }
  const list = [...collected].filter((t) => !seen.has(t));
  list.forEach((t) => seen.add(t));
  return list;
}

// BFS the scheme tree from the TOP_SCHEMES; for each node, if it has cards it's a leaf (enumerate it),
// else queue its child schemes. `onLeaf(leafId, targets, architect)` is called per leaf.
// `cap` stops early once we have enough targets (pilot mode).
async function walkTree({ onTargets, cap = Infinity, startScheme = null }) {
  const topExclude = new Set(TOP_SCHEMES.map((s) => s.id));
  const seenScheme = new Set();
  const seenTarget = new Set();
  let totalTargets = 0;
  const roots = startScheme ? [{ id: startScheme, architect: '' }] : TOP_SCHEMES.map((s) => ({ id: s.id, architect: s.architect }));

  for (const root of roots) {
    if (totalTargets >= cap) break;
    // architect propagates down the subtree
    const queue = [{ id: root.id, architect: root.architect }];
    while (queue.length && totalTargets < cap) {
      const { id, architect } = queue.shift();
      if (seenScheme.has(id)) continue;
      seenScheme.add(id);
      const html = await getHtml(schemeUrl(id));
      await sleep(300);
      if (!html) continue;
      const cards = extractCardTargets(html);
      if (cards.length) {
        // LEAF — enumerate all its pages
        const targets = await enumerateLeaf(id, seenTarget);
        if (targets.length) {
          totalTargets += targets.length;
          await onTargets(targets, architect, id);
        }
      } else {
        // intermediate — queue children (exclude the top-nav repeats + already-seen)
        const exclude = new Set([...topExclude, ...seenScheme]);
        for (const cid of extractChildSchemes(html, exclude)) {
          if (!seenScheme.has(cid)) queue.push({ id: cid, architect });
        }
      }
    }
  }
  return totalTargets;
}

// ---------- detail-page parser ----------
function recordFields(html) {
  const d = {};
  const re = /full_record_data_caption">\s*<h4>([\s\S]*?)<\/h4>\s*<\/div>\s*<div class="full_record_data_value">([\s\S]*?)<\/div>/g;
  let m;
  while ((m = re.exec(html))) {
    const cap = stripTags(m[1]);
    const val = stripTags(m[2]);
    if (cap && d[cap] == null) d[cap] = val;   // first wins (later dups are nav/footer noise)
  }
  return d;
}

// "Pencil, pen and sepia wash on laid paper (377 x 477)" → { medium, dimensions }
function splitMediumDims(s) {
  if (!s) return { medium: '', dimensions: '' };
  // dimensions are the trailing parenthetical containing digits and an x/×
  const m = s.match(/^(.*?)\s*\(([^()]*\d[^()]*[x×][^()]*)\)\s*$/);
  if (m) {
    let dims = m[2].trim();
    if (!/mm|cm/i.test(dims)) dims = `${dims} mm`;   // Soane drawing dims are in mm
    return { medium: m[1].trim(), dimensions: dims };
  }
  return { medium: s.trim(), dimensions: '' };
}

function cleanArtist(raw, architect) {
  if (!raw || GENERIC_HAND.test(raw)) return architect || (raw || '').trim();
  // "George Dance (1741-1825)" | "Robert Baldwin ( fl.1762-c.1804)" | "X and Y" — drop bio-date parens,
  // keep co-author "and" joins. Display layer (prettifyArtistName) handles final formatting.
  let a = raw.replace(/\s*\(\s*(?:fl\.?\s*)?[c.–\-\d\s?]+\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  a = a.replace(/\s*,\s*$/, '').trim();
  return a || architect || raw.trim();
}

// year from "Signed and dated" then "Purpose"; scope to 1450–1860 (these are 16C–early-19C drawings)
function pickYear(signed, purpose) {
  const yrs = (s) => (s ? [...String(s).matchAll(/\b(1[4-8]\d\d)\b/g)].map((x) => +x[1]).filter((y) => y >= 1450 && y <= 1860) : []);
  const a = yrs(signed); if (a.length) return Math.min(...a);
  const b = yrs(purpose); if (b.length) return Math.min(...b);
  return null;
}

function bestImageUrl(html) {
  // grab the primary image path, then prefer the largest derivative
  const m = html.match(/object_images\/([0-9a-z/]+?)\/(v0_(?:high|web|soane_fullview|soane_thumbnail))\.jpe?g(\?_m=\d+)?/i);
  if (!m) return null;
  const dir = m[1];
  const ver = (m[3] || '');
  // prefer high > fullview > web (thumbnail only as last resort)
  return `${ORIGIN}/assets/object_images/${dir}/v0_high.jpg${ver}`;
}

async function parseDetail(target, architect) {
  const url = `${ORIGIN}/${target}`;
  const html = await getHtml(url);
  if (!html) return null;

  const f = recordFields(html);
  const level = (f['Level'] || '').toLowerCase();
  // category gate: only keep actual drawings (the archive tree can include non-drawing levels)
  if (level && !/drawing/.test(level)) return null;

  const ref = f['Reference number'] || '';
  const purpose = f['Purpose'] || '';
  const aspect = f['Aspect'] || '';
  const titleRaw = purpose || aspect;
  const title = stripTags(titleRaw).replace(/^\[\s*\d+\s*\]\s*/, '').trim() || aspect;

  const artist = cleanArtist(f['Hand'] || '', architect);
  const { medium, dimensions } = splitMediumDims(f['Medium and dimensions'] || '');
  const signed = f['Signed and dated'] || '';
  const year = pickYear(signed, purpose);
  const description = f['Notes'] || aspect || '';
  const imgUrl = bestImageUrl(html);

  return {
    target, sourceUrl: url, ref,
    title, artist, medium, dimensions,
    date: signed || (year != null ? String(year) : ''),
    year, description, aspect,
    level: f['Level'] || '', hand: f['Hand'] || '',
    imgUrl,
  };
}

// ---------- image: download largest derivative, autocrop→webp, upload R2 ----------
async function dl(url) {
  let lastErr;
  for (let att = 0; att < 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: ORIGIN + '/home' } });
      if (r.status === 404) throw new Error('404');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 2500) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) { lastErr = e; await sleep(500 * (att + 1)); }
  }
  throw lastErr;
}

// try high → fullview → web in turn (some records lack the high derivative)
async function fetchBestImage(imgUrl) {
  const variants = [imgUrl, imgUrl.replace('v0_high', 'v0_soane_fullview'), imgUrl.replace('v0_high', 'v0_web')];
  let lastErr;
  for (const v of [...new Set(variants)]) {
    try { return { buf: await dl(v), usedUrl: v }; } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

async function uploadR2(key, buffer) {
  for (let att = 0; att < 4; att++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      return true;
    } catch (e) { if (att === 3) throw e; await sleep(400 * (att + 1)); }
  }
}

async function processImage(rec) {
  const { buf, usedUrl } = await fetchBestImage(rec.imgUrl);
  const meta = await sharp(buf).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 400) throw new Error(`small ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(buf);   // webp 2048/q85, trim OFF by default
  const hash8 = sha(rec.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${rec.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null, usedUrl };
}

// ---------- record assembly (min-4 guard: title, artist, year, category) ----------
function makeId(rec) {
  const base = rec.ref ? rec.ref.replace(/[^A-Za-z0-9._-]+/g, '-') : rec.target;
  return `${SLUG}-${base}`.replace(/-+/g, '-').replace(/^-|-$/g, '');
}
function toArtwork(rec, imageUrl) {
  if (!rec.title || !rec.artist || rec.year == null) return null;   // category fixed = drawing
  return {
    id: makeId(rec),
    objectNumber: rec.ref || '',
    title: rec.title,
    artist: rec.artist,
    date: rec.date || '',
    year: rec.year,
    medium: rec.medium || '',
    dimensions: rec.dimensions || '',
    category: 'drawing',
    description: rec.description || '',
    imageUrl,
    thumbnailUrl: rec.imgUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: rec.sourceUrl,
    metadata: { referenceNumber: rec.ref || '', hand: rec.hand || '', level: rec.level || '', aspect: rec.aspect || '' },
    original_imageUrl: rec.imgUrl,
  };
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: "Sir John Soane's Museum",
    collection: 'Architectural & Other Drawings',
    website: 'https://collections.soane.org/drawings?ci_search_type=ARCI&mi_search_type=adv&sort=7&tn=Drawings&t=SCHEME472',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'html',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  const json = stem.endsWith('-pilot') ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
  fs.writeFileSync(out, json);
  console.log(`[write] ${out} (${artworks.length} works) breakdown=`, cats, `bytes=${json.length}`);
  return out;
}

const loadProgress = () => { try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { return { done: {} }; } };
const saveProgress = (p) => fs.writeFileSync(PROGRESS, JSON.stringify(p));

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });

  if (MODE === 'enumerate') {
    const targets = [];
    const total = await walkTree({ onTargets: async (ts) => { ts.forEach((t) => targets.push(t)); if (targets.length % 200 < ts.length) console.log(`  …${targets.length} drawing targets so far`); } });
    console.log(`\n[enumerate] TOTAL drawing detail-targets discovered = ${total} (unique=${new Set(targets).size})`);
    return;
  }

  if (MODE === 'pilot') {
    // collect a small batch of targets quickly (cap the tree walk), then run end-to-end + R2
    const targets = [];
    const seedArchitect = new Map();
    await walkTree({
      cap: PILOT_TARGET * 3,
      onTargets: async (ts, architect) => { ts.forEach((t) => { targets.push(t); seedArchitect.set(t, architect); }); },
    });
    const uniq = [...new Set(targets)].slice(0, PILOT_TARGET + 12);
    console.log(`[pilot] parsing up to ${uniq.length} detail pages (target ${PILOT_TARGET}) …`);
    const artworks = [];
    let parsed = 0, notDrawing = 0, dropMin4 = 0, imgErr = 0;
    for (const t of uniq) {
      if (artworks.length >= PILOT_TARGET) break;
      try {
        const rec = await parseDetail(t, seedArchitect.get(t) || '');
        await sleep(300);
        if (!rec) { notDrawing++; continue; }
        parsed++;
        rec.id = makeId(rec);
        if (!rec.imgUrl) { dropMin4++; console.log(`   drop(no-image) ${t}`); continue; }
        const { imageUrl, srcW, srcH } = await processImage(rec);
        const w = toArtwork(rec, imageUrl);
        if (!w) { dropMin4++; console.log(`   drop(min4) ${t} [t=${!!rec.title} a=${rec.artist || '-'} y=${rec.year}]`); continue; }
        artworks.push(w);
        console.log(`   ok ${w.id} | ${srcW}x${srcH} | ${w.artist.slice(0, 26)} | y=${w.year} | ${w.title.slice(0, 44)}`);
      } catch (e) { imgErr++; console.log(`   ERR ${t}: ${e.message}`); }
    }
    writeCollection(artworks, `${COLLECTION_STEM}-pilot`);
    console.log(`\n[pilot] DONE. collected=${artworks.length} parsed=${parsed} not-drawing=${notDrawing} min4/no-img-drops=${dropMin4} errors=${imgErr}`);
    return;
  }

  // ---- full ----
  const prog = loadProgress();
  const partFile = path.join(STATE_DIR, `${SLUG}-collected.ndjson`);
  const collected = [];
  if (fs.existsSync(partFile)) {
    for (const line of fs.readFileSync(partFile, 'utf8').split('\n')) {
      if (line.trim()) { try { collected.push(JSON.parse(line)); } catch {} }
    }
  }
  let done = Object.keys(prog.done).length, notDrawing = 0, dropMin4 = 0, imgErr = 0;

  // walk the tree; process each batch of targets as it arrives (resumable via prog.done)
  await walkTree({
    onTargets: async (targets, architect) => {
      for (const t of targets) {
        if (prog.done[t]) continue;
        try {
          const rec = await parseDetail(t, architect);
          await sleep(220);
          if (!rec) { prog.done[t] = 0; notDrawing++; continue; }
          rec.id = makeId(rec);
          if (!rec.imgUrl) { prog.done[t] = 0; dropMin4++; continue; }
          const { imageUrl } = await processImage(rec);
          const w = toArtwork(rec, imageUrl);
          if (!w) { prog.done[t] = 0; dropMin4++; }
          else { collected.push(w); fs.appendFileSync(partFile, JSON.stringify(w) + '\n'); prog.done[t] = 1; }
        } catch (e) {
          imgErr++;
          fs.appendFileSync(FAILED, JSON.stringify({ target: t, err: String(e.message || e) }) + '\n');
          prog.done[t] = 0;
        }
        if (++done % 50 === 0) { saveProgress(prog); console.log(`  …processed ${done} (ok ${collected.length}, not-drawing ${notDrawing}, drop ${dropMin4}, err ${imgErr})`); }
      }
      saveProgress(prog);
    },
  });
  saveProgress(prog);

  // de-dup by id
  const byId = new Map();
  for (const w of collected) byId.set(w.id, w);
  const artworks = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  writeCollection(artworks, COLLECTION_STEM);
  console.log(`\n[full] DONE. unique drawings=${artworks.length} not-drawing=${notDrawing} min4/no-img-drops=${dropMin4} errors=${imgErr}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
