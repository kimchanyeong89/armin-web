#!/usr/bin/env node
// Slovak National Gallery (Slovenská národná galéria, SNG — Bratislava) — collection scraper.
// Source: SNG's OWN digitization platform Webumenia (lab.SNG, open-source MIT). Public, UNAUTHENTICATED
//   Laravel REST API (the documented ES /api/* endpoint needs Basic auth → 401; this one does not).
//
// ENDPOINTS (no auth, no headers, JSON):
//   LIST/PAGINATE: GET https://www.webumenia.sk/api/v1/items?size=100&page=N
//     Laravel paginator {total,last_page,per_page,current_page,next_page_url,data:[{id,content:{…}}]}.
//     The LIST endpoint EMBEDS full content per item — NO N+1 detail fetch needed.
//   FILTERS (bracket syntax): filter[work_type]=maliarstvo|kresba|grafika ; filter[gallery]=Slovenská národná galéria, SNG
//     NB the gallery string MUST carry the ', SNG' suffix exactly, else it matches ~10 records.
//
// RECORD (content): id ('SVK:SNG.O_2735'), identifier (inv no 'O 2735'), author[] ('Guderna, Ladislav'
//   = Last, First — STORE RAW; 'Neznámy autor' = the source's own value for Unknown — keep, do NOT
//   rewrite to Anonymous), date_earliest (int year), dating (sk text), measurement[]
//   ('výška 62.5 cm, šírka 49.0 cm'), technique[] ('olej'/'akryl'/'kombinovaná technika'), medium[]
//   (support 'preglejka'/'kartón'/'papier'), work_type[] (HIERARCHICAL paths, see SCOPE), has_iip(bool),
//   images[] (JP2 master path '/SNGBA3/X800/SNG--…--L2_WEB.jp2'). All text is Slovak.
//
// SCOPE (museum's OWN work_type taxonomy — paths, not flat):
//   painting = work_type starts 'maliarstvo' → COLLECT ALL (no cap, no value filter; incl panel/altar/icon).
//   drawing  = 'kresba'  → VALUE FILTER: keep 'kresba/voľná' (autonomous) & bare 'kresba';
//              SKIP preparatory/study/sketch ('kresba/prípravná', '…/náčrt', 'kresba/štúdia').
//   print    = 'grafika' → VALUE FILTER: keep 'grafika/voľná' (autonomous) & bare 'grafika';
//              SKIP applied graphics ('grafika/úžitková*' = exlibris/book-illustration/applied).
//   Everything else (sculpture/object/decorative/photo/etc.) → OUT OF SCOPE.
//   (Per-scope SNG-only totals, tested via the API `total` field: maliarstvo 7,415; kresba 24,685;
//    grafika 15,564. Paintings collected whole; drawings/prints reduced to 'voľná' by the value filter.)
//
// IMAGES (full-size, tested 200): IIP server returns the JP2 master as JPEG.
//   https://www.webumenia.sk/fcgi-bin/iipsrv.fcgi?FIF={images[0]}&WID=2048&CVT=jpeg
//   (CVT=jpeg alone = 3976x5000 / 15 MB full master; WID=2048 asks the server to downscale to 2048px
//    wide → ~2048x2575, the size we keep.) webp re-encode q85 (autocrop trim is OFF by default).
//   R2 key: artworks/sng-bratislava-collection/{id}-{hash8}-imageUrl.webp
//   Source page per work: https://www.webumenia.sk/en/dielo/{id}
//
// RESUMABLE: --full persists processed ids + collected artworks to scripts/.state/sng-bratislava-progress.json
//   after each batch and skips processed ids on restart, so a multi-hour run can be re-invoked and continue.
//
// Usage:
//   node scripts/scrape-sng-bratislava.mjs --classify   # scope tally (totals + value-filter sample est), no images
//   node scripts/scrape-sng-bratislava.mjs --pilot      # ~20 in-scope, metadata only, NO R2 upload, write pilot JSON
//   node scripts/scrape-sng-bratislava.mjs --full        # full resumable scrape + R2 upload, write collection JSON
//   flags: --limit N (pilot record cap, default 20)

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

