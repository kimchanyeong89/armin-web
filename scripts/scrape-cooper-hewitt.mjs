#!/usr/bin/env node
// Cooper Hewitt, Smithsonian Design Museum (New York) — collection scraper.
// Source: Smithsonian Open Access (museum-OWN, CC0). Unit code CHNDM.
//   PRIMARY = key-free AWS S3 open-data dump (line-delimited EDAN JSON), 256 hash shards:
//             https://smithsonian-open-access.s3-us-west-2.amazonaws.com/metadata/edan/chndm/{00..ff}.txt
//   (api.si.edu serves the same records but needs an api.data.gov key; the dump needs none.
//    Cooper Hewitt's own REST API / GitHub dumps are historic (~2016) — the SI dump is current.)
//
// SCOPE — FLAT works only. Cooper Hewitt is a design museum; we keep ONLY records in the
//   "Drawings, Prints, and Graphic Design Department" (setName). Textiles / Wallcoverings /
//   Product Design & Decorative Arts departments are 3D-or-pattern material → OUT.
//   Within DPGD, objectType is often a SUBJECT label ("figures", "architecture", "landscapes"),
//   so category is classified objectType → medium → title-prefix:
//     painting | drawing | print | photograph   (posters → "print" — single category, noted)
//   NO study/sketch title filter here: design studies ("Design for…", "Study of…") ARE this
//   museum's primary holdings, not subsidiary works. Portrait-miniature guard kept (none seen).
//   B&W REPRODUCTIVE PRINTS: category==='print' images with Hasler-Süsstrunk colorfulness < 20
//   are SKIPPED at download (no R2, no record). drawings/photographs/paintings are never gated.
//
// Metadata (same EDAN shape as scrape-hirshhorn.mjs):
//   title       descriptiveNonRepeating.title.content
//   artist      freetext.name[] — creator-role priority (Artist/Designer/Print Maker/… >
//               Attributed-to group > Publisher group), raw source strings kept (hirshhorn precedent)
//   date/year   freetext.date[0].content (+ indexedStructured.date fallback)
//   medium/dim  freetext.physicalDescription[] {label:Medium}{label:Dimensions}
//   objectNumber freetext.identifier[] {label:Accession Number}
//   id          "cooper-hewitt-" + descriptiveNonRepeating.record_ID  (e.g. cooper-hewitt-chndm_1921-6-241-102)
//   sourceUrl   descriptiveNonRepeating.record_link (collection.cooperhewitt.org) || guid (ark)
// Image: IIIF https://ids.si.edu/ids/iiif/{idsId}/full/2048,/0/default.jpg (native-capped) →
//   deliveryService → download.jpg fallbacks. ids.si.edu has an IP WAF (returns "Request
//   Rejected" HTML stubs) → gentle pacing + growing backoff, exactly like hirshhorn.
//
// CAP: in-scope min-4 candidates ≈ 24-27k (sampled). Hard cap 25,000 records (JSON < 24MB),
//   priority = real title > generic object-name title, then stable id order.
//
// Usage:
//   node scripts/scrape-cooper-hewitt.mjs --probe   # ~15 works end-to-end (R2 uploads) → public/data/cooper-hewitt-collection-probe.json
//   node scripts/scrape-cooper-hewitt.mjs --full    # all in-scope, resumable → public/data/cooper-hewitt-collection.json
// Resume state (--full): scripts/.state/cooper-hewitt-progress.json ({done:{id:status}})
//   + scripts/.state/cooper-hewitt-works.ndjson (append-only collected records)
//   failures → scripts/.state/cooper-hewitt-failed.ndjson

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

const SLUG = 'cooper-hewitt';
const COLLECTION_STEM = `${SLUG}-collection`;
const S3_BASE = 'https://smithsonian-open-access.s3-us-west-2.amazonaws.com/metadata/edan/chndm';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const WORKS_NDJSON = path.join(STATE_DIR, `${SLUG}-works.ndjson`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);
const CAP = 25000;
const GRAY_THRESHOLD = 20; // Hasler-Süsstrunk colorfulness; prints only

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'probe';
const PROBE_TARGET = 15;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- fetch layer ----------
async function fetchText(url) {
  for (let att = 1; att <= 4; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.status === 404) return '';
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { if (att === 4) throw e; await sleep(400 * att); }
  }
}

// ---------- scope + classification ----------
const DPGD_RE = /Drawings, Prints, and Graphic Design/;

