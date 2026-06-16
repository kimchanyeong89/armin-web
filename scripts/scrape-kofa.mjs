#!/usr/bin/env node
// Korean Film Archive (KOFA / 한국영상자료원) — flat film-art scraper.
//
// SOURCE (museum's OWN infra): KMDb (한국영화데이터베이스, kmdb.or.kr) is KOFA-run.
//   Its "영화상세정보" Open API lives on KOFA's own host api.koreafilm.or.kr:
//     GET http://api.koreafilm.or.kr/openapi-data2/wisenut/search_api/search_json2.jsp
//         ?collection=kmdb_new2&detail=Y&ServiceKey=<KEY>&listCount=N&startCount=O&prodYear=YYYY
//   Image CDN (also KOFA-owned, no key needed for the image bytes themselves):
//     http://file.koreafilm.or.kr/poster/...  (posters)   → category "print"
//     http://file.koreafilm.or.kr/still/copy/... (stills)  → category "photograph"
//   posterUrl / stillUrl fields are pipe-delimited ("url1|url2|...") strings.
//
// AUTH: a FREE ServiceKey is required (KOFA member login → Open API 신청, or data.go.kr
//   dataset 3035985 활용신청). Put it in .env.local as  KMDB_API_KEY=<key>  (or export it).
//   The image bytes on file.koreafilm.or.kr download without a key; only the metadata API
//   call is gated. Verified live (Phase A): poster 410x600 & 416x599, still 600x406 — all
//   at/above the 600px gate; full-colour JPEGs on KOFA's own CDN.
//
// SCOPE (film-museum FLAT art only): film POSTERS (→print) + production STILLS (→photograph).
//   We do NOT collect moving-image titles, cameras, projectors or 3D props. Each movie record
//   yields ONE poster artwork (the first poster) and up to STILLS_PER_MOVIE still artworks.
//   Posters are prioritized; named-director + dated records come first; JSON capped < 24 MB.
//   Per the film-museum scope + GUIDE §1, posters/photographs are NEVER colour-gated, so the
//   Hasler-Süsstrunk colorfulness() is copied (below) but NOT used to drop anything.
//
// Usage:
//   node scripts/scrape-kofa.mjs --probe   # ~15 in-scope works end-to-end + R2 upload → probe JSON
//   node scripts/scrape-kofa.mjs --full    # all in-scope, resumable, posters-first, <24MB cap
//
// State (—full): scripts/.state/kofa-progress.json (resume), scripts/.state/kofa-failed.ndjson

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