const SLUG = 'sng-bratislava';
const COLLECTION_STEM = `${SLUG}-collection`;
const API = 'https://www.webumenia.sk/api/v1/items';
const IIP = 'https://www.webumenia.sk/fcgi-bin/iipsrv.fcgi';
const GALLERY = 'Slovenská národná galéria, SNG'; // the ', SNG' suffix is mandatory
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const DATA_DIR = path.join(REPO, 'public/data');
const STATE_PATH = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED_PATH = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);
const PAGE_SIZE = 100;

// scope work_type filters to enumerate (museum's own taxonomy roots)
const WORK_TYPES = ['maliarstvo', 'kresba', 'grafika'];

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--pilot') ? 'pilot' : 'classify';
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? parseInt(args[i + 1], 10) : NaN; })();

const haveR2 = !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);
const s3 = (MODE === 'full' && haveR2) ? new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
}) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
// Slovak descriptions carry HTML entities (&scaron; &aacute; &nbsp; …). Decode named + numeric.
const decodeEntities = (s) => (s || '')
  .replace(/&scaron;/g, 'š').replace(/&Scaron;/g, 'Š').replace(/&aacute;/g, 'á').replace(/&Aacute;/g, 'Á')
  .replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú')
  .replace(/&yacute;/g, 'ý').replace(/&aelig;/g, 'æ').replace(/&ccaron;/g, 'č').replace(/&Ccaron;/g, 'Č')
  .replace(/&ncaron;/g, 'ň').replace(/&rcaron;/g, 'ř').replace(/&scedil;/g, 'ş').replace(/&tcaron;/g, 'ť')
  .replace(/&zcaron;/g, 'ž').replace(/&Zcaron;/g, 'Ž').replace(/&lstrok;/g, 'ł').replace(/&dstrok;/g, 'đ')
  .replace(/&ocirc;/g, 'ô').replace(/&auml;/g, 'ä').replace(/&ouml;/g, 'ö').replace(/&uuml;/g, 'ü')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘')
  .replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
  .replace(/&hellip;/g, '…').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/\s+/g, ' ').trim();

// ---------- fetch layer ----------
async function getPage(workType, page, size = PAGE_SIZE) {
  const url = `${API}?filter%5Bwork_type%5D=${encodeURIComponent(workType)}`
    + `&filter%5Bgallery%5D=${encodeURIComponent(GALLERY)}&size=${size}&page=${page}`;
  for (let att = 1; att <= 4; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { if (att === 4) throw new Error(`${e.message} @ ${url}`); await sleep(800 * att); }
  }
}

// Enumerate every record across the three scope work_types (paginated). De-dupe by content.id
// (a record tagged with several work_types could appear under more than one filter).
async function enumerateAll() {
  const byId = new Map();
  for (const wt of WORK_TYPES) {
    const first = await getPage(wt, 1);
    const total = first.total || 0;
    const lastPage = first.last_page || 1;
    console.log(`[enum] work_type=${wt}: total=${total}, pages=${lastPage} (size ${PAGE_SIZE})`);
    let page = 1, payload = first;
    while (true) {
      for (const row of (payload.data || [])) {
        const c = row.content || row;
        const id = String(c.id || row.id);
        if (id && !byId.has(id)) byId.set(id, c);
      }
      if (page >= lastPage) break;
      page++;
      // Webumenia caps deep pagination (~page 100 / 10k results) with HTTP 500. Retry a
      // transient blip, then STOP this work_type and move on rather than crashing the run.
      let next = null;
      for (let att = 1; att <= 3 && !next; att++) {
        try { next = await getPage(wt, page); }
        catch (e) { if (att === 3) console.log(`  ⚠️ ${wt}: stop at page ${page} (${e.message}) — API page cap`); else await sleep(800 * att); }
      }
      if (!next) break; // persistent failure → done with this work_type
      payload = next;
      await sleep(350); // polite ~3 req/s
      if (page % 25 === 0) console.log(`  …${wt} page ${page}/${lastPage} (unique so far ${byId.size})`);
    }
  }
  console.log(`[enum] total unique records across scope filters: ${byId.size}`);
  return [...byId.values()];
}

