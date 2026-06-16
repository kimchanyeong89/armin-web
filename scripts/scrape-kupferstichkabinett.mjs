#!/usr/bin/env node
// Kupferstichkabinett (Staatliche Museen zu Berlin) — works-on-paper scraper.
//
// SOURCE (museum-OWN infra, no auth on search): the SMB "recherche" Elasticsearch API.
//   POST https://api.smb.museum/search/?limit=100&offset=N&language=en
//        body {"q_advanced":[{"field":"collectionKey","operator":"AND","q":"KK*"}]}
//   → {offset, limit, total, objects:[{id, assets:[assetId], collection, collectionKey,
//        title, involvedParties:[ "Rolle: Name (1851 - 1933), Funktion" ],
//        dating:["nach 1898"], dateRange:"Von 01.01.1898 ... bis 31.12.1908",
//        materialAndTechnique:["Bleistift auf Papier"], dimensionsAndWeight:["Blattmaß: 58 x 45 cm"],
//        technicalTerm:"Zeichnung", highlight, permalink }]}
//   (German metadata; this is the Kupferstichkabinett's own catalogue record — detail-page-complete.)
//
// IMAGE (museum-OWN CDN): eMuseumPlus image service keyed by the ASSET id (assets[0]):
//   https://www.smb-digital.de/eMuseumPlus?service=ImageAsset&module=collection&objectId={ASSETID}&resolution=screen
//   → ~2500px JPEG. (Verified Phase A: 21/22 sampled assets resolve at 2295–2500px long-edge.)
//   NB: the recherche /images/{assetId} route is HTTP-Basic-Auth protected and NOT used.
//
// SCOPE: flat works on paper. Classify each record by parsing technicalTerm + the German
//   materialAndTechnique string. Drawings (Zeichnung) NEVER grayscale-gated. Reproductive
//   B&W prints are skipped at download via Hasler-Süsstrunk colorfulness<20 (drawings/photo/
//   collage never gated). Portrait miniatures (technicalTerm "Miniatur") are EXCLUDED.
//   Excluded too: pure books/autographs/ledger scans (Buch alone, Autograf, Erwerbungsbuch).
//
// CAP: the ES API has a hard offset ceiling of 25,000 (offset 24,900 OK, 25,000 → HTTP 500).
//   In-scope KK corpus is ~46k (Kupferstichkabinett physically ~500k, but ~46k digitized here),
//   well over the 25k JSON budget. We paginate the flat KK* query to the ceiling and take the
//   in-scope, image-bearing records — already a value-filtered, named-artist+dated set (artist
//   ~100%, year ~94%, image ~100% in Phase A sampling). JSON capped <24MB / ~25k records.
//
// Usage:
//   node scripts/scrape-kupferstichkabinett.mjs --probe   # ~15 in-scope end-to-end + R2, write probe JSON
//   node scripts/scrape-kupferstichkabinett.mjs --full    # full in-scope scrape + R2, write collection JSON

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

const SLUG = 'kupferstichkabinett';
const COLLECTION_STEM = `${SLUG}-collection`;
const SEARCH = 'https://api.smb.museum/search/';
const IMG = (assetId, res = 'screen') =>
  `https://www.smb-digital.de/eMuseumPlus?service=ImageAsset&module=collection&objectId=${assetId}&resolution=${res}`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'probe';
const PROBE_TARGET = 15;
const PAGE = 100;            // API caps limit at 100
const OFFSET_CEIL = 24900;   // last reachable offset (offset 25000 → HTTP 500)
const Q_KK = { q_advanced: [{ field: 'collectionKey', operator: 'AND', q: 'KK*' }] };
const RECORD_CAP = 25000;    // JSON budget (<24MB)
const CF_TH = 20;            // colorfulness < 20 ⇒ monochrome reproductive print → skip

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- search layer ----------
async function searchPage(offset) {
  const url = `${SEARCH}?limit=${PAGE}&offset=${offset}&language=en`;
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(Q_KK),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      return j;
    } catch (e) { if (att === 3) throw e; await sleep(500 * att); }
  }
}