const CREATOR_PRI = [
  /^(artist|designer|print maker|printmaker|engraver|etcher|draftsman|illustrator|photographer|calligrapher|maker|creator|architect|author|cartographer|lithographer)\b/i,
  /^(attributed to|after|circle of|studio of|possibly|probably|follower of|school of)\b/i,
  /^(publisher|manufacturer|company|printer)\b/i,
];
function pickArtist(names) {
  for (const re of CREATOR_PRI) {
    const hit = names.filter((n) => re.test(n.label || ''));
    if (hit.length) return hit.map((n) => String(n.content || '').trim()).filter(Boolean).join('; ');
  }
  return '';
}

// painting | drawing | print | photograph | null. Posters map to "print" (single category).
function classify(objType, title, medium) {
  const t = (objType || '').trim().toLowerCase();
  const ti = (title || '').toLowerCase();
  const med = (medium || '').toLowerCase();
  if (/\boil on\b|\btempera\b|\bacrylic on\b/.test(med)) return 'painting'; // rare oil sketches in DPGD
  if (/poster/.test(t) || /^poster\b/.test(ti)) return 'print';
  if (/photograph/.test(t) || /^photograph\b/.test(ti)) return 'photograph';
  if (/drawing/.test(t)) return 'drawing';
  if (/\b(print|engraving|playing card|greeting card|woodcut|etching|lithograph)\b/.test(t)) return 'print';
  // genre/subject objectTypes (figures, architecture, landscapes…) → medium decides
  if (/gelatin silver|albumen|salted paper|cyanotype|photograph/.test(med)) return 'photograph';
  if (/engrav|etch|lithograph|woodcut|aquatint|drypoint|mezzotint|screenprint|silkscreen|monotype|stipple|letterpress|offset|rotogravure|photogravure|printed/.test(med)) return 'print';
  if (/graphite|pen and|brush and|chalk|charcoal|crayon|pastel|watercolor|watercolour|gouache|ink|metalpoint|pencil|coal on/.test(med)) return 'drawing';
  if (/^print\b|^bound print\b/.test(ti)) return 'print';
  if (/^drawing\b|^design for\b|^study (of|for)\b|^sketch/.test(ti)) return 'drawing';
  return null; // albums-as-objects, devices, unclassifiable → out
}

// portrait-miniature guard only (no study/sketch filter — design studies are primary works here)
function miniatureSkip(medium, dimensions) {
  const med = String(medium || '').toLowerCase();
  if (!/\b(ivory|enamel|vellum)\b/.test(med) || /vellum\s+paper/.test(med)) return false;
  const nums = [...String(dimensions || '').matchAll(/([\d.]+)\s*cm/gi)].map((m) => parseFloat(m[1]));
  const longest = Math.max(0, ...nums);
  return longest > 0 && longest <= 14;
}

const yearFrom = (s) => { const m = String(s || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/); return m ? parseInt(m[1], 10) : null; };
const GENERIC_TITLE_RE = /^(print|bound print|drawing|photograph|playing card|greeting card|title page|poster)$/i;

// ---------- EDAN record → lite candidate ----------
function parseRecord(row) {
  const c = row.content || {};
  const ft = c.freetext || {};
  const dnr = c.descriptiveNonRepeating || {};
  const ix = c.indexedStructured || {};

  const sets = (ft.setName || []).map((s) => String(s.content || ''));
  if (!sets.some((s) => DPGD_RE.test(s))) return null; // not Drawings/Prints/Graphic Design dept → out

  const objType = (ft.objectType && ft.objectType[0] && ft.objectType[0].content) || '';
  const title = String((dnr.title && dnr.title.content) || row.title || '').trim();
  let medium = '', dimensions = '';
  for (const pd of (ft.physicalDescription || [])) {
    if (pd.label === 'Medium' && !medium) medium = String(pd.content || '').trim();
    else if (pd.label === 'Dimensions' && !dimensions) dimensions = String(pd.content || '').trim();
  }
  const category = classify(objType, title, medium);
  if (!category) return null;
  if (miniatureSkip(medium, dimensions)) return null;

  const artist = pickArtist((ft.name || []).filter(Boolean));
  const dateStr = (ft.date && ft.date[0] && String(ft.date[0].content || '').trim()) || '';
  const year = yearFrom(dateStr) ?? yearFrom((ix.date && ix.date[0]) || '');

  let objectNumber = '';
  for (const idd of (ft.identifier || [])) {
    if (idd.label === 'Accession Number') { objectNumber = String(idd.content || '').trim(); break; }
  }

  const recordId = String(dnr.record_ID || '').trim();
  if (!recordId) return null;
  const sourceUrl = String(dnr.record_link || '').trim() || String(dnr.guid || '').trim();

  const media = (dnr.online_media && dnr.online_media.media) || [];
  const imgCandidates = []; let thumbUrl = null;
  if (media.length) {
    const m0 = media[0];
    thumbUrl = m0.thumbnail || m0.content || null;
    const idsId = m0.idsId || '';
    const hires = (m0.resources || []).find((r) => r.label === 'High-resolution JPEG' && r.url);
    if (idsId) imgCandidates.push(`https://ids.si.edu/ids/iiif/${encodeURIComponent(idsId)}/full/2048,/0/default.jpg`);
    if (m0.content && !/_thumb\b/i.test(m0.content)) imgCandidates.push(m0.content); // deliveryService
    if (hires) imgCandidates.push(hires.url);                                        // download.jpg (often WAF-blocked)
  }

  // min-4 (title/artist/year/category) + image required
  if (!title || !artist || year == null || !imgCandidates.length) return null;

  return {
    id: `${SLUG}-${recordId}`, objectNumber, title, artist, year, dateStr, medium, dimensions,
    category, objType, imgCandidates, thumbUrl, sourceUrl,
    generic: GENERIC_TITLE_RE.test(title),
  };
}

