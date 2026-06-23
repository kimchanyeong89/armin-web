#!/usr/bin/env node
// Nationalmuseum Sweden (Stockholm) — collection scraper for the DESIGN genre.
// Source: museum-OWN open API (no auth) + museum-OWN IIIF image host.
//   List:   GET https://api.nationalmuseum.se/api/objects?page=P&limit=100
//   Object: GET https://api.nationalmuseum.se/api/objects/{id}
//   Image:  {object.iiif}full/full/0/default.jpg   (nationalmuseumse.iiifhosting.com, IIPImage)
//
// SCOPE (flat works only). The museum's `category.en` looks like "Leaf (PARENT)".
//   The PARENT group (in parentheses) is the reliable scope signal:
//     (Teckningar…/Ritningar…)  -> drawing   IN   (design/architecture/ornament drawings, studies, sketches, illustrations)
//     (Grafik)                   -> print     IN   (etchings/engravings/lithographs/ornament prints/posters)
//     (Måleri)                   -> painting  IN
//     (Fotografier…)             -> photograph IN
//     (Konsthtv, konstind, ind.design …) -> 3D applied/industrial-design OBJECTS -> OUT
//          EXCEPTION: leaf is itself a DRAWING for design (e.g. "Ritningar för industridesign (Teckningar/Ritningar)")
//          is already caught by its (Teckningar/Ritningar) parent, so plain (Konsthtv…) = 3D object = OUT.
//     (Skulptur)                 -> sculpture -> OUT
//   This cleanly separates flat DESIGN DRAWINGS (in) from photographed 3D design products (out),
//   which is exactly what the design genre wants.
//
//   DESIGN PRIORITY: drawing + print are prioritized (this is a design-genre fill); paintings/photographs
//   are kept too (any in-scope flat work is fine) but appear after design works in the cap order.
//
//   miniature: category leaf "Miniatyrer" (portrait miniatures) is EXCLUDED (guide §1).
//   grayscale reproductive prints: skipped at download time via colorfulness()<20 for `print`
//     ONLY when the leaf marks it reproductive (Reproduktionsgrafik). Drawings never colour-gated;
//     original prints (etchings/posters) kept even if monochrome (low-value filter targets repro only).
//
// CAP: in-scope >25k -> prioritize named+dated, write COMPACT JSON, stop near JSON_CAP_BYTES (<23MB).
//
// Usage:
//   node scripts/scrape-nationalmuseum-se.mjs --classify        # dry-run: scan all pages, scope tally (no images)
//   node scripts/scrape-nationalmuseum-se.mjs --probe           # ~15 in-scope works end-to-end + R2 upload
//   node scripts/scrape-nationalmuseum-se.mjs --full            # full in-scope, resumable, R2 upload, compact JSON

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
require('dotenv').config({ path: path.join(REPO, '.env.local') });

const SLUG = 'nationalmuseum-se';
const COLLECTION_STEM = `${SLUG}-collection`;
const API = 'https://api.nationalmuseum.se/api/objects';
const UA = 'armin-museum-research/1.0';
const IMG_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);
const OUT_JSON = (stem) => path.join(REPO, 'public/data', `${stem}.json`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--probe') ? 'probe' : 'classify';
const PROBE_TARGET = 15;
const PAGE_LIMIT = 100;
const JSON_CAP_BYTES = 23 * 1024 * 1024;       // hard cap <23MB
const SOURCE_DETAIL = (id) => `https://collection.nationalmuseum.se/eMP/eMuseumPlus?service=ExternalInterface&module=collection&objectId=${id}&viewType=detailView`;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- scope classifier (parse Swedish "Leaf (PARENT)") ----------
// Return one of: drawing | print | painting | photograph  (in-scope)  OR null (out).
// `priority`: lower sorts first when capping (design first).
function classify(catEn, catSv) {
  const c = (catEn || catSv || '').trim();
  if (!c) return null;
  const lc = c.toLowerCase();

  // explicit EXCLUDE leaves regardless of parent
  if (/^miniatyrer\b/.test(lc)) return null;                          // portrait miniatures (guide §1)

  // parent group in parentheses is the scope signal
  const pm = c.match(/\(([^)]*)\)\s*$/);
  const parent = (pm ? pm[1] : c).toLowerCase();

  // OUT: applied/industrial-design 3D objects, sculpture, photographic positives of objects, maps, etc.
  if (/skulptur/.test(parent)) return null;
  // (Konsthtv, konstind, ind.design …) without a Teckningar/Grafik/Måleri parent = 3D object
  const isDrawingParent = /teckningar|ritningar|frihandsteckningar/.test(parent);
  const isPrintParent = /grafik/.test(parent);
  const isPaintingParent = /måleri|maleri/.test(parent);
  const isPhotoParent = /fotografier/.test(parent);

  if (isDrawingParent) return { category: 'drawing', priority: 0 };   // design/arch/ornament drawings, studies, sketches, illustrations
  if (isPrintParent) {
    // reproductive prints flagged by leaf -> mark for colour-gate; original/ornament prints not gated
    const repro = /^reproduktionsgrafik\b/.test(lc);
    return { category: 'print', priority: 1, repro };
  }
  if (isPaintingParent) return { category: 'painting', priority: 3 };
  if (isPhotoParent) return { category: 'photograph', priority: 2 };
  return null; // applied art / object / unknown -> OUT
}