// ---------- scope classifier (parse German technicalTerm + materialAndTechnique) ----------
// Returns: drawing | print | photograph | mixed_media_2d | manuscript  (in-scope)
//   or null (out of scope: portrait miniature, pure book/autograph/ledger, unknown).
function classify(tech, matArr) {
  const t = (tech || '').toLowerCase().normalize('NFC');
  const m = (matArr || []).join(' ').toLowerCase().normalize('NFC');

  // EXCLUDE — portrait miniature (locket/ivory/enamel decorative portraits) per scope guide.
  if (/\bminiatur\b/.test(t)) return null;
  // EXCLUDE — acquisition-ledger scans, plain autographs, plain books (no graphic work).
  if (/\bautograf\b/.test(t)) return null;
  if (/erwerbungsbuch/.test(t)) return null;
  if (/^buch$/.test(t.trim())) return null;

  // PHOTOGRAPH
  if (/fotografie|fotogra|lichtbild/.test(t) || /\bfoto\b|silbergelatine|gelatinesilber|albumin/.test(m)) return 'photograph';

  // COLLAGE / mixed flat
  if (/collage|montage/.test(t) || /collage|montage/.test(m)) return 'mixed_media_2d';

  // ILLUMINATED MANUSCRIPT / book painting
  if (/buchmalerei/.test(t)) return 'manuscript';

  // PRINT (Druck / named print techniques / "Buch / Holzschnitt")
  if (/druck|holzschnitt|kupferstich|radierung|lithografie|litho|siebdruck|serigrafie|stahlstich|schabkunst|mezzotinto|aquatinta|linolschnitt|offset/.test(t)) return 'print';
  if (/holzschnitt|kupferstich|radierung|lithografie|siebdruck|stahlstich|schabkunst|mezzotinto|aquatinta|linolschnitt/.test(m)
      && !/zeichnung/.test(t)) return 'print';

  // DRAWING (Zeichnung, incl. "Zeichnung / Seite", drawing media on paper)
  if (/zeichnung/.test(t)) return 'drawing';
  if (/bleistift|feder|kreide|kohle|rötel|rotel|pastell|aquarell|gouache|tusche|silberstift|bleigriffel|graphit/.test(m)) return 'drawing';

  // generic "Druck"/"Serie"/"Folge"/"Seite" with a print-ish medium → print, else drawing if paper-medium
  if (/serie|folge/.test(t) && /papier/.test(m)) return 'print';

  return null; // unknown → out of scope (conservative)
}

// Drawings / photos / collage / manuscript are NEVER grayscale-gated; only reproductive prints.
const gateGrayscale = (cat) => cat === 'print';

// ---------- German metadata parsers ----------
// involvedParties: ["Herstellung: Doris Raab (1851 - 1933), Stecher*in", "Franz von Defregger (...), Maler*in des Originals"]
// → keep the human NAME of each party, drop the "Rolle:" prefix, the "(dates)", and the function suffix.
//   Prefer the maker/creator parties; if none flagged, keep all.
const ROLE_PREFIX = /^(herstellung|entwurf|ausführung|ausfuehrung|verlag|druck|nach|inventor|zeichner\*?in|stecher\*?in|verleger\*?in)\s*:\s*/i;
function cleanPartyName(raw) {
  let s = (raw || '').trim();
  s = s.replace(ROLE_PREFIX, '');               // drop leading "Herstellung:" etc.
  s = s.split(',')[0];                            // drop ", Stecher*in" function suffix (name has no comma here)
  s = s.replace(/\([^)]*\)/g, '').trim();        // drop "(1851 - 1933)" life dates
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s;
}
function parseArtist(involvedParties) {
  const parties = (involvedParties || []).map((p) => ({ raw: p, name: cleanPartyName(p) })).filter((p) => p.name);
  if (!parties.length) return '';
  // Prefer original-creator / maker roles; fall back to all.
  const makerRe = /(maler\*?in des originals|zeichner\*?in|inventor|herstellung|entwurf|stecher\*?in)/i;
  const makers = parties.filter((p) => makerRe.test(p.raw));
  const chosen = (makers.length ? makers : parties).map((p) => p.name);
  // de-dupe, keep order
  return [...new Set(chosen)].join('; ');
}
function parseYear(dating, dateRange) {
  const fromDating = (dating || []).join(' ');
  let mm = fromDating.match(/\b(\d{3,4})\b/);
  if (mm) return parseInt(mm[1], 10);
  // dateRange: "Von 01.01.1898 n. Chr. bis 31.12.1908 n. Chr." → earliest year
  const dr = dateRange || '';
  mm = dr.match(/Von\s+\d{2}\.\d{2}\.(\d{3,4})/i) || dr.match(/\b(\d{3,4})\b/);
  return mm ? parseInt(mm[1], 10) : null;
}
const firstStr = (arr) => (Array.isArray(arr) ? (arr[0] || '') : (arr || '')).trim();