// ---------- image: download → (prints) colorfulness gate → webp → R2 ----------
async function dl(url) {
  for (let att = 1; att <= 5; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ct = r.headers.get('content-type') || '';
      const buf = Buffer.from(await r.arrayBuffer());
      if (ct.includes('text/html') || buf.slice(0, 64).toString('latin1').includes('Request Rejected')) {
        await sleep(4000 * att); // IDS WAF cooldown grows: 4s,8s,…
        throw new Error('WAF-rejected (html stub)');
      }
      if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) { if (att === 5) throw e; await sleep(600 * att); }
  }
}

// Hasler-Süsstrunk colorfulness on a raw buffer (from scripts/audit/curate-grayscale-prints.mjs)
async function colorfulness(buf) {
  const sharp = (await import('sharp')).default;
  const { data } = await sharp(buf, { limitInputPixels: false }).resize(80, 80, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rg = [], yb = [];
  for (let i = 0; i < data.length; i += 3) { const R = data[i], G = data[i + 1], B = data[i + 2]; rg.push(R - G); yb.push(0.5 * (R + G) - B); }
  const m = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => { const mu = m(a); return Math.sqrt(m(a.map((v) => (v - mu) ** 2))); };
  return Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(m(rg) ** 2 + m(yb) ** 2);
}

async function uploadR2(key, buffer) {
  for (let att = 1; att <= 4; att++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      return true;
    } catch (e) { if (att === 4) throw e; await sleep(400 * att); }
  }
}

// returns {imageUrl, usedUrl} | {graySkip:true} | throws
async function processImage(a) {
  const sharp = (await import('sharp')).default;
  let src = null, usedUrl = null, lastErr = null;
  for (const url of a.imgCandidates) {
    try { src = await dl(url); usedUrl = url; break; } catch (e) { lastErr = e; }
  }
  if (!src) throw lastErr || new Error('no image candidate fetched');
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 300) throw new Error(`too small ${meta.width}x${meta.height}`);
  if (a.category === 'print') {                       // B&W reproductive-print gate (prints ONLY)
    const cf = await colorfulness(src);
    if (cf >= 0 && cf < GRAY_THRESHOLD) return { graySkip: true, cf };
  }
  const { buffer } = await autocropToWebp(src);       // trim OFF by default → pure webp(2048/q85)
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${sha(usedUrl).slice(0, 8)}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, usedUrl };
}

function toArtwork(a, imageUrl, usedUrl) {
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
    thumbnailUrl: a.thumbUrl || '',
    onDisplay: false,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: { unit_code: 'CHNDM', object_type: a.objType, license: 'CC0', department: 'Drawings, Prints, and Graphic Design' },
    original_imageUrl: usedUrl,
  };
}

function writeCollection(artworks, file) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Cooper Hewitt, Smithsonian Design Museum',
    collection: 'Drawings, Prints, and Graphic Design (Open Access)',
    website: 'https://collection.cooperhewitt.org/',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'open-data-dump',
    license: 'CC0',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', file);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`[write] ${out} (${artworks.length} works) breakdown=`, cats);
}

// ---------- shard streaming ----------
async function* shardCandidates(fromShard = 0, toShard = 255) {
  for (let i = fromShard; i <= toShard; i++) {
    const h = i.toString(16).padStart(2, '0');
    const txt = await fetchText(`${S3_BASE}/${h}.txt`);
    await sleep(80);
    const out = [];
    let total = 0;
    for (const line of (txt || '').split('\n')) {
      const s = line.trim();
      if (!s) continue;
      total++;
      try { const cand = parseRecord(JSON.parse(s)); if (cand) out.push(cand); } catch { /* skip bad line */ }
    }
    yield { shard: h, index: i, total, candidates: out };
  }
}