// ---------- colorfulness (Hasler-Süsstrunk) for reproductive-print colour gate ----------
function colorfulnessFromBuffer(buf) {
  return sharp(buf, { limitInputPixels: false })
    .resize(80, 80, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    .then(({ data }) => {
      const rg = [], yb = [];
      for (let i = 0; i < data.length; i += 3) { const R = data[i], G = data[i + 1], B = data[i + 2]; rg.push(R - G); yb.push(0.5 * (R + G) - B); }
      const m = (a) => a.reduce((s, v) => s + v, 0) / a.length;
      const sd = (a) => { const mu = m(a); return Math.sqrt(m(a.map((v) => (v - mu) ** 2))); };
      return Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(m(rg) ** 2 + m(yb) ** 2);
    }).catch(() => -1);
}

// ---------- API fetch ----------
async function fetchJson(url, ua = UA) {
  for (let att = 1; att <= 4; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': ua } });
      if (r.status === 429) { await sleep(2000 * att); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { if (att === 4) throw e; await sleep(500 * att); }
  }
}

function pickEn(o) { if (!o) return null; return o.en || o.sv || o.de || null; }

// list item -> normalized record (list items already carry full metadata incl. iiif/category/actors/dating)
function parseItem(it) {
  const cls = classify(pickEn(it.category), (it.category || {}).sv);
  if (!cls) return null;
  const iiif = it.iiif;
  if (!iiif) return null;                                    // no image -> skip

  const title = (pickEn(it.title) || '').trim();
  // skip records the museum flagged for deletion / errors (Swedish: "RADERAS", "raderas/fel", "makuleras")
  if (/\bRADERAS\b|raderas\s*\/?\s*fel|^\s*makuleras\b/i.test(title)) return null;
  const actors = (it.actors || []).map((a) => (a.actor_full_name || [a.actor_given_name, a.actor_surname].filter(Boolean).join(' ')).trim()).filter(Boolean);
  const artist = actors.join('; ');

  const dating = (it.dating || [])[0] || {};
  let year = null;
  if (Number.isInteger(dating.date_earliest) && dating.date_earliest > 0) year = dating.date_earliest;
  const dateStr = (pickEn(dating.date) || '').trim() || (year != null ? String(year) : '');

  const medium = (pickEn(it.technique_material) || '').trim();
  const dim = (it.dimensions || [])
    .map((d) => {
      const vals = [d.value_1, d.value_2, d.value_3].filter((v) => v != null && v !== 0);
      if (d.description && /[a-zA-Z]/.test(d.description) && !vals.length) return d.description;
      if (!vals.length) return null;
      const labels = (d.type || '').split(/\s*x\s*/);
      return vals.map((v, i) => `${labels[i] ? labels[i] + ' ' : ''}${v}${d.unit ? ' ' + d.unit : ''}`).join(' × ');
    })
    .filter(Boolean).join('; ');

  const objNum = (it.inventory_number || '').trim();
  return {
    id: `${SLUG}-${it.id}`,
    rawId: it.id,
    objectNumber: objNum,
    title,
    artist,
    year,
    dateStr,
    medium,
    dimensions: dim,
    category: cls.category,
    priority: cls.priority,
    repro: !!cls.repro,
    iiif,
    imgUrl: `${iiif.replace(/\/$/, '')}/full/full/0/default.jpg`,
    sourceUrl: SOURCE_DETAIL(it.id),
    license: it.iiif_license || null,
  };
}

// ---------- crawl all list pages, collect in-scope candidates ----------
async function crawlCandidates(limit = Infinity) {
  const first = await fetchJson(`${API}?page=1&limit=${PAGE_LIMIT}`);
  const totalPages = first.data.paging.total_pages;
  const grandTotal = first.data.paging.total;
  console.log(`[crawl] total objects=${grandTotal} pages=${totalPages}`);
  const cands = [];
  const tally = {};
  let scanned = 0;
  for (let page = 1; page <= totalPages; page++) {
    let data;
    if (page === 1) data = first; else data = await fetchJson(`${API}?page=${page}&limit=${PAGE_LIMIT}`);
    for (const it of data.data.items) {
      scanned++;
      const rec = parseItem(it);
      if (rec) { cands.push(rec); tally[rec.category] = (tally[rec.category] || 0) + 1; }
    }
    if (page % 50 === 0) console.log(`  …page ${page}/${totalPages} scanned=${scanned} candidates=${cands.length}`);
    if (cands.length >= limit) { console.log(`  [crawl] reached limit ${limit}, stopping early`); break; }
    await sleep(120);
  }
  return { cands, tally, grandTotal, scanned };
}

// ---------- image: download IIIF full, verify size, colour-gate repro prints, upload webp to R2 ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': IMG_UA } });
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

// returns { imageUrl } or throws; returns null if colour-gated (skip silently)
async function processImage(rec) {
  const src = await dl(rec.imgUrl);
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`);
  if (rec.repro) {                                          // grayscale gate for reproductive prints only
    const cf = await colorfulnessFromBuffer(src);
    if (cf >= 0 && cf < 20) return { skipped: 'grayscale-repro' };
  }
  const webp = await sharp(src, { limitInputPixels: false }).resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  const hash8 = sha(rec.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${rec.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, webp);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (min-4 guard) ----------
function toArtwork(rec, imageUrl) {
  if (!rec.title || !rec.artist || rec.year == null || !rec.category) return null;
  return {
    id: rec.id,
    objectNumber: rec.objectNumber || '',
    title: rec.title,
    artist: rec.artist,
    date: rec.dateStr || (rec.year != null ? String(rec.year) : ''),
    year: rec.year,
    medium: rec.medium || '',
    dimensions: rec.dimensions || '',
    category: rec.category,
    description: '',
    imageUrl,
    thumbnailUrl: rec.imgUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: rec.sourceUrl,
    metadata: {
      nm_id: rec.rawId,
      iiif: rec.iiif,
      ...(rec.license && (rec.license.creditline || rec.license.copyright) ? { credit: rec.license.creditline || rec.license.copyright } : {}),
    },
    original_imageUrl: rec.imgUrl,
  };
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Nationalmuseum',
    collection: 'Design, Drawings & Prints',
    website: 'https://www.nationalmuseum.se/en/explore-art-and-design/the-collections',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'api',
    category_breakdown: cats,
    artworks,
  };
  const out = OUT_JSON(stem);
  const json = MODE === 'full' ? JSON.stringify(payload) : JSON.stringify(payload, null, 2);  // compact for full
  fs.writeFileSync(out, json);
  console.log(`[write] ${out} (${artworks.length} works, ${(json.length / 1048576).toFixed(2)}MB) breakdown=`, cats);
  return out;
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });

  if (MODE === 'classify') {
    const { cands, tally, grandTotal, scanned } = await crawlCandidates();
    console.log(`\n[classify] scanned=${scanned} grandTotal=${grandTotal}`);
    console.log(`[classify] in-scope WITH image: ${cands.length}`);
    console.log('[classify] breakdown:', tally);
    const named = cands.filter((c) => c.artist).length;
    const dated = cands.filter((c) => c.year != null).length;
    const namedDated = cands.filter((c) => c.artist && c.year != null).length;
    console.log(`[classify] named=${named} dated=${dated} named+dated=${namedDated}`);
    return;
  }

  if (MODE === 'probe') {
    // crawl enough candidates to span the drawing/print clusters, prioritizing design (drawing/print)
    const { cands } = await crawlCandidates(4000);           // deep enough to include design drawings
    cands.sort((a, b) => a.priority - b.priority || (b.artist ? 1 : 0) - (a.artist ? 1 : 0));
    // ensure category variety in the probe set
    const pick = [];
    const perCat = {};
    for (const c of cands) {
      if (!c.artist || c.year == null) continue;             // probe only well-formed records
      perCat[c.category] = (perCat[c.category] || 0);
      if (perCat[c.category] >= 6 && pick.length >= PROBE_TARGET) continue;
      pick.push(c); perCat[c.category]++;
      if (pick.length >= PROBE_TARGET + 4) break;
    }
    const probe = pick.slice(0, PROBE_TARGET + 4);
    console.log(`\n[probe] processing ${probe.length} candidates → R2 …`);
    const artworks = [];
    let imgErr = 0, gated = 0;
    for (const rec of probe) {
      try {
        const res = await processImage(rec);
        if (res.skipped) { gated++; console.log(`  [gate] ${rec.id} ${res.skipped}`); continue; }
        const w = toArtwork(rec, res.imageUrl);
        if (w) { artworks.push(w); console.log(`  ok ${rec.id} [${rec.category}] ${res.srcW}x${res.srcH} "${rec.title.slice(0, 40)}" — ${rec.artist.slice(0, 30)} (${rec.year})`); }
      } catch (e) { imgErr++; console.log(`  ERR ${rec.id}: ${e.message}`); }
      if (artworks.length >= PROBE_TARGET) break;
      await sleep(200);
    }
    writeCollection(artworks, `${COLLECTION_STEM}-probe`);
    console.log(`\n[probe] DONE collected=${artworks.length} imgErr=${imgErr} colourGated=${gated}`);
    return;
  }

  // ---------- full ----------
  // resumable: progress holds the candidate list (snapshot) + done set + collected artworks
  let state = { cands: null, doneIds: [], artworks: [] };
  if (fs.existsSync(PROGRESS)) {
    state = JSON.parse(fs.readFileSync(PROGRESS, 'utf8'));
    console.log(`[resume] loaded progress: ${state.artworks.length} collected, ${state.doneIds.length} processed`);
  }
  if (!state.cands) {
    const { cands, tally, grandTotal } = await crawlCandidates();
    console.log(`[full] grandTotal=${grandTotal} in-scope-with-image=${cands.length}`, tally);
    // cap order: design first (priority), then named+dated, then named, then rest
    cands.sort((a, b) =>
      a.priority - b.priority ||
      ((b.artist && b.year != null ? 1 : 0) - (a.artist && a.year != null ? 1 : 0)) ||
      ((b.artist ? 1 : 0) - (a.artist ? 1 : 0)) ||
      (b.year != null ? 1 : 0) - (a.year != null ? 1 : 0)
    );
    state.cands = cands;
    fs.writeFileSync(PROGRESS, JSON.stringify(state));
  }
  const done = new Set(state.doneIds);
  const queue = state.cands.filter((c) => !done.has(c.id) && c.artist && c.year != null); // min-4: require named+dated
  console.log(`[full] queue=${queue.length} (skipping already-done ${done.size})`);

  let imgErr = 0, gated = 0, sinceFlush = 0;
  const CONC = 5;
  let idx = 0;
  let capped = false;
  const estBytes = () => JSON.stringify({ artworks: state.artworks }).length;

  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < queue.length && !capped) {
      const rec = queue[idx++];
      try {
        const res = await processImage(rec);
        done.add(rec.id);
        if (res.skipped) { gated++; }
        else {
          const w = toArtwork(rec, res.imageUrl);
          if (w) state.artworks.push(w);
        }
      } catch (e) {
        imgErr++;
        fs.appendFileSync(FAILED, JSON.stringify({ id: rec.id, url: rec.imgUrl, err: String(e.message || e) }) + '\n');
        done.add(rec.id); // do not retry forever; logged
      }
      if (++sinceFlush >= 100) {
        sinceFlush = 0;
        state.doneIds = [...done];
        fs.writeFileSync(PROGRESS, JSON.stringify(state));
        const mb = estBytes() / 1048576;
        console.log(`  …processed ${idx}/${queue.length} collected=${state.artworks.length} imgErr=${imgErr} gated=${gated} ~${mb.toFixed(1)}MB`);
        if (estBytes() > JSON_CAP_BYTES) { capped = true; console.log(`  [cap] reached ${JSON_CAP_BYTES} bytes — stopping (design+named+dated prioritized)`); }
      }
    }
  }));

  state.doneIds = [...done];
  fs.writeFileSync(PROGRESS, JSON.stringify(state));
  state.artworks.sort((a, b) => a.id.localeCompare(b.id));
  writeCollection(state.artworks, COLLECTION_STEM);
  console.log(`\n[full] DONE collected=${state.artworks.length} imgErr=${imgErr} colourGated=${gated} capped=${capped}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