// Like enumerateAll but stops after `cap` unique records (for fast --pilot, avoids full 47k crawl).
async function enumerateSome(cap) {
  const byId = new Map();
  for (const wt of WORK_TYPES) {
    let page = 1;
    const first = await getPage(wt, 1);
    const lastPage = first.last_page || 1;
    let payload = first;
    while (true) {
      for (const row of (payload.data || [])) {
        const c = row.content || row;
        const id = String(c.id || row.id);
        if (id && !byId.has(id)) byId.set(id, c);
      }
      if (byId.size >= cap || page >= lastPage) break;
      page++; payload = await getPage(wt, page); await sleep(250);
    }
    if (byId.size >= cap) break;
  }
  return [...byId.values()];
}

// ---------- scope classifier (parse the work_type hierarchy) ----------
// → 'painting' | 'drawing' | 'print' | null(out-of-scope/value-filtered)
function scopeOf(content) {
  const wts = (content.work_type || []).map((w) => String(w).toLowerCase().normalize('NFC'));
  if (wts.length === 0) return null;

  // PAINTING — any 'maliarstvo*' branch. Collect ALL (no value filter).
  if (wts.some((w) => w === 'maliarstvo' || w.startsWith('maliarstvo/'))) return 'painting';

  // DRAWING — 'kresba'. Value filter: keep autonomous/free + bare; drop preparatory/study/sketch.
  const drawHit = wts.some((w) => w === 'kresba' || w.startsWith('kresba/'));
  if (drawHit) {
    // keep bare 'kresba' + any autonomous 'kresba/voľná*' branch (incl /akvarel, /karikatúra).
    const keep = wts.some((w) => w === 'kresba' || w === 'kresba/voľná' || w.startsWith('kresba/voľná/'));
    if (keep) return 'drawing';
    return null; // preparatory/study/sketch only (prípravná/náčrt/štúdia/úžitková) → value-filtered out
  }

  // PRINT — 'grafika'. Value filter: keep autonomous/free + bare; drop applied (úžitková).
  const printHit = wts.some((w) => w === 'grafika' || w.startsWith('grafika/'));
  if (printHit) {
    const keep = wts.some((w) => w === 'grafika' || w === 'grafika/voľná' || w.startsWith('grafika/voľná/'));
    if (keep) return 'print';
    return null; // grafika/úžitková* (exlibris, book illustration, applied) → value-filtered out
  }

  return null; // sculpture / decorative / object / photo / etc.
}

// ---------- content → ARMIN fields ----------
function fieldsFrom(content) {
  const id = String(content.id || '');
  const title = decodeEntities(content.title) || '';
  // author[] kept RAW ('Surname, Given'); 'Neznámy autor' (Unknown) is a real source value → keep.
  const artist = (content.author || []).map((a) => decodeEntities(a)).filter(Boolean).join('; ');
  const yEarly = content.date_earliest;
  const year = (yEarly === 0 || yEarly == null || yEarly === '') ? null : parseInt(yEarly, 10);
  const dateStr = (content.dating && decodeEntities(content.dating)) || (year != null ? String(year) : '');
  const dimensions = decodeEntities((content.measurement || [])[0] || '');

  // medium = technique ON support, deduped (support medium[] often re-lists the technique terms).
  const tech = (content.technique || []).map((t) => decodeEntities(t)).filter(Boolean);
  const support = (content.medium || []).map((m) => decodeEntities(m)).filter(Boolean)
    .filter((m) => !tech.map((t) => t.toLowerCase()).includes(m.toLowerCase()));
  let medium = '';
  if (tech.length && support.length) medium = `${tech.join(', ')} on ${support.join(', ')}`;
  else medium = (tech.length ? tech : support).join(', ');

  const objNo = String(content.identifier || '').trim();
  const imgPath = (content.images || [])[0] || null; // JP2 master path for IIP FIF
  const hasIip = !!content.has_iip && !!imgPath;
  // IIP: request a 2048px-wide JPEG re-render of the master (server-side downscale).
  const imgUrl = hasIip ? `${IIP}?FIF=${imgPath}&WID=2048&CVT=jpeg` : null;
  const sourceUrl = `https://www.webumenia.sk/en/dielo/${encodeURIComponent(id)}`;
  return { id, objNo, title, artist, year, dateStr, medium, dimensions, imgUrl, imgPath, sourceUrl };
}

