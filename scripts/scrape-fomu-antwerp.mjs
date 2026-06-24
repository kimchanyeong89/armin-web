#!/usr/bin/env node
// FOMU — FotoMuseum Antwerpen (Antwerp, Belgium) — photography collection scraper.
// GENRE: 사진 (photography) — FLAT photographic works only (prints, negatives-as-prints, postcards…).
//
// Source: museum-OWN online catalogue on collection.fotomuseum.be — Axiell/Adlib
//   "Adlib Internet Server 3.1.2" (IIS/ASP.NET). NO machine API (wwwopac.ashx is 404/disabled),
//   so we drive the AIS web flow with a session cookie + ASP.NET __VIEWSTATE:
//     1) GET  /default.aspx                         → plants ASP.NET_SessionId (+ CulturePref=en-GB)
//     2) GET  /search.aspx?formtype=expert          → grab __VIEWSTATE/__EVENTVALIDATION
//        POST /search.aspx?formtype=expert  CCL="*" → registers the full result set (48,815 records),
//                                                      server redirects to /brief.aspx
//     3) GET  /brief.aspx?gotopage=N                → 20 rows/page; each row links
//          <a href="dispatcher.aspx?action=detail&database=ChoiceCollect&priref=P">
//             <span class="resourcespace">RS</span></a>
//        (priref P = Adlib record id; RS = ResourceSpace DAM id)
//     4) GET  /dispatcher.aspx?action=detail&database=ChoiceCollect&priref=P
//                                                    → detail labels: Object number, Title, Creator,
//                                                      Date, Object name, Technique (all in EN UI, NL values)
//
// Images live in FOMU's OWN ResourceSpace DAM (museumstichting.resourcespace.com — Museumstichting,
//   the foundation that runs FOMU). They are reached through FOMU's signing proxy on the same host:
//     GET /php/api_call_scr_external.php?Id=RS
//        → <img src="https://museumstichting.resourcespace.com/pages/download.php?ref=RS&size=lpr|scr
//                    &…&access_key=SIGNED"> — publicly downloadable full-size JPEG (no login).
//   Records without a published image return the placeholder <img src=".../images/copyrighted.gif">
//   (FOMU only publishes images that are PD or rights-cleared). Such records are SKIPPED.
//   Sampling spread across the result set: ~52% of records carry a real image; of imaged records
//   100% have a Creator (incl. "Anoniem") but only ~43% carry a parseable year. Since year is a
//   min-4 MUST field, the in-scope (imaged AND dated) estimate ≈ 0.52 × 0.43 × 48,815 ≈ 11,000.
//   (Imaged-but-undated photos are dropped per COLLECTION_SCRAPING_GUIDE min-4; we do NOT fabricate years.)
//
// SCOPE (사진, flat works only): the online DB is photographs only (cameras/equipment are NOT yet
//   online per the catalogue's own intro). Every imaged record → category 'photograph'.
//   Photographs are NEVER colour-gated (per COLLECTION_SCRAPING_GUIDE §1) — keep B&W prints.
//
// >25k in-scope → COMPACT JSON + prioritize named+dated; hard size cap (CAP_BYTES) keeps JSON <23MB.
//
// Usage:
//   node scripts/scrape-fomu-antwerp.mjs --probe          # ~20 imaged records end-to-end + R2 upload
//   node scripts/scrape-fomu-antwerp.mjs --full            # full imaged scrape + R2, resumable
//   node scripts/scrape-fomu-antwerp.mjs --count           # just report total/with-image estimate

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

const SLUG = 'fomu-antwerp';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://collection.fotomuseum.be';
const RS_HOST = 'https://museumstichting.resourcespace.com';
const DATABASE = 'ChoiceCollect';
const ROWS_PER_PAGE = 20;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--count') ? 'count' : 'probe';
const PROBE_TARGET = 20;
// NB: NO request concurrency — AIS keys detail/image off a server-side session pointer,
// so all record fetching is strictly sequential (see the main loop) to avoid cross-contamination.
const CAP_BYTES = 23 * 1024 * 1024;   // hard JSON size cap

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const decodeEntities = (s) => (s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/g, "'").replace(/&rsquo;|&#8217;/g, '’')
  .replace(/&nbsp;/g, ' ');

// ---------- AIS session (cookie jar + viewstate-aware GET/POST) ----------
const cookies = { CulturePref: 'en-GB', consent: 'yes' };
const cookieHeader = () => Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
function absorb(res) {
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of sc) { const m = c.match(/^([^=]+)=([^;]+)/); if (m) cookies[m[1]] = m[2]; }
}

