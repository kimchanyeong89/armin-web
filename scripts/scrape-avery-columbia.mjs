#!/usr/bin/env node
// Avery Architectural & Fine Arts Library (Columbia University) — collection scraper.
// Source: Columbia University Libraries Digital Library Collections (DLC), the parent
//   university library's OWN Blacklight (Hyacinth/Fedora) catalogue, no auth.
//     Search JSON:API : https://dlc.library.columbia.edu/catalog.json?f[...]=...&page=P&per_page=N
//     Facet  JSON     : https://dlc.library.columbia.edu/catalog/facet/{field}.json  ({response.facets.items})
//     Item   doc JSON : https://dlc.library.columbia.edu/catalog/{id}.json           ({response.document})
//     IIIF v3 manifest: linked from item HTML; image service = triclops.library.columbia.edu
//
// SCOPE (architecture → FLAT works only): architectural drawings, plans/elevations/sections,
//   renderings, sketches, and architectural PHOTOGRAPHS — plus the small flat tail Avery files
//   as drawings / watercolors / pictures / illustrations / prints. 3D models/maquettes are OUT
//   (Avery format "models (representations)", "sculpture", "architectural elements", "objects").
//   We constrain repository = "Avery Library" AND format ∈ IN_SCOPE_FORMATS, and keep only items
//   that actually resolve an online IIIF image (catalogue-only metadata records are skipped).
//
// IMAGE PIPELINE (verified live, Phase-A):
//   item doc -> representative_generic_resource_pid_ssi  (e.g. ldpd:286576), and/or
//   item HTML -> IIIF v3 manifest URL -> canvas annotation body.service[0]['@id']
//             -> https://triclops.library.columbia.edu/iiif/2/standard/{pid}
//   The image service is IIIF level0 (only pre-generated sizes). We read info.json `sizes[]`
//   and request the LARGEST as full/{w},{h}/0/default.jpg. Verified: Hugh Ferriss "100 Park Ave."
//   resolves a real 1197x1280 unwatermarked architectural rendering (330 KB JPEG).
//
// RATE LIMIT: DLC robots.txt declares Crawl-delay: 10 and throttles bursts hard (observed IP
//   cool-down on rapid calls). We run SINGLE-THREADED with a 3s base delay + exponential backoff
//   on 429/503/empty bodies. Resumable via a progress checkpoint.
//
// Usage:
//   node scripts/scrape-avery-columbia.mjs --probe   # ~15 in-scope works end-to-end + R2, write probe JSON
//   node scripts/scrape-avery-columbia.mjs --full     # all in-scope, resumable, write collection JSON
//   node scripts/scrape-avery-columbia.mjs --count     # dry: facet tallies only, no images

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

const SLUG = 'avery-columbia';
const COLLECTION_STEM = `${SLUG}-collection`;
const HOST = 'https://dlc.library.columbia.edu';
const REPO_NAME = 'Avery Library';
const UA = 'armin-museum-research/1.0';
const UA_BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--count') ? 'count' : 'probe';
const PROBE_TARGET = 15;
const FULL_CAP_BYTES = 23 * 1024 * 1024; // <23MB compact JSON cap

