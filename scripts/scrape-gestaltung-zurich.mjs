#!/usr/bin/env node
// Museum für Gestaltung Zürich (ZHdK) — collection scraper.
// Source: Gallery Systems eMuseum (Tapestry5) at https://www.emuseum.ch — museum's OWN catalogue.
//   No public JSON (the /json API module exists but is key-gated → 403; ?format=json ignored),
//   so we parse the HTML, which is clean and stable:
//   - listing:  /en/search/classifications%3A%22{C}%22/objects?page=N   (30/page, deep paging OK,
//               verified to page 2134; perPage param is ignored)
//   - detail:   /en/objects/{id}/{slug}  → detailField blocks (medium, dimensions, invno,
//               department, classificationsFull, people-with-roles) + <h1> title
//   - image:    /internal/media/dispatcher/{mediaId}/fullsize  (long side ≤ 800px)
//
// SCOPE — FLAT works only (design museum): classifications Plakat (posters, 64,046 online),
//   Gebrauchsgrafik (commercial graphic design, 8,337), Kunstgrafik (art prints, 3,522),
//   Fotografie (5,890). 3D classifications (Möbel, Produktdesign, Textilien, …) never queried.
//   ~81.8k in-scope > 25k cap → value selection: keep only works with a NAMED maker AND a
//   4-digit date (museum catalogue order preserved), per-class caps below. Posters are the
//   museum's flagship → largest allocation.
//   Category mapping (NOTE: posters use category "poster"):
//     Plakat→poster, Gebrauchsgrafik→print, Kunstgrafik→print, Fotografie→photograph.
//   Colour gate: Kunstgrafik ONLY (reproductive B&W prints, colorfulness<20 skip).
//   Posters / graphic design / photographs are NEVER colour-gated.
//   Video-file works (medium MP4/Videodatei — animated "digital posters") are skipped.
//
// Politeness: single-file ~3 rps (CONCURRENCY=3 × ~330ms+latency), UA armin-museum-research.
//
// Usage:
//   node scripts/scrape-gestaltung-zurich.mjs --probe   # ~15 works end-to-end → {stem}-probe.json
//   node scripts/scrape-gestaltung-zurich.mjs --full    # full selection, resumable
//
// State (full mode): scripts/.state/gestaltung-zurich-progress.json
// Failures:          scripts/.state/gestaltung-zurich-failed.ndjson

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { autocropToWebp } from './lib/autocrop.mjs';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
require('dotenv').config({ path: path.join(REPO, '.env.local') });

const SLUG = 'gestaltung-zurich';
const STEM = `${SLUG}-collection`;
const BASE = 'https://www.emuseum.ch';
const UA = 'armin-museum-research/1.0';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const MODE = process.argv.includes('--full') ? 'full' : 'probe';
const PROBE_TARGET = 15;
const CONCURRENCY = 3;
const DELAY = 330; // ms pause per worker request → ~3 rps aggregate
const MIN_LONG_SIDE = 600;

// classification → { cap, category }  (caps total 25,000; JSON stays < 24MB)
const CLASSES = [
  { name: 'Plakat',          cap: 15000, category: 'poster',     colourGate: false },
  { name: 'Gebrauchsgrafik', cap: 4500,  category: 'print',      colourGate: false }, // graphic design — never gated
  { name: 'Kunstgrafik',     cap: 2000,  category: 'print',      colourGate: true  }, // art prints — B&W repro gate
  { name: 'Fotografie',      cap: 3500,  category: 'photograph', colourGate: false },
];

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const dec = (s) => (s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/\s+/g, ' ').trim();