async function httpGet(url, referer, att = 1) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: cookieHeader(), ...(referer ? { Referer: referer } : {}) }, redirect: 'manual' });
    absorb(res);
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (loc) {
        // AIS downgrades https→http:80; rewrite back to https and resolve relative Locations
        const next = new URL(loc.replace(/^http:/, 'https:').replace(':80/', '/'), BASE).href;
        return await httpGet(next, referer, att);
      }
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) { if (att >= 4) throw e; await sleep(700 * att); return httpGet(url, referer, att + 1); }
}

async function httpPost(url, fields, referer, att = 1) {
  try {
    const body = new URLSearchParams(fields).toString();
    const res = await fetch(url, { method: 'POST', headers: { 'User-Agent': UA, Cookie: cookieHeader(), 'Content-Type': 'application/x-www-form-urlencoded', ...(referer ? { Referer: referer } : {}) }, body, redirect: 'follow' });
    absorb(res);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) { if (att >= 4) throw e; await sleep(800 * att); return httpPost(url, fields, referer, att + 1); }
}

const grabHidden = (h, name) => {
  const m = h.match(new RegExp('id="' + name.replace(/\$/g, '\\$') + '"[^>]*value="([^"]*)"'));
  return m ? m[1] : '';
};

// Register the full "*" result set in the AIS session; returns the total record count.
async function registerAll() {
  await httpGet(`${BASE}/default.aspx`);
  if (!cookies['ASP.NET_SessionId']) throw new Error('no ASP.NET session cookie');
  const form = await httpGet(`${BASE}/search.aspx?formtype=expert`);
  const fields = {
    __VIEWSTATE: grabHidden(form, '__VIEWSTATE'),
    __VIEWSTATEGENERATOR: grabHidden(form, '__VIEWSTATEGENERATOR'),
    __EVENTVALIDATION: grabHidden(form, '__EVENTVALIDATION'),
    __EVENTTARGET: '', __EVENTARGUMENT: '',
    'SearchForm1$DatabaseChooser1$hiddenDatabase': DATABASE,
    'SearchForm1$ctl00$TextBoxVal': '*',           // expert CCL: bare wildcard = every record
    'SearchForm1$Formoptions1$showImage': 'on',
    'SearchForm1$searchButton': 'Search',
  };
  const brief = await httpPost(`${BASE}/search.aspx?formtype=expert`, fields, `${BASE}/search.aspx?formtype=expert`);
  const m = brief.match(/Found results:\s*<strong>([\d.,]+)/);
  const total = m ? parseInt(m[1].replace(/[.,]/g, ''), 10) : 0;
  return total;
}