function parseRecord(o) {
  const assetId = (o.assets || [])[0] || null;
  const category = classify(o.technicalTerm, o.materialAndTechnique);
  return {
    id: String(o.id),
    assetId,
    objectNumber: o.identNumber || '',
    title: (o.title || '').trim(),
    artist: parseArtist(o.involvedParties),
    year: parseYear(o.dating, o.dateRange),
    dateStr: firstStr(o.dating) || (o.dateRange || ''),
    medium: firstStr(o.materialAndTechnique),
    dimensions: firstStr(o.dimensionsAndWeight),
    technicalTerm: o.technicalTerm || '',
    category,
    highlight: !!o.highlight,
    collectionKey: o.collectionKey || '',
    sourceUrl: o.permalink || `https://id.smb.museum/object/${o.id}`,
  };
}

// ---------- colorfulness on a buffer (Hasler-Süsstrunk; copy of curate-grayscale-prints.mjs) ----------
async function colorfulness(buf) {
  try {
    const { data } = await sharp(buf, { limitInputPixels: false })
      .resize(80, 80, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const rg = [], yb = [];
    for (let i = 0; i < data.length; i += 3) {
      const R = data[i], G = data[i + 1], B = data[i + 2];
      rg.push(R - G); yb.push(0.5 * (R + G) - B);
    }
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    const sd = (a) => { const mu = mean(a); return Math.sqrt(mean(a.map((v) => (v - mu) ** 2))); };
    return Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(mean(rg) ** 2 + mean(yb) ** 2);
  } catch { return -1; }
}

// ---------- image: download, gate grayscale prints, autocrop→webp, upload R2 ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ct = r.headers.get('content-type') || '';
      const buf = Buffer.from(await r.arrayBuffer());
      if (!ct.startsWith('image/')) throw new Error(`not-image (${ct || 'none'} ${buf.length}b)`);
      if (buf.length < 8000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) { if (att === 3) throw e; await sleep(600 * att); }
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

// returns { imageUrl, srcW, srcH } or { skip:'grayscale'|'thumb' }
async function processImage(a) {
  const src = await dl(IMG(a.assetId, 'screen'));
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) return { skip: 'thumb' };
  if (gateGrayscale(a.category)) {
    const cf = await colorfulness(src);
    if (cf >= 0 && cf < CF_TH) return { skip: 'grayscale' };
  }
  const { buffer } = await autocropToWebp(src);
  const hash8 = sha(IMG(a.assetId, 'screen')).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${SLUG}-${a.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (min-4 guard) ----------
function toArtwork(a, imageUrl) {
  if (!a.title || !a.artist || a.year == null || !a.category) return null;
  return {
    id: `${SLUG}-${a.id}`,
    objectNumber: a.objectNumber,
    title: a.title,
    artist: a.artist,
    date: a.dateStr || String(a.year),
    year: a.year,
    medium: a.medium,
    dimensions: a.dimensions,
    category: a.category,
    description: '',
    imageUrl,
    thumbnailUrl: IMG(a.assetId, 'screen'),
    onDisplay: false,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: { smb_id: a.id, asset_id: a.assetId, collectionKey: a.collectionKey, technicalTerm: a.technicalTerm, highlight: a.highlight },
    original_imageUrl: IMG(a.assetId, 'screen'),
  };
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Kupferstichkabinett (Staatliche Museen zu Berlin)',
    collection: 'Prints and Drawings',
    website: 'https://recherche.smb.museum/?language=en',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'api',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  const mb = (fs.statSync(out).size / 1048576).toFixed(1);
  console.log(`[write] ${out} (${artworks.length} works, ${mb} MB) breakdown=`, cats);
  return out;
}

// ---------- progress (resume) ----------
function loadProgress() { try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { return { offset: 0, done: {} }; } }
function saveProgress(p) { fs.writeFileSync(PROGRESS, JSON.stringify(p)); }

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });

  // ---- PROBE: pull a couple of pages, take first PROBE_TARGET in-scope, end-to-end ----
  if (MODE === 'probe') {
    const head = await searchPage(0);
    console.log(`[probe] KK* total reported by API = ${head.total}`);
    let pool = [];
    for (let off = 0; off <= 300 && pool.length < PROBE_TARGET * 3; off += PAGE) {
      const j = off === 0 ? head : await searchPage(off);
      pool.push(...(j.objects || []).map(parseRecord));
      await sleep(400);
    }
    const cand = pool.filter((a) => a.category && a.assetId && a.title && a.artist && a.year != null);
    console.log(`[probe] pulled ${pool.length} records | in-scope w/ image+min4 = ${cand.length}`);
    const artworks = []; let imgErr = 0, skipGray = 0, skipThumb = 0;
    for (const a of cand) {
      if (artworks.length >= PROBE_TARGET) break;
      try {
        const r = await processImage(a);
        if (r.skip === 'grayscale') { skipGray++; continue; }
        if (r.skip === 'thumb') { skipThumb++; continue; }
        const w = toArtwork(a, r.imageUrl);
        if (w) { artworks.push(w); console.log(`  ✓ ${w.id} [${w.category}] ${w.year} — ${w.artist.slice(0, 30)} — "${w.title.slice(0, 40)}" (${r.srcW}x${r.srcH})`); }
      } catch (e) { imgErr++; console.log(`  ✗ ${a.id}: ${e.message}`); }
      await sleep(300);
    }
    writeCollection(artworks, `${COLLECTION_STEM}-probe`);
    console.log(`\n[probe] DONE. ok=${artworks.length} imgErr=${imgErr} skipGray=${skipGray} skipThumb=${skipThumb}`);
    if (artworks.length < 10) { console.error('[probe] FAILED: <10 works assembled'); process.exit(1); }
    console.log('[probe] PASS');
    return;
  }

  // ---- FULL: paginate KK* to the offset ceiling, classify, image, R2 ----
  const prog = loadProgress();
  const head = await searchPage(0);
  console.log(`[full] KK* total = ${head.total} | offset ceiling ${OFFSET_CEIL} (max reachable ≈ ${OFFSET_CEIL + PAGE})`);

  // 1) gather all in-scope candidate records up to the ceiling (metadata only; cheap)
  const cand = [];
  for (let off = 0; off <= OFFSET_CEIL; off += PAGE) {
    const j = off === 0 ? head : await searchPage(off);
    const objs = j.objects || [];
    if (!objs.length) break;
    for (const o of objs) {
      const a = parseRecord(o);
      if (a.category && a.assetId && a.title && a.artist && a.year != null) cand.push(a);
    }
    if (off % 2000 === 0) console.log(`  …scanned offset ${off} | in-scope candidates so far ${cand.length}`);
    await sleep(280); // ~3.5 rps
  }
  // prioritize highlights first, then keep source order (named-artist+dated already)
  cand.sort((x, y) => (y.highlight === x.highlight ? 0 : y.highlight ? 1 : -1));
  console.log(`[full] in-scope candidates = ${cand.length} (capping image work at ${RECORD_CAP})`);

  // 2) image-process with concurrency, resume-aware, JSON cap
  const targets = cand.slice(0, RECORD_CAP + 4000); // headroom for skips/errors before hitting RECORD_CAP outputs
  const artworks = [];
  let done = 0, imgErr = 0, skipGray = 0, skipThumb = 0;
  const CONC = 4;
  let idx = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < targets.length && artworks.length < RECORD_CAP) {
      const a = targets[idx++];
      if (prog.done[a.id]) continue;
      try {
        const r = await processImage(a);
        if (r.skip === 'grayscale') { skipGray++; }
        else if (r.skip === 'thumb') { skipThumb++; }
        else {
          const w = toArtwork(a, r.imageUrl);
          if (w) artworks.push(w);
        }
        prog.done[a.id] = 1;
      } catch (e) {
        imgErr++;
        fs.appendFileSync(FAILED, JSON.stringify({ id: a.id, asset: a.assetId, err: String(e.message || e) }) + '\n');
        if (imgErr <= 8) console.log(`  img err ${a.id}: ${e.message}`);
      }
      if (++done % 200 === 0) { saveProgress(prog); console.log(`  …${done}/${targets.length} (ok ${artworks.length}, gray ${skipGray}, thumb ${skipThumb}, err ${imgErr})`); }
    }
  }));
  saveProgress(prog);

  artworks.sort((x, y) => Number(x.metadata.smb_id) - Number(y.metadata.smb_id));
  writeCollection(artworks, COLLECTION_STEM);
  console.log(`\n[full] DONE. collected ${artworks.length} | imgErr ${imgErr} | skipGray ${skipGray} | skipThumb ${skipThumb}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