const SLUG = 'kofa';
const COLLECTION_STEM = `${SLUG}-collection`;
const API = 'http://api.koreafilm.or.kr/openapi-data2/wisenut/search_api/search_json2.jsp';
const KEY = process.env.KMDB_API_KEY || process.env.KMDB_SERVICE_KEY || '';
const UA = 'armin-museum-research/1.0';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'probe';
const PROBE_TARGET = 15;
const PER_PAGE = 100;            // listCount per API call (API max 500; 100 keeps payloads sane)
const STILLS_PER_MOVIE = MODE === 'probe' ? 2 : 2; // bounded so stills don't dominate
const JSON_CAP_BYTES = 24 * 1024 * 1024;
// KMDb prodYear coverage. Korean cinema's first feature is 1919; KMDb also holds foreign films.
const YEAR_START = 1919;
const YEAR_END = new Date().getFullYear();

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// KMDb wraps some values in "!HS"…"!HE" highlight markers and stray whitespace.
const clean = (s) => (s == null ? '' : String(s))
  .replace(/!HS|!HE/g, '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

// pipe-delimited URL strings → array of trimmed non-empty URLs
const splitPipe = (s) => clean(s).split('|').map((x) => x.trim()).filter((x) => /^https?:\/\//i.test(x));

// ---------- colorfulness (copied per GUIDE; NOT used to gate film posters/photos) ----------
async function colorfulness(buf) {
  try {
    const { data } = await sharp(buf, { limitInputPixels: false }).resize(80, 80, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const rg = [], yb = [];
    for (let i = 0; i < data.length; i += 3) { const R = data[i], G = data[i + 1], B = data[i + 2]; rg.push(R - G); yb.push(0.5 * (R + G) - B); }
    const m = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    const sd = (a) => { const mu = m(a); return Math.sqrt(m(a.map((v) => (v - mu) ** 2))); };
    return Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(m(rg) ** 2 + m(yb) ** 2);
  } catch { return -1; }
}

// ---------- API fetch layer ----------
function apiUrl(params) {
  const q = new URLSearchParams({ collection: 'kmdb_new2', ServiceKey: KEY, ...params });
  return `${API}?${q.toString()}`;
}

// Defensive extraction of the record array + total from the wisenut wrapper.
//   Canonical shape:  { Data: [ { TotalCount, Count, Result: [ {…} ] } ] }
function extractRows(json) {
  if (!json || typeof json !== 'object') return { total: 0, rows: [] };
  if (json.Error) throw new Error(`API error: ${clean(json.Error)}`);
  if (Array.isArray(json.Data) && json.Data.length) {
    const d = json.Data[0] || {};
    const rows = Array.isArray(d.Result) ? d.Result : (Array.isArray(d.Row) ? d.Row : []);
    const total = parseInt(d.TotalCount ?? json.TotalCount ?? rows.length, 10) || rows.length;
    return { total, rows };
  }
  if (Array.isArray(json.Row)) return { total: parseInt(json.TotalCount || json.Row.length, 10) || json.Row.length, rows: json.Row };
  if (Array.isArray(json.Result)) return { total: parseInt(json.TotalCount || json.Result.length, 10) || json.Result.length, rows: json.Result };
  return { total: 0, rows: [] };
}

async function apiGet(params) {
  const url = apiUrl(params);
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      // KMDb sometimes emits invalid JSON for the bare error ({ "Error" : 인증키가 필요합니다. }).
      let json;
      try { json = JSON.parse(text); }
      catch {
        if (/인증키/.test(text)) throw new Error('ServiceKey rejected/missing (인증키가 필요합니다). Set KMDB_API_KEY in .env.local.');
        throw new Error(`non-JSON response: ${text.slice(0, 120)}`);
      }
      return extractRows(json);
    } catch (e) {
      if (att === 3) throw e;
      await sleep(800 * att);
    }
  }
}

// Page one prodYear fully (KMDb caps a single query's window; per-year stays well under it).
async function fetchYear(year, onPage) {
  let start = 1;
  let total = Infinity;
  let got = 0;
  while (start <= total) {
    const { total: t, rows } = await apiGet({ detail: 'Y', sort: 'prodYear,1', listCount: String(PER_PAGE), startCount: String(start - 1), prodYear: String(year) });
    total = t;
    if (!rows.length) break;
    got += rows.length;
    await onPage(rows);
    start += PER_PAGE;
    await sleep(350);
    if (rows.length < PER_PAGE) break;
  }
  return { year, total, got };
}

// ---------- record → ARMIN artwork candidates (one movie → 1 poster + N stills) ----------
function movieMeta(r) {
  const title = clean(r.title) || clean(r.titleOrg) || clean(r.titleEng);
  const titleEng = clean(r.titleEng);
  const director = clean(r.directorNm) || clean(r.directorEnNm);
  const yearStr = clean(r.prodYear);
  const ym = yearStr.match(/\d{4}/);
  const year = ym ? parseInt(ym[0], 10) : null;
  const nation = clean(r.nation);
  const genre = clean(r.genre);
  const company = clean(r.company);
  const runtime = clean(r.runtime);
  const docid = clean(r.docid) || clean(r.DOCID);
  const movieId = clean(r.movieId);
  const movieSeq = clean(r.movieSeq);
  const kid = (movieId && movieSeq) ? `${movieId}-${movieSeq}` : (docid || movieId || movieSeq);
  const sourceUrl = (movieId && movieSeq)
    ? `https://www.kmdb.or.kr/db/kor/detail/movie/K/${movieId}/${movieSeq}`
    : 'https://www.kmdb.or.kr/main';
  return { title, titleEng, director, year, yearStr, nation, genre, company, runtime, docid, kid, sourceUrl, posters: splitPipe(r.posterUrl), stills: splitPipe(r.stillUrl) };
}

// Build candidate artwork stubs (image not yet fetched). Posters first, then stills.
function candidatesFromMovie(m) {
  const out = [];
  const dims = m.runtime ? `runtime ${m.runtime} min` : '';
  const baseMeta = { kmdb_movieId: m.docid, nation: m.nation, genre: m.genre, company: m.company, titleEng: m.titleEng };
  // poster → print
  if (m.posters.length) {
    out.push({
      kind: 'poster', category: 'print',
      id: `${SLUG}-p-${m.kid}`,
      objectNumber: m.docid || '',
      title: m.title, artist: m.director, year: m.year, dateStr: m.yearStr,
      medium: 'film poster', dimensions: '', category2: 'print',
      imgUrl: m.posters[0], sourceUrl: m.sourceUrl,
      metadata: { ...baseMeta, type: 'poster' },
    });
  }
  // stills → photograph (bounded)
  m.stills.slice(0, STILLS_PER_MOVIE).forEach((u, i) => {
    out.push({
      kind: 'still', category: 'photograph',
      id: `${SLUG}-s-${m.kid}-${i + 1}`,
      objectNumber: m.docid || '',
      title: m.title, artist: m.director, year: m.year, dateStr: m.yearStr,
      medium: 'film still (production photograph)', dimensions: dims,
      imgUrl: u, sourceUrl: m.sourceUrl,
      metadata: { ...baseMeta, type: 'still', stillIndex: i + 1 },
    });
  });
  return out;
}

// ---------- image: download, ≥600px gate, autocrop → webp, upload R2 ----------
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
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && meta.height && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`);
  await colorfulness(src);                       // computed for parity; intentionally NOT used to drop
  const { buffer } = await autocropToWebp(src);  // posters often have white scan margins
  const hash8 = sha(a.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

function toArtwork(a, imageUrl) {
  if (!a.title || !a.artist || a.year == null || !a.category) return null; // min-4 guard
  return {
    id: a.id,
    objectNumber: a.objectNumber || '',
    title: a.title,
    artist: a.artist,
    date: a.dateStr || String(a.year),
    year: a.year,
    medium: a.medium,
    dimensions: a.dimensions || '',
    category: a.category,
    description: '',
    imageUrl,
    thumbnailUrl: a.imgUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: a.metadata || {},
    original_imageUrl: a.imgUrl,
  };
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Korean Film Archive (KOFA)',
    collection: 'Film Posters & Stills',
    website: 'https://www.kmdb.or.kr/',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'api',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`[write] ${out} (${artworks.length} works) breakdown=`, cats, `bytes=${fs.statSync(out).size}`);
  return out;
}

// ---------- PROBE ----------
async function runProbe() {
  console.log('[probe] querying KMDb for a handful of dated, named-director films with posters…');
  // Pull a few well-known years to guarantee posters+stills exist.
  const collected = [];
  const seen = new Set();
  for (const year of [2019, 2003, 2000, 1960, 1955]) {
    if (collected.length >= PROBE_TARGET) break;
    const { rows } = await apiGet({ detail: 'Y', listCount: '40', startCount: '0', prodYear: String(year) });
    for (const r of rows) {
      const m = movieMeta(r);
      if (!m.posters.length) continue;
      const cands = candidatesFromMovie(m).filter((c) => !seen.has(c.id));
      for (const c of cands) { seen.add(c.id); collected.push(c); }
      if (collected.length >= PROBE_TARGET + 10) break;
    }
    await sleep(350);
  }
  // ensure a mix: keep posters and stills, trim to target
  const posters = collected.filter((c) => c.kind === 'poster');
  const stills = collected.filter((c) => c.kind === 'still');
  const picked = [...posters.slice(0, Math.ceil(PROBE_TARGET / 2)), ...stills.slice(0, Math.floor(PROBE_TARGET / 2))].slice(0, PROBE_TARGET);
  if (!picked.length) throw new Error('probe found 0 candidates — check KMDB_API_KEY and API response shape.');
  console.log(`[probe] ${picked.length} candidates (${picked.filter((c) => c.kind === 'poster').length} posters, ${picked.filter((c) => c.kind === 'still').length} stills) → image+R2…`);

  const artworks = [];
  let imgErr = 0, dropMin4 = 0;
  for (const a of picked) {
    try {
      const { imageUrl, srcW, srcH } = await processImage(a);
      const w = toArtwork(a, imageUrl);
      if (w) { artworks.push(w); console.log(`  ok ${a.kind} ${a.id} ${srcW}x${srcH} — ${a.title} (${a.year})`); }
      else { dropMin4++; console.log(`  drop(min4) ${a.id}`); }
    } catch (e) {
      imgErr++;
      console.log(`  img err ${a.id}: ${e.message}`);
    }
  }
  const out = writeCollection(artworks, `${COLLECTION_STEM}-probe`);
  console.log(`\n[probe] DONE. collected ${artworks.length}/${picked.length} | imgErr ${imgErr} | min4-drops ${dropMin4}`);
  if (!artworks.length) process.exit(1);
  // Field-fill sanity on the probe set
  const cov = (f) => artworks.filter((w) => w[f] != null && String(w[f]).trim() !== '').length;
  console.log('[probe] fill:', ['title', 'artist', 'year', 'category', 'medium', 'dimensions'].map((f) => `${f} ${cov(f)}/${artworks.length}`).join(' | '));
  return out;
}

// ---------- FULL ----------
function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); }
  catch { return { doneYears: [], doneIds: [], bytes: 0 }; }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS, JSON.stringify(p)); }

async function runFull() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const prog = loadProgress();
  const doneYears = new Set(prog.doneYears);
  const doneIds = new Set(prog.doneIds);
  // resume artworks already written
  const outPath = path.join(REPO, 'public/data', `${COLLECTION_STEM}.json`);
  let artworks = [];
  if (fs.existsSync(outPath)) {
    try { artworks = JSON.parse(fs.readFileSync(outPath, 'utf8')).artworks || []; } catch {}
  }

  // PASS 1: posters only (priority). PASS 2: fill stills until cap.
  for (const pass of ['poster', 'still']) {
    console.log(`\n=== PASS: ${pass}s ===`);
    for (let year = YEAR_END; year >= YEAR_START; year--) {            // newest first (better metadata/images)
      const ykey = `${pass}:${year}`;
      if (doneYears.has(ykey)) continue;
      let yearCands = [];
      try {
        await fetchYear(year, async (rows) => {
          for (const r of rows) {
            const m = movieMeta(r);
            for (const c of candidatesFromMovie(m)) {
              if (c.kind !== pass) continue;
              if (doneIds.has(c.id)) continue;
              yearCands.push(c);
            }
          }
        });
      } catch (e) {
        fs.appendFileSync(FAILED, JSON.stringify({ scope: 'year', pass, year, err: String(e.message || e) }) + '\n');
        console.log(`  [year ${year}] fetch err: ${e.message}`);
        continue;
      }

      // process this year's candidates
      let ok = 0, err = 0;
      const CONC = 4;
      let idx = 0;
      await Promise.all(Array.from({ length: CONC }, async () => {
        while (idx < yearCands.length) {
          const a = yearCands[idx++];
          // byte-budget cap
          if (estBytes(artworks) >= JSON_CAP_BYTES) return;
          try {
            const { imageUrl } = await processImage(a);
            const w = toArtwork(a, imageUrl);
            if (w) { artworks.push(w); doneIds.add(a.id); ok++; }
          } catch (e) {
            err++;
            fs.appendFileSync(FAILED, JSON.stringify({ id: a.id, url: a.imgUrl, err: String(e.message || e) }) + '\n');
          }
        }
      }));
      doneYears.add(ykey);
      saveProgress({ doneYears: [...doneYears], doneIds: [...doneIds], bytes: estBytes(artworks) });
      writeCollection(artworks, COLLECTION_STEM);
      console.log(`  [${pass} ${year}] +${ok} (err ${err}) → total ${artworks.length}, ~${(estBytes(artworks) / 1048576).toFixed(1)}MB`);
      if (estBytes(artworks) >= JSON_CAP_BYTES) { console.log(`  reached ${ (JSON_CAP_BYTES/1048576)|0 }MB cap → stop ${pass} pass`); break; }
    }
    if (estBytes(artworks) >= JSON_CAP_BYTES) break;
  }
  writeCollection(artworks, COLLECTION_STEM);
  console.log(`\n[full] DONE. ${artworks.length} works.`);
}

function estBytes(arr) { return Buffer.byteLength(JSON.stringify(arr)); }

// ---------- main ----------
// expose pure helpers for the self-test harness
export { extractRows, movieMeta, candidatesFromMovie, splitPipe, clean, processImage, toArtwork, writeCollection };

async function main() {
  if (!KEY) {
    console.error('\n[FATAL] No KMDB_API_KEY. Add `KMDB_API_KEY=<your key>` to .env.local.');
    console.error('  Get a free key: log in at https://www.kmdb.or.kr → 마이페이지 → Open API 신청 (영화상세정보),');
    console.error('  or apply on data.go.kr dataset 3035985 (한국영상자료원_영화정보DB) for instant issuance.\n');
    process.exit(2);
  }
  fs.mkdirSync(STATE_DIR, { recursive: true });
  if (MODE === 'probe') await runProbe();
  else await runFull();
}

// only auto-run when invoked directly (not when imported by the self-test harness)
if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