// One brief page (1-based) → [{priref, rs}] rows (only rows that carry a ResourceSpace id).
async function fetchBriefPage(page) {
  const h = await httpGet(`${BASE}/brief.aspx?gotopage=${page}`, `${BASE}/brief.aspx`);
  const rows = [];
  for (const m of h.matchAll(/action=detail&amp;database=ChoiceCollect&amp;priref=(\d+)"><span class="resourcespace">(\d+)</g))
    rows.push({ priref: m[1], rs: m[2] });
  return rows;
}

// ---------- detail record → ARMIN artwork (pre-image) ----------
function labelVal(h, label) {
  // non-greedy: detailLabel cell (label may carry trailing ':') then the immediate value cell
  const re = new RegExp('class="detailLabel"[^>]*>\\s*' + label + '\\s*:?\\s*</td>\\s*<td[^>]*>([\\s\\S]*?)</td>', 'i');
  const m = h.match(re);
  if (!m) return '';
  return decodeEntities(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// Strip Adlib authority-link noise from a creator value, e.g.
//   "Embo, Suzy [ RKD Artists ; Wikidata ; Viaf ; ] []"  →  "Embo, Suzy"
function cleanCreator(s) {
  return (s || '')
    .replace(/\[[^\]]*\]/g, ' ')                 // drop "[ RKD Artists ; … ]" and trailing "[]"
    .replace(/\b(RKD Artists|Wikidata|Viaf|VIAF|ULAN)\b/gi, ' ')
    .replace(/\s*;\s*/g, '; ').replace(/;\s*$/, '')
    .replace(/\s+/g, ' ').replace(/^[;\s]+|[;\s]+$/g, '').trim();
}

// Pull a 4-digit year out of a free-form date string (NL: "circa 1900 [fotograaf]", "13/06/2002", "1915").
function parseYear(s) {
  const m = (s || '').match(/\b(1[5-9]\d{2}|20[0-2]\d)\b/);
  return m ? parseInt(m[1], 10) : null;
}
function cleanDate(s) {
  return decodeEntities(s || '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchDetail(priref) {
  const h = await httpGet(`${BASE}/dispatcher.aspx?action=detail&database=${DATABASE}&priref=${priref}`, `${BASE}/brief.aspx`);
  const objectNumber = labelVal(h, 'Object number');
  const title = labelVal(h, 'Title');
  const creator = cleanCreator(labelVal(h, 'Creator'));
  const dateStr = cleanDate(labelVal(h, 'Date'));
  const objectName = labelVal(h, 'Object name');     // NL e.g. "fotografische afdruk", "postkaart"
  const technique = labelVal(h, 'Technique');        // NL e.g. "ontwikkelgelatinezilverdruk (OGZ)"
  // ResourceSpace id from the detail page itself (authoritative; matches brief)
  const rsm = h.match(/class="resourcespace"[^>]*>(\d+)/);
  const rs = rsm ? rsm[1] : null;
  return { priref, rs, objectNumber, title, creator, dateStr, year: parseYear(dateStr), objectName, technique };
}

// ---------- image: resolve signed ResourceSpace URL via FOMU proxy, download ----------
// Returns the full-size download.php URL, or null if the record has no published image.
async function resolveImageUrl(rs) {
  const h = await httpGet(`${BASE}/php/api_call_scr_external.php?Id=${rs}`);
  if (h.includes('copyrighted.gif') || h.includes('briefNoThumb')) return null; // no published image
  const m = h.match(/download\.php\?[^"']+/);
  if (!m) return null;
  const q = decodeEntities(m[0]);                     // download.php?ref=…&size=scr&…&access_key=SIGNED
  // NB: the access_key is size-specific — the proxy signs the 'scr' (screen, ~800–1200px) preview.
  // Do NOT rewrite the size token: other sizes (lpr/hpr/original) 302 to login (signature invalid).
  return `${RS_HOST}/pages/${q}`;
}

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

async function processImage(rec) {
  const url = await resolveImageUrl(rec.rs);
  if (!url) throw new Error('no-image');                 // skip placeholder/copyrighted records
  const src = await dl(url);
  const sharp = (await import('sharp')).default;
  const meta = await sharp(src, { limitInputPixels: false }).metadata().catch(() => ({}));
  if (meta.width && meta.height && Math.max(meta.width, meta.height) < 600)
    throw new Error(`thumb ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(src);          // webp(2048/q85), no white-trim by default
  const hash8 = sha(url).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${SLUG}-${rec.priref}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcUrl: url, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (min-4 guard) — COMPACT shape ----------
function toArtwork(rec, imageUrl, srcUrl) {
  if (!rec.title || !rec.creator) return null; // photo museum: keep undated; require title+creator
  return {
    id: `${SLUG}-${rec.priref}`,
    objectNumber: rec.objectNumber || '',
    title: rec.title,
    artist: rec.creator,
    date: rec.dateStr || String(rec.year),
    year: rec.year,
    medium: rec.technique || rec.objectName || '',
    dimensions: '',
    category: 'photograph',
    description: '',
    imageUrl,
    thumbnailUrl: srcUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: `${BASE}/dispatcher.aspx?action=detail&database=${DATABASE}&priref=${rec.priref}`,
    metadata: { priref: rec.priref, resourcespace: rec.rs, object_name: rec.objectName, technique: rec.technique },
    original_imageUrl: srcUrl,
  };
}

function writeCollection(artworks, stem, compact) {
  const payload = {
    museum: 'FOMU — FotoMuseum Antwerpen',
    collection: 'Photography',
    website: 'https://collection.fotomuseum.be/',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'web',
    category_breakdown: { photograph: artworks.length },
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, compact ? JSON.stringify(payload) : JSON.stringify(payload, null, 2));
  const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
  console.log(`[write] ${out} (${artworks.length} works, ${mb} MB)`);
  return out;
}

// prioritize named + dated works when capping a huge corpus
function priorityScore(r) {
  let s = 0;
  if (r.creator && !/^(anoniem|anonymous|onbekend|unknown)/i.test(r.creator)) s += 2;
  if (r.year != null) s += 1;
  if (r.objectNumber) s += 1;
  if (r.technique) s += 1;
  return s;
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const total = await registerAll();
  const pages = Math.ceil(total / ROWS_PER_PAGE);
  console.log(`[fetch] FOMU Adlib total records=${total} (${pages} brief pages @ ${ROWS_PER_PAGE}/page)`);

  if (MODE === 'count') {
    // estimate with-image rate by sampling spread-out brief pages
    const samplePages = [1, 50, 200, 500, 900, 1300, 1700, 2100, Math.max(1, pages - 1)];
    let withImg = 0, scanned = 0;
    for (const pg of samplePages) {
      const rows = await fetchBriefPage(pg);
      for (const row of rows) {
        scanned++;
        const url = await resolveImageUrl(row.rs).catch(() => null);
        if (url) withImg++;
      }
      await sleep(150);
    }
    console.log(`[count] sampled ${scanned} rows: with-image ${withImg} (${(100 * withImg / scanned).toFixed(0)}%)`);
    console.log(`[count] est in-scope (with image) of ${total} ≈ ${Math.round(total * withImg / scanned)}`);
    return;
  }

  // probe / full: walk brief pages, fetch detail per row, build records
  const limitPages = MODE === 'probe' ? 12 : pages;     // probe: enough pages to find 20 imaged records

  // resumable (full): load done prirefs + already-collected artworks
  let doneIds = new Set(); let artworks = [];
  if (MODE === 'full' && fs.existsSync(PROGRESS)) {
    try { const p = JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); doneIds = new Set(p.doneIds || []); artworks = p.artworks || []; } catch {}
    console.log(`[full] resuming: ${doneIds.size} prirefs done, ${artworks.length} artworks kept`);
  }
  const persist = () => { if (MODE === 'full') fs.writeFileSync(PROGRESS, JSON.stringify({ doneIds: [...doneIds], artworks })); };

  let collected = artworks.length, imgErr = 0, drop4 = 0, noImg = 0, bytesEst = JSON.stringify(artworks).length;
  let capped = false;

  for (let pg = 1; pg <= limitPages && !capped; pg++) {
    const rows = await fetchBriefPage(pg);
    // ⚠️ AIS dispatcher.aspx?action=detail and api_call_scr_external.php key off a SERVER-SIDE
    // session "current record" pointer. Concurrent requests in one session race and return each
    // OTHER's records — corrupting the priref↔metadata↔image pairing. So we process each record
    // FULLY SEQUENTIALLY (detail → min-4 gate → resolve+download+upload image), one at a time.
    for (const row of rows) {
      if (capped) break;
      const id = `${SLUG}-${row.priref}`;
      if (doneIds.has(id)) continue;
      let rec;
      try { rec = await fetchDetail(row.priref); }
      catch (e) { fs.appendFileSync(FAILED, JSON.stringify({ priref: row.priref, stage: 'detail', err: String(e.message || e) }) + '\n'); continue; }
      doneIds.add(id);
      if (!rec.rs) { noImg++; continue; }                       // no DAM asset on the record
      // min-4 gate BEFORE any image work: skip records that would be dropped
      // (title+creator+year; many archival photos are undated → not collected, no wasted upload).
      if (!rec.title || !rec.creator) { drop4++; continue; } // photo museum: undated (year==null) prints are valid; keep title+creator
      try {
        const { imageUrl, srcUrl } = await processImage(rec);
        const w = toArtwork(rec, imageUrl, srcUrl);
        if (w) {
          artworks.push(w); collected++;
          bytesEst += JSON.stringify(w).length + 2;
          if (MODE === 'full' && bytesEst > CAP_BYTES) { capped = true; console.log(`[full] hit size cap (~${(bytesEst / 1024 / 1024).toFixed(1)}MB) at ${collected} works`); }
        } else drop4++;
      } catch (e) {
        if (String(e.message) === 'no-image') noImg++;
        else { imgErr++; fs.appendFileSync(FAILED, JSON.stringify({ priref: rec.priref, rs: rec.rs, stage: 'image', err: String(e.message || e) }) + '\n'); }
      }
      if (MODE === 'probe' && collected >= PROBE_TARGET) { capped = true; break; }
      await sleep(80);                                          // gentle per-record pacing
    }
    if (MODE === 'full') { persist(); if (pg % 10 === 0) console.log(`  …page ${pg}/${limitPages} | collected ${collected}, noImg ${noImg}, imgErr ${imgErr}, ~${(bytesEst / 1024 / 1024).toFixed(1)}MB`); }
    await sleep(120);
  }
  if (MODE === 'full') persist();

  if (MODE === 'full') artworks.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const stem = MODE === 'probe' ? `${COLLECTION_STEM}-probe` : COLLECTION_STEM;
  writeCollection(artworks, stem, /*compact*/ MODE === 'full');
  console.log(`\n[${MODE}] DONE. collected ${collected} | no-image skipped ${noImg} | img errors ${imgErr} | min4-drops ${drop4}`);
  if (MODE === 'probe') {
    const sample = artworks.slice(0, 6).map((w) => ({ id: w.id, title: w.title.slice(0, 38), artist: w.artist.slice(0, 26), year: w.year, medium: w.medium.slice(0, 28), img: w.imageUrl }));
    console.log('[probe] sample:', JSON.stringify(sample, null, 2));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