// ---------- fetch with persistent JSESSIONID (avoids ;jsessionid URL bloat) ----------
let COOKIE = '';
async function get(url, attempt = 1) {
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA, ...(COOKIE ? { Cookie: COOKIE } : {}) }, redirect: 'follow' });
  } catch (e) {
    if (attempt <= 4) { await sleep(800 * 2 ** (attempt - 1)); return get(url, attempt + 1); }
    throw e;
  }
  if ((res.status === 429 || res.status >= 500) && attempt <= 4) {
    await sleep(1200 * 2 ** (attempt - 1));
    return get(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
  const sc = res.headers.get('set-cookie');
  if (!COOKIE && sc) { const m = sc.match(/JSESSIONID=[^;]+/); if (m) COOKIE = m[0]; }
  return res;
}
const getText = async (url) => (await get(url)).text();
const getBuf = async (url) => Buffer.from(await (await get(url)).arrayBuffer());

// ---------- listing page → items ----------
const listUrl = (cls, page) =>
  `${BASE}/en/search/classifications%3A%22${encodeURIComponent(cls)}%22/objects?page=${page}`;

function parseListing(html) {
  const items = [];
  const chunks = html.split(/<div data-emuseum-id="\d+" class="result item/).slice(1);
  for (const c of chunks) {
    const href = c.match(/href="\/en\/objects\/(\d+)\/([^";?#]+)/);
    if (!href) continue;
    const mediaId = (c.match(/\/internal\/media\/dispatcher\/(\d+)\/thumbnail/) || [])[1] || null;
    const title = dec((c.match(/<div class="title text-wrap">[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/) || [])[1]);
    const maker = dec((c.match(/<div class="primaryMaker text-wrap">([\s\S]*?)<\/div>/) || [])[1]);
    const date = dec((c.match(/<div class="displayDate text-wrap">([\s\S]*?)<\/div>/) || [])[1]);
    items.push({ objectId: href[1], slug: href[2].replace(/;jsessionid=[^?#"]*/, ''), mediaId, title, maker, date });
  }
  return items;
}

function totalResults(html) {
  const m = html.match(/([\d,']+)\s*results/);
  return m ? parseInt(m[1].replace(/[,']/g, ''), 10) : null;
}

// ---------- detail page → metadata ----------
// people roles that are NOT the creator. Observed EN role labels: Design, Photography (creator)
// vs Client, Print (printer firm), Publishing/Publisher, Portrayed Work (architects of a
// photographed building!), Department (school dept). Unknown roles stay included; if ALL roles
// are excluded we fall back to the grid primaryMaker (museum-designated creator).
const ROLE_EXCLUDE = /client|auftrag|druck|print|publish|verlag|herausgeber|manufactur|hersteller|production|ausf|execution|vertrieb|distribution|donat|schenkung|leihgeber|lender|portrayed|depicted|dargestellt|abgebildet|sitter|model|department|commission/i;

function parseDetail(html) {
  const out = {};
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  out.title = h1 ? dec(h1[1].replace(/<[^>]+>/g, ' ')) : '';

  const fieldBlocks = [...html.matchAll(/<div class="detailField (\w+)Field">([\s\S]*?)<\/div>/g)];
  const val = (inner) => dec(inner.replace(/<span class="detailFieldLabel">[\s\S]*?<\/span>/, '').replace(/<[^>]+>/g, ' '));

  out.people = [];
  let role = '';
  for (const [, kind, inner] of fieldBlocks) {
    if (kind === 'people') {
      const lab = inner.match(/<span class="detailFieldLabel">([\s\S]*?)<\/span>/);
      if (lab) role = dec(lab[1]);
      const name = dec(((inner.match(/<a[^>]*>([\s\S]*?)<\/a>/) || [])[1] || '').replace(/<[^>]+>/g, ' '));
      if (name) out.people.push({ role, name });
    } else if (kind === 'medium') out.medium = val(inner);
    else if (kind === 'dimensions') out.dimensions = val(inner);
    else if (kind === 'invno') out.objectNumber = val(inner);
    else if (kind === 'department') out.department = val(inner);
    else if (kind === 'displayDate') out.date = val(inner);
    else if (kind === 'classificationsFull') {
      out.classifications = [...inner.matchAll(/<li class="detailFieldValue">([\s\S]*?)<\/li>/g)].map((m) => dec(m[1]));
    }
  }
  out.artist = [...new Set(out.people.filter((p) => p.name && !ROLE_EXCLUDE.test(p.role)).map((p) => p.name))].join('; ');
  return out;
}

const isAnonymous = (s) => !s || /^(anonym|anonymous|unbekannt|unknown)\b/i.test(s);
const yearOf = (s) => { const m = (s || '').match(/\b(1[5-9]\d\d|20\d\d)\b/); return m ? +m[1] : null; };
const isVideoFile = (medium) => /mp4|\bmov\b|videodatei|video file|animation|animiert/i.test(medium || '');

// ---------- Hasler-Süsstrunk colorfulness (from buffer) — Kunstgrafik gate only ----------
async function colorfulness(buf) {
  const { data } = await sharp(buf, { limitInputPixels: false }).resize(80, 80, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rg = [], yb = [];
  for (let i = 0; i < data.length; i += 3) { const R = data[i], G = data[i + 1], B = data[i + 2]; rg.push(R - G); yb.push(0.5 * (R + G) - B); }
  const m = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => { const mu = m(a); return Math.sqrt(m(a.map((v) => (v - mu) ** 2))); };
  return Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(m(rg) ** 2 + m(yb) ** 2);
}

// ---------- per-work pipeline: detail → image → R2 → record ----------
async function processWork(item, cls) {
  const sourceUrl = `${BASE}/en/objects/${item.objectId}/${item.slug}`;
  const detail = parseDetail(await getText(sourceUrl));
  await sleep(DELAY);

  const title = detail.title || item.title;
  const artist = !isAnonymous(detail.artist) ? detail.artist : (!isAnonymous(item.maker) ? item.maker : '');
  const dateStr = detail.date || item.date || '';
  const year = yearOf(dateStr);
  if (!title || !artist || year == null) throw new Error('min4: missing title/artist/year');
  if (isVideoFile(detail.medium)) throw new Error('skip: video file (animated digital poster)');

  const originalImageUrl = `${BASE}/internal/media/dispatcher/${item.mediaId}/fullsize`;
  const buf = await getBuf(originalImageUrl);
  await sleep(DELAY);
  if (buf.length < 5000) throw new Error(`tiny image ${buf.length}B`);
  const meta = await sharp(buf).metadata();
  if (Math.max(meta.width || 0, meta.height || 0) < MIN_LONG_SIDE) throw new Error(`small image ${meta.width}x${meta.height}`);
  if (cls.colourGate) {
    const cf = await colorfulness(buf);
    if (cf >= 0 && cf < 20) throw new Error(`skip: monochrome print (colorfulness ${cf.toFixed(1)})`);
  }

  const { buffer } = await autocropToWebp(buf); // webp 2048/q85 (trim off by default)
  const id = `${SLUG}-${item.objectId}`;
  const key = `artworks/${STEM}/${id}-${sha(originalImageUrl).slice(0, 8)}-imageUrl.webp`;
  for (let att = 1; att <= 4; att++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      break;
    } catch (e) { if (att === 4) throw e; await sleep(500 * att); }
  }

  return {
    id,
    objectNumber: detail.objectNumber || '',
    title,
    artist,
    date: dateStr,
    year,
    medium: detail.medium || '',
    dimensions: detail.dimensions || '',
    category: cls.category,
    description: '',
    imageUrl: `${R2_PUBLIC}/${key}`,
    thumbnailUrl: `${BASE}/internal/media/dispatcher/${item.mediaId}/thumbnail`,
    onDisplay: false,
    displayLocation: '',
    sourceUrl,
    metadata: {
      department: detail.department || '',
      classification: cls.name,
      classificationsFull: detail.classifications || [],
      people: detail.people,
    },
    original_imageUrl: originalImageUrl,
  };
}

// ---------- output ----------
function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Museum für Gestaltung Zürich',
    collection: 'Collection',
    website: 'https://www.emuseum.ch/en/',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'html',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`[write] ${out} (${artworks.length} works)`, cats);
}

const logFail = (item, e) =>
  fs.appendFileSync(FAILED, JSON.stringify({ id: item.objectId, cls: item.cls, err: String(e.message || e) }) + '\n');

// selection: named maker + dated + has image (museum catalogue order preserved)
const qualifies = (it) => it.mediaId && it.title && !isAnonymous(it.maker) && yearOf(it.date) != null;

// ---------- probe ----------
async function probe() {
  console.log('[probe] target', PROBE_TARGET, 'works end-to-end');
  const picks = [];
  // Plakat page 40 = classic printed posters (page 1 is all recent MP4 "digital posters",
  // which processWork skips by design — the full run pays one detail fetch each, no more).
  for (const [cls, page, want] of [[CLASSES[0], 40, 7], [CLASSES[3], 1, 4], [CLASSES[2], 1, 4]]) {
    const html = await getText(listUrl(cls.name, page));
    await sleep(DELAY);
    const items = parseListing(html);
    const q = items.filter(qualifies).slice(0, want).map((it) => ({ ...it, cls }));
    console.log(`[probe] ${cls.name} p${page}: total=${totalResults(html)}, items=${items.length}, qualifying picked=${q.length}`);
    picks.push(...q);
  }
  const artworks = [];
  for (const item of picks.slice(0, PROBE_TARGET)) {
    try {
      const w = await processWork(item, item.cls);
      artworks.push(w);
      console.log(`  ok ${w.id} [${w.category}] ${w.artist.slice(0, 40)} — ${w.title.slice(0, 50)} (${w.year})`);
    } catch (e) { console.log(`  FAIL ${item.objectId}: ${e.message}`); logFail(item, e); }
  }
  writeCollection(artworks, `${STEM}-probe`);
  console.log(`[probe] DONE: ${artworks.length}/${Math.min(picks.length, PROBE_TARGET)} works`);
}

// ---------- full (resumable) ----------
function loadState() {
  try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { return { harvest: {}, queue: null }; }
}
const saveState = (st) => fs.writeFileSync(PROGRESS, JSON.stringify(st));

async function harvest(st) {
  for (const cls of CLASSES) {
    const h = (st.harvest[cls.name] ||= { page: 0, kept: 0, total: null, done: false });
    if (h.done) continue;
    st.items ||= {};
    const bucket = (st.items[cls.name] ||= []);
    while (true) {
      const page = h.page + 1;
      const html = await getText(listUrl(cls.name, page));
      await sleep(DELAY);
      if (h.total == null) h.total = totalResults(html);
      const items = parseListing(html);
      const q = items.filter(qualifies);
      bucket.push(...q.map((it) => ({ o: it.objectId, s: it.slug, m: it.mediaId, t: it.title, a: it.maker, d: it.date })));
      h.page = page; h.kept = bucket.length;
      const lastPage = Math.ceil((h.total || 0) / 30);
      if (h.kept >= cls.cap || items.length === 0 || page >= lastPage) { h.done = true; }
      if (page % 25 === 0 || h.done) {
        console.log(`[harvest] ${cls.name} p${page}/${lastPage}: kept ${h.kept}/${cls.cap}`);
        saveState(st);
      }
      if (h.done) break;
    }
  }
  // build queue: per-class cap, catalogue order, dedupe across classes by objectId
  const seen = new Set();
  st.queue = [];
  for (const cls of CLASSES) {
    let n = 0;
    for (const it of st.items[cls.name] || []) {
      if (n >= cls.cap) break;
      if (seen.has(it.o)) continue;
      seen.add(it.o);
      st.queue.push({ objectId: it.o, slug: it.s, mediaId: it.m, title: it.t, maker: it.a, date: it.d, cls: cls.name });
      n++;
    }
    console.log(`[select] ${cls.name}: ${n}/${cls.cap}`);
  }
  delete st.items;
  saveState(st);
}

async function full() {
  const st = loadState();
  if (!st.queue) { console.log('[full] harvesting listings…'); await harvest(st); }
  const clsByName = Object.fromEntries(CLASSES.map((c) => [c.name, c]));
  const outPath = path.join(REPO, 'public/data', `${STEM}.json`);
  let artworks = [];
  try { artworks = JSON.parse(fs.readFileSync(outPath, 'utf8')).artworks || []; } catch { /* fresh */ }
  const done = new Set(artworks.map((w) => w.id));
  try {
    for (const line of fs.readFileSync(FAILED, 'utf8').split('\n')) {
      if (line) done.add(`${SLUG}-${JSON.parse(line).id}`); // don't retry failures within a resume
    }
  } catch { /* none */ }

  const todo = st.queue.filter((q) => !done.has(`${SLUG}-${q.objectId}`));
  console.log(`[full] queue ${st.queue.length}, already done/failed ${done.size}, todo ${todo.length}`);
  let idx = 0, ok = 0, fail = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (idx < todo.length) {
      const item = todo[idx++];
      try { artworks.push(await processWork(item, clsByName[item.cls])); ok++; }
      catch (e) { fail++; logFail(item, e); }
      const n = ok + fail;
      if (n % 100 === 0) { console.log(`  …${n}/${todo.length} (ok ${ok}, fail ${fail})`); writeCollection(artworks, STEM); }
    }
  }));
  writeCollection(artworks, STEM);
  console.log(`[full] DONE: +${ok} ok, ${fail} failed → total ${artworks.length}`);
}

fs.mkdirSync(STATE_DIR, { recursive: true });
(MODE === 'full' ? full() : probe()).catch((e) => { console.error(e); process.exit(1); });