// ---------- image: IIP full-size → webp → R2 ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
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

async function processImage(f) {
  const src = await dl(f.imgUrl); // 2048px JPEG from IIP
  const meta = await (await import('sharp')).default(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(src); // pure webp re-encode (q85/2048), trim OFF
  const hash8 = sha(f.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${f.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (min-4 guard) ----------
function toArtwork(f, category, imageUrl, src) {
  if (!f.title || !f.artist || f.year == null || !category) return null; // min-4 → drop
  return {
    id: f.id,
    objectNumber: f.objNo,
    title: f.title,
    artist: f.artist,
    date: f.dateStr || (f.year != null ? String(f.year) : ''),
    year: f.year,
    medium: f.medium,
    dimensions: f.dimensions,
    category,
    description: f.description || '',
    imageUrl,
    thumbnailUrl: f.imgUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: f.sourceUrl,
    metadata: { sng_id: f.id, inv_no: f.objNo, src_px: src && src.srcW && src.srcH ? `${src.srcW}x${src.srcH}` : '' },
    original_imageUrl: f.imgUrl,
  };
}

// ---------- state (resumable) ----------
function loadState() {
  if (fs.existsSync(STATE_PATH)) {
    try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch { /* fresh */ }
  }
  return { processed: [], artworks: [] };
}
function saveState(st) { fs.writeFileSync(STATE_PATH, JSON.stringify(st)); }

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Slovak National Gallery',
    collection: 'Collection',
    website: 'https://www.webumenia.sk/en',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'api',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(DATA_DIR, `${stem}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`[write] ${out} (${artworks.length} works) breakdown=`, cats);
  return out;
}

// ---------- classify mode: report per-scope totals + value-filter sample estimate (no full crawl) ----------
async function runClassify() {
  console.log('[classify] per-scope totals (SNG-only, from API `total` field) + value-filter sample:\n');
  let inScopeEst = 0;
  for (const wt of WORK_TYPES) {
    const first = await getPage(wt, 1);
    const total = first.total || 0;
    // sample up to ~600 to estimate the keep-ratio after value filter
    const sample = [];
    let page = 1, payload = first;
    while (sample.length < 600 && page <= (first.last_page || 1)) {
      for (const row of (payload.data || [])) sample.push(row.content || row);
      if (sample.length >= 600 || page >= (first.last_page || 1)) break;
      page++; payload = await getPage(wt, page); await sleep(250);
    }
    let kept = 0, dropMin4 = 0, noImg = 0;
    const keptWt = {}, dropWt = {};
    for (const c of sample) {
      const cat = scopeOf(c);
      const lbl = (c.work_type || ['(none)']).join('|');
      if (cat) {
        kept++; keptWt[lbl] = (keptWt[lbl] || 0) + 1;
        const f = fieldsFrom(c);
        if (!f.title || !f.artist || f.year == null) dropMin4++;
        if (!f.imgUrl) noImg++;
      } else { dropWt[lbl] = (dropWt[lbl] || 0) + 1; }
    }
    const keepRatio = sample.length ? kept / sample.length : 0;
    const est = Math.round(total * keepRatio);
    inScopeEst += est;
    console.log(`  ── work_type=${wt}: total=${total}`);
    console.log(`     sampled ${sample.length}: kept ${kept} (${(keepRatio * 100).toFixed(1)}%) → est in-scope ≈ ${est}`);
    console.log(`     of kept: min-4 drops ${dropMin4}, missing image ${noImg}`);
    console.log(`     KEPT work_type labels (sample):`, Object.fromEntries(Object.entries(keptWt).sort((a, b) => b[1] - a[1]).slice(0, 8)));
    if (Object.keys(dropWt).length) console.log(`     DROPPED work_type labels (sample):`, Object.fromEntries(Object.entries(dropWt).sort((a, b) => b[1] - a[1]).slice(0, 8)));
  }
  console.log(`\n[classify] TOTAL est in-scope after value filter ≈ ${inScopeEst}`);
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (MODE === 'classify') { await runClassify(); return; }

  // pilot: enumerate just enough; full: enumerate everything (resumable below)
  const pilotTarget = MODE === 'pilot' ? (Number.isFinite(LIMIT) ? LIMIT : 20) : Infinity;
  const records = MODE === 'pilot' ? await enumerateSome(pilotTarget * 4 + 60) : await enumerateAll();

  // scope-classify + build base fields
  const tally = {};
  const candidates = [];
  for (const c of records) {
    const cat = scopeOf(c);
    if (!cat) continue;
    tally[cat] = (tally[cat] || 0) + 1;
    const f = fieldsFrom(c);
    f.category = cat;
    f.description = decodeEntities(c.description || '');
    if (f.imgUrl) candidates.push(f); // need an image
  }
  console.log(`\n[${MODE}] in-scope candidates with image: ${candidates.length}  breakdown=`, tally);

  const st = MODE === 'full' ? loadState() : { processed: [], artworks: [] };
  const done = new Set(st.processed.map(String));
  const artworks = st.artworks.slice();
  let collected = artworks.length, dropMin4 = 0, imgErr = 0, processedThisRun = 0;

  const todo = candidates.filter((c) => !done.has(String(c.id)));
  console.log(`[${MODE}] already done ${done.size}, to process ${todo.length}, target ${pilotTarget === Infinity ? 'ALL' : pilotTarget}, R2 upload=${s3 ? 'ON' : 'OFF (metadata only)'}`);

  const CONC = MODE === 'pilot' ? 3 : 5;
  let idx = 0, stop = false;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (!stop && idx < todo.length) {
      if (collected >= pilotTarget) { stop = true; break; }
      const f = todo[idx++];
      try {
        let imageUrl = '', src = null;
        if (s3) { const r = await processImage(f); imageUrl = r.imageUrl; src = r; }
        // pilot (no R2): validate metadata only; leave imageUrl empty, keep thumbnail/original.
        const w = toArtwork(f, f.category, imageUrl, src);
        if (w) { artworks.push(w); collected++; } else { dropMin4++; }
        if (MODE === 'full') done.add(String(f.id));
      } catch (e) {
        imgErr++;
        fs.appendFileSync(FAILED_PATH, JSON.stringify({ id: f.id, title: f.title, err: String(e.message || e) }) + '\n');
        if (imgErr <= 8) console.log(`  img err id=${f.id}: ${e.message}`);
        if (MODE === 'full') done.add(String(f.id)); // don't retry persistently-bad records forever
      }
      processedThisRun++;
      await sleep(100);
      if (processedThisRun % 50 === 0) {
        console.log(`  …processed ${processedThisRun} (collected ${collected}, imgErr ${imgErr}, min4-drop ${dropMin4})`);
        if (MODE === 'full') saveState({ processed: [...done], artworks });
      }
    }
  }));

  artworks.sort((x, y) => String(x.id).localeCompare(String(y.id)));
  if (MODE === 'full') saveState({ processed: [...done], artworks });
  const stem = MODE === 'pilot' ? `${COLLECTION_STEM}-pilot` : COLLECTION_STEM;
  writeCollection(artworks, stem);
  console.log(`\n[${MODE}] DONE. collected ${artworks.length} | img errors ${imgErr} | min4-drops ${dropMin4}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