// ---------- progress (full mode) ----------
function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { return { done: {} }; }
}
function loadWorks() {
  const works = [];
  try {
    for (const l of fs.readFileSync(WORKS_NDJSON, 'utf8').split('\n')) { const s = l.trim(); if (s) works.push(JSON.parse(s)); }
  } catch { /* none yet */ }
  return works;
}

async function runQueue(candidates, { onWork, progress, saveEvery = 200 }) {
  const CONC = 3, STAGGER = 400; // ≈2.5-3 rps against IDS (WAF-gentle)
  let idx = 0, done = 0, ok = 0, gray = 0, err = 0, dirty = 0;
  const saveProgress = () => { if (progress) fs.writeFileSync(PROGRESS, JSON.stringify(progress)); };
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < candidates.length) {
      const a = candidates[idx++];
      await sleep(STAGGER);
      try {
        const res = await processImage(a);
        if (res.graySkip) {
          gray++;
          if (progress) progress.done[a.id] = 'gray';
        } else {
          ok++;
          const w = toArtwork(a, res.imageUrl, res.usedUrl);
          onWork(w);
          if (progress) progress.done[a.id] = 'ok';
        }
      } catch (e) {
        err++;
        if (progress) progress.done[a.id] = 'fail';
        fs.appendFileSync(FAILED, JSON.stringify({ id: a.id, url: a.imgCandidates[0], err: String(e.message || e) }) + '\n');
        if (err <= 5) console.log(`  img err id=${a.id}: ${e.message}`);
      }
      if (progress && ++dirty >= saveEvery) { dirty = 0; saveProgress(); }
      if (++done % 100 === 0) console.log(`  …${done}/${candidates.length} (ok ${ok}, graySkip ${gray}, err ${err})`);
    }
  }));
  if (progress) saveProgress();
  return { ok, gray, err };
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });

  if (MODE === 'probe') {
    console.log(`[probe] gathering candidates from shards until ${PROBE_TARGET} works collected …`);
    const works = [];
    let stats = { ok: 0, gray: 0, err: 0 }, shardsUsed = 0, candSeen = 0;
    for await (const { shard, total, candidates } of shardCandidates()) {
      shardsUsed++;
      candSeen += candidates.length;
      console.log(`[probe] shard ${shard}: ${candidates.length}/${total} in-scope candidates`);
      const need = candidates.slice(0, (PROBE_TARGET - works.length) * 2); // headroom for gray-skips/fails
      const r = await runQueue(need, { onWork: (w) => works.push(w) });
      stats = { ok: stats.ok + r.ok, gray: stats.gray + r.gray, err: stats.err + r.err };
      if (works.length >= PROBE_TARGET || shardsUsed >= 6) break;
    }
    writeCollection(works.slice(0, PROBE_TARGET), `${COLLECTION_STEM}-probe.json`);
    console.log(`[probe] DONE. works=${works.length} graySkip=${stats.gray} err=${stats.err} (shards used: ${shardsUsed}, candidates seen: ${candSeen})`);
    return;
  }

  // ---- full ----
  console.log('[full] streaming all 256 shards …');
  const all = new Map(); // id → candidate (dedupe)
  let totalRecords = 0;
  for await (const { index, total, candidates } of shardCandidates()) {
    totalRecords += total;
    for (const c of candidates) all.set(c.id, c);
    if ((index + 1) % 32 === 0) console.log(`  …shards ${index + 1}/256 (records ${totalRecords}, candidates ${all.size})`);
  }
  // priority: real titles first, then generic object-name titles; stable id order within groups
  let candidates = [...all.values()].sort((x, y) =>
    (x.generic === y.generic) ? String(x.id).localeCompare(String(y.id)) : (x.generic ? 1 : -1));
  console.log(`[full] ${totalRecords} CHNDM records → ${candidates.length} in-scope min-4 candidates`);
  if (candidates.length > CAP) { console.log(`[full] capping ${candidates.length} → ${CAP} (real-title priority)`); candidates = candidates.slice(0, CAP); }

  const progress = loadProgress();
  const works = loadWorks();
  const have = new Set(works.map((w) => w.id));
  const todo = candidates.filter((c) => !progress.done[c.id] && !have.has(c.id));
  console.log(`[full] resume: ${works.length} works already collected, ${Object.keys(progress.done).length} marked done → ${todo.length} to process`);

  const r = await runQueue(todo, {
    onWork: (w) => { works.push(w); fs.appendFileSync(WORKS_NDJSON, JSON.stringify(w) + '\n'); },
    progress,
  });

  works.sort((x, y) => String(x.id).localeCompare(String(y.id)));
  writeCollection(works, `${COLLECTION_STEM}.json`);
  console.log(`[full] DONE. collected ${works.length} | graySkip ${r.gray} | errors ${r.err}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