// In-scope FLAT formats present in Avery (from live facet lib_format_sim). Architectural
// drawings + photographs dominate; the rest is a small flat tail. Everything 3D is excluded.
const IN_SCOPE_FORMATS = [
  'architectural drawings',
  'photographs',
  'watercolors (paintings)',
  'drawings',
  'pictures',
  'illustrations',
  'prints',
];
// Map source format -> our canonical lowercase category enum.
function categoryForFormat(fmt) {
  const f = (fmt || '').toLowerCase();
  if (f.includes('architectural drawing') || f.includes('plan') || f.includes('elevation') ||
      f.includes('section') || f.includes('rendering') || f.includes('sketch')) return 'drawing';
  if (f === 'drawings' || f.includes('drawing')) return 'drawing';
  if (f.includes('photograph')) return 'photograph';
  if (f.includes('watercolor')) return 'painting';
  if (f.includes('print')) return 'print';
  if (f.includes('illustration')) return 'drawing';
  if (f.includes('picture')) return 'photograph'; // Avery "pictures" = photographic prints
  return null;
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const decodeEntities = (s) => (s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&#8217;/g, '’').replace(/&#8216;/g, '‘')
  .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
  .replace(/&hellip;/g, '…').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();

const first = (v) => Array.isArray(v) ? v[0] : v;
const joinArr = (v) => Array.isArray(v) ? v.filter(Boolean).join('; ') : (v || '');

// ---------- throttled fetch with backoff (DLC is strict: Crawl-delay 10) ----------
const BASE_DELAY = 3000;
let lastReq = 0;
async function paced() {
  const dt = Date.now() - lastReq;
  if (dt < BASE_DELAY) await sleep(BASE_DELAY - dt);
  lastReq = Date.now();
}
async function fetchText(url, { ua = UA, expectJson = false } = {}) {
  for (let att = 1; att <= 5; att++) {
    await paced();
    try {
      const r = await fetch(url, { headers: { 'User-Agent': ua, 'Accept': expectJson ? 'application/json' : '*/*' } });
      if (r.status === 429 || r.status === 503) { await sleep(8000 * att); continue; }
      if (!r.ok) { if (att === 5) throw new Error(`HTTP ${r.status} @ ${url}`); await sleep(2000 * att); continue; }
      const t = await r.text();
      if (!t || t.length < 2) { await sleep(5000 * att); continue; } // empty body = throttled
      if (expectJson && /^\s*</.test(t)) { await sleep(6000 * att); continue; } // got HTML redirect = throttled
      return t;
    } catch (e) { if (att === 5) throw e; await sleep(2500 * att); }
  }
  throw new Error(`exhausted retries @ ${url}`);
}
async function fetchJson(url) { return JSON.parse(await fetchText(url, { expectJson: true })); }

// ---------- facet helpers ----------
function fParam(field, value) {
  return `f%5B${encodeURIComponent(field)}%5D%5B%5D=${encodeURIComponent(value)}`;
}
async function facetItems(field, extraFilters = []) {
  const qs = [...extraFilters, 'facet.limit=200'].join('&');
  const d = await fetchJson(`${HOST}/catalog/facet/${field}.json?${qs}`);
  return (((d.response || {}).facets || {}).items) || [];
}

// Discover the content_availability facet value that means "online / has image".
// We never hardcode it: read the facet under the Avery scope and pick the value whose
// item docs actually resolve an image. Returns the chosen filter string array (or []).
async function discoverOnlineFilter() {
  try {
    const items = await facetItems('content_availability', [fParam('lib_repo_short_ssim', REPO_NAME)]);
    if (!items.length) return [];
    // Prefer an explicit "online" value; else the smaller bucket (online subset < not-online).
    const online = items.find((it) => /online/i.test(it.value));
    const chosen = online || items.slice().sort((a, b) => a.hits - b.hits)[0];
    return chosen ? [{ field: 'content_availability', value: chosen.value, hits: chosen.hits }] : [];
  } catch { return []; }
}

// ---------- catalogue paging over in-scope formats ----------
function buildSearchUrl({ format, page, perPage, onlineFilter }) {
  const parts = [fParam('lib_repo_short_ssim', REPO_NAME), fParam('lib_format_sim', format)];
  for (const o of onlineFilter) parts.push(fParam(o.field, o.value));
  parts.push(`per_page=${perPage}`, `page=${page}`, 'sort=lib_date_dtsi+desc%2C+title_si+asc');
  return `${HOST}/catalog.json?${parts.join('&')}`;
}

// ---------- item doc -> partial record (no image yet) ----------
function pickAttr(doc, keys) { for (const k of keys) { const v = doc[k]; if (v != null && (!Array.isArray(v) || v.length)) return v; } return undefined; }
// Field names verified live against an online Avery item (Hugh Ferriss, ldpd:294913).
function parseYear(doc) {
  // numeric start-year fields are the authoritative source on DLC item docs
  const yi = pickAttr(doc, ['lib_start_date_year_itsi', 'lib_end_date_year_itsi']);
  if (yi != null) { const n = parseInt(String(first(yi)), 10); if (Number.isFinite(n)) return n; }
  const range = first(pickAttr(doc, ['lib_date_year_range_si', 'lib_date_year_range_ss']));
  if (range) { const m = String(range).match(/(\d{4})/); if (m) return parseInt(m[1], 10); }
  const created = first(pickAttr(doc, ['origin_info_date_created_ssm']));
  if (created) { const m = String(created).match(/(\d{4})/); if (m) return parseInt(m[1], 10); }
  const txt = joinArr(pickAttr(doc, ['lib_date_textual_ssm', 'origin_info_date_created_textual_ssm']));
  const m2 = (txt || '').match(/(\d{4})/); return m2 ? parseInt(m2[1], 10) : null;
}
function parseItemDoc(doc) {
  const id = doc.id;
  const title = decodeEntities(first(pickAttr(doc, ['title_display_ssm', 'dc_title_ssm', 'title_ssm'])) ||
                               doc.title_si || doc.title || '');
  // creator/role fields: lib_name_ssm holds the indexed creator; role_* are role-specific
  const artist = decodeEntities(joinArr(pickAttr(doc, ['lib_name_ssm', 'role_creator_ssim', 'role_architect_ssim', 'role_delineator_ssim'])));
  const fmtList = pickAttr(doc, ['lib_format_ssm', 'lib_format_sim', 'lib_genre_ssim']) || [];
  const fmt = Array.isArray(fmtList) ? (fmtList.find((f) => IN_SCOPE_FORMATS.includes(String(f).toLowerCase())) || fmtList[0]) : fmtList;
  const category = categoryForFormat(fmt);
  const medium = joinArr(pickAttr(doc, ['lib_format_ssm', 'lib_genre_ssim'])) || String(fmt || '');
  const dimensions = joinArr(pickAttr(doc, ['physical_description_extent_ssm', 'extent_ssim'])) || '';
  const dateStr = joinArr(pickAttr(doc, ['lib_date_textual_ssm', 'origin_info_date_created_ssm'])) || '';
  const year = parseYear(doc);
  const repPid = first(pickAttr(doc, ['representative_generic_resource_pid_ssi'])) || null;
  const persistent = first(pickAttr(doc, ['persistent_url_ss', 'handle_net_ssm', 'identifier_uri_ssm']));
  return {
    id, title, artist, category, medium, dimensions, dateStr, year,
    repPid, sourceUrl: persistent ? String(persistent) : `${HOST}/catalog/${id}`,
  };
}

// ---------- resolve IIIF image service for an item ----------
// 1) Try item HTML for the IIIF v3 manifest URL, read the canvas image service '@id'.
// 2) Fallback: if repPid is present, derive triclops base directly.
async function resolveImageService(rec) {
  // (1) manifest route
  try {
    const html = await fetchText(`${HOST}/catalog/${encodeURIComponent(rec.id)}`, { ua: UA_BROWSER });
    const mm = html.match(/https?:\/\/dlc\.library\.columbia\.edu\/iiif\/3\/presentation\/[^"'\s]+\/manifest/);
    if (mm) {
      const manifest = await fetchJson(mm[0]);
      const cv = (manifest.items || [])[0];
      if (cv) {
        const ann = (((cv.items || [])[0] || {}).items || [])[0];
        const body = ann && ann.body;
        const svcArr = body && (body.service || body.services);
        const svc = Array.isArray(svcArr) ? svcArr[0] : svcArr;
        const sid = svc && (svc['@id'] || svc.id);
        if (sid) return { service: sid, w: cv.width || null, h: cv.height || null };
        // level0 sometimes only exposes a static painting.jpg body id
        if (body && body.id && /\.(jpg|jpeg|png)$/i.test(body.id)) return { directJpg: body.id, w: cv.width || null, h: cv.height || null };
      }
    }
  } catch { /* fall through */ }
  // (2) repPid fallback
  if (rec.repPid) {
    return { service: `https://triclops.library.columbia.edu/iiif/2/standard/${rec.repPid}` };
  }
  return null;
}

// Build the largest level0 image URL from an IIIF Image service base.
async function bestImageUrl(svcBase) {
  const info = await fetchJson(`${svcBase}/info.json`);
  const sizes = info.sizes || [];
  let w = info.width, h = info.height;
  if (sizes.length) { const big = sizes.slice().sort((a, b) => (b.width * b.height) - (a.width * a.height))[0]; w = big.width; h = big.height; }
  if (!w || !h) return null;
  return { url: `${svcBase}/full/${w},${h}/0/default.jpg`, w, h };
}

// ---------- image download + R2 ----------
async function dl(url, ua = UA_BROWSER) {
  for (let att = 1; att <= 3; att++) {
    try {
      await paced();
      const r = await fetch(url, { headers: { 'User-Agent': ua } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 4000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) { if (att === 3) throw e; await sleep(800 * att); }
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
async function processImage(rec) {
  const svc = await resolveImageService(rec);
  if (!svc) throw new Error('no image service');
  let imgUrl, srcW = null, srcH = null;
  if (svc.directJpg) { imgUrl = svc.directJpg; srcW = svc.w; srcH = svc.h; }
  else { const best = await bestImageUrl(svc.service); if (!best) throw new Error('no info sizes'); imgUrl = best.url; srcW = best.w; srcH = best.h; }
  const src = await dl(imgUrl);
  const meta = await (await import('sharp')).default(src).metadata().catch(() => ({}));
  const W = meta.width || srcW || 0, H = meta.height || srcH || 0;
  if (W && H && Math.max(W, H) < 600) throw new Error(`small ${W}x${H}`);
  const { buffer } = await autocropToWebp(src); // webp(2048/q85), no trim by default
  const hash8 = sha(imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${rec.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, original_imageUrl: imgUrl, srcW: W || null, srcH: H || null };
}

// ---------- record assembly (min-4 guard) ----------
function toArtwork(rec, img) {
  if (!rec.title || !rec.artist || rec.year == null || !rec.category) return null;
  return {
    id: rec.id,            // prefixed later by prefix-collection-ids.mjs (Phase F-0)
    objectNumber: '',
    title: rec.title,
    artist: rec.artist,
    date: rec.dateStr || (rec.year != null ? String(rec.year) : ''),
    year: rec.year,
    medium: rec.medium || '',
    dimensions: rec.dimensions || '',
    category: rec.category,
    description: '',
    imageUrl: img.imageUrl,
    thumbnailUrl: img.original_imageUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: rec.sourceUrl,
    metadata: { dlc_id: rec.id, iiif_pid: rec.repPid || '', src_w: img.srcW, src_h: img.srcH },
    original_imageUrl: img.original_imageUrl,
  };
}

function writeCollection(artworks, stem, compact) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Avery Architectural & Fine Arts Library, Columbia University',
    collection: 'Avery Drawings, Renderings & Architectural Photographs',
    website: 'https://dlc.library.columbia.edu/',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'api',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, compact ? JSON.stringify(payload) : JSON.stringify(payload, null, 2));
  const mb = (fs.statSync(out).size / 1048576).toFixed(2);
  console.log(`[write] ${out} (${artworks.length} works, ${mb} MB) breakdown=`, cats);
  return out;
}

// ---------- gather in-scope items (paged across formats), online only ----------
async function gatherCandidates(onlineFilter, limit = Infinity) {
  const out = [];
  for (const fmt of IN_SCOPE_FORMATS) {
    let page = 1; const per = 50; let total = null;
    for (;;) {
      const d = await fetchJson(buildSearchUrl({ format: fmt, page, perPage: per, onlineFilter }));
      if (total == null) { total = d.meta.pages.total_count; console.log(`  [${fmt}] online total=${total}`); }
      const rows = d.data || [];
      if (!rows.length) break;
      for (const r of rows) out.push({ id: r.id, fmt });
      if (out.length >= limit) return out.slice(0, limit);
      if (!d.meta.pages.next_page) break;
      page++;
    }
  }
  return out;
}

function loadProgress() { try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { return { doneIds: [], artworks: [] }; } }
function saveProgress(p) { fs.writeFileSync(PROGRESS, JSON.stringify(p)); }

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });

  if (MODE === 'count') {
    const fmts = await facetItems('lib_format_sim', [fParam('lib_repo_short_ssim', REPO_NAME)]);
    console.log('[count] Avery formats:');
    let inScopeTotal = 0;
    for (const it of fmts) {
      const inScope = IN_SCOPE_FORMATS.includes(String(it.value).toLowerCase());
      if (inScope) inScopeTotal += it.hits;
      console.log(`   ${inScope ? '✓' : ' '} ${String(it.hits).padStart(7)} | ${it.value}`);
    }
    console.log(`[count] in-scope (all, incl. catalogue-only) = ${inScopeTotal}`);
    const onlineFilter = await discoverOnlineFilter();
    console.log('[count] online filter chosen =', JSON.stringify(onlineFilter));
    return;
  }

  // PROBE / FULL
  const onlineFilter = await discoverOnlineFilter();
  console.log(`[${MODE}] online filter =`, JSON.stringify(onlineFilter) || '(none — will keep only items that resolve an image)');

  const limit = MODE === 'probe' ? PROBE_TARGET * 6 : Infinity; // over-fetch ids; many resolve no image
  const ids = await gatherCandidates(onlineFilter, limit);
  console.log(`[${MODE}] gathered ${ids.length} candidate item ids`);

  const prog = MODE === 'full' ? loadProgress() : { doneIds: [], artworks: [] };
  const done = new Set(prog.doneIds);
  const artworks = prog.artworks || [];

  const targetCount = MODE === 'probe' ? PROBE_TARGET : Infinity;
  let processed = 0, imgErr = 0, dropMin4 = 0, noImg = 0;

  for (const { id } of ids) {
    if (artworks.length >= targetCount) break;
    if (done.has(id)) continue;
    // fetch item doc -> partial record
    let rec;
    try {
      const dj = await fetchJson(`${HOST}/catalog/${encodeURIComponent(id)}.json`);
      rec = parseItemDoc((dj.response || {}).document || dj);
    } catch (e) { console.log(`  doc err ${id}: ${e.message}`); continue; }
    if (!rec.category) { continue; }
    // image
    try {
      const img = await processImage(rec);
      const w = toArtwork(rec, img);
      if (w) { artworks.push(w); }
      else { dropMin4++; }
    } catch (e) {
      if (/no image service|no info sizes/.test(String(e.message))) noImg++;
      else { imgErr++; fs.appendFileSync(path.join(STATE_DIR, `${SLUG}-failed.ndjson`), JSON.stringify({ id, err: String(e.message) }) + '\n'); }
    }
    done.add(id);
    if (MODE === 'full') { prog.doneIds = [...done]; prog.artworks = artworks; if (++processed % 25 === 0) { saveProgress(prog); console.log(`  …${processed} processed | ok ${artworks.length} | noImg ${noImg} | imgErr ${imgErr}`); } }
    else { processed++; }

    // FULL size cap guard
    if (MODE === 'full' && processed % 200 === 0) {
      const approx = Buffer.byteLength(JSON.stringify({ artworks }));
      if (approx > FULL_CAP_BYTES) { console.log(`[full] approaching ${FULL_CAP_BYTES} byte cap (${approx}) — stopping`); break; }
    }
  }

  artworks.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const stem = MODE === 'probe' ? `${COLLECTION_STEM}-probe` : COLLECTION_STEM;
  writeCollection(artworks, stem, MODE === 'full');
  if (MODE === 'full') saveProgress({ doneIds: [...done], artworks });
  console.log(`\n[${MODE}] DONE. collected ${artworks.length} | noImg ${noImg} | imgErr ${imgErr} | min4-drop ${dropMin4}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
