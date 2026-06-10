#!/usr/bin/env node
// Museo de Arte de Lima (MALI) — collection scraper.
// Source: museum's OWN Gallery Systems eMuseum portal at coleccion.mali.pe
//   (linked from mali.pe/es/colecciones-y-archivo/). JSON API is disabled
//   ("Función deshabilitada") but HTML browse + detail pages are fully open.
//   Browse : https://coleccion.mali.pe/objects/images?filter=classification%3A{Facet}&page={N}
//            (with-images module, 12 objects/page; facets: Pintura, Dibujo, Fotografía, Grabado)
//   Detail : https://coleccion.mali.pe/objects/{id}/{slug}  (title h1, peopleField artist,
//            FECHA, TÉCNICA, MEDIDAS, CLASIFICACIÓN, CÓDIGO, credit line, Descripción, ESTATUS)
//   Image  : https://coleccion.mali.pe/internal/media/dispatcher/{mediaId}/full
//            (JPEG, 800px long edge — largest derivative; mediaId from og:image, ≠ object id)
//
// SCOPE: flat visual art via classification facets — Pintura→painting (ALL, no cap),
//   Dibujo→drawing, Fotografía→photograph, Grabado→print. Total in-scope ~7,973 of 11,350
//   (out of scope skipped at the facet level: Cerámica/Metales/Textil/Escultura/etc.).
//   Monochrome prints (category=print + Hasler-Süsstrunk colorfulness<20 on the downloaded
//   buffer) are skipped BEFORE R2 upload. Drawings always kept regardless of colour;
//   photographs are NEVER colour-gated. Portrait-locket miniatures (Pintura on
//   marfil/vitela/esmalte, max dim ≤14 cm) are skipped.
//
// POLITENESS: robots.txt Disallow covers /assets,/modules.gz,/objects.filterpanel,/users/login
//   (none touched). All requests share one global throttle (~3.3 rps, 300 ms interval)
//   across browse pages, detail pages and dispatcher images (all same origin).
//
// RESUMABLE: scripts/.state/mali-lima-progress.json stores per-facet pagination + per-work
//   status (ok records included), atomically rewritten every ~5 s — safe to kill/re-run.
//   Failures append to scripts/.state/mali-lima-failed.ndjson; error works retry on next run.
//
// Usage:
//   node scripts/scrape-mali-lima.mjs --probe   # first ~20 in-scope works end-to-end (meta + R2 + partial JSON)
//   node scripts/scrape-mali-lima.mjs --full    # everything in-scope (resumable)

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

const SLUG = 'mali-lima';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://coleccion.mali.pe';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);
const OUT_PATH = path.join(REPO, 'public/data', `${COLLECTION_STEM}.json`);

const FACETS = ['Pintura', 'Dibujo', 'Fotografía', 'Grabado'];
const CLASS_MAP = { pintura: 'painting', dibujo: 'drawing', 'fotografía': 'photograph', grabado: 'print' };
const BROWSE_URL = (facet, page) => `${BASE}/objects/images?filter=${encodeURIComponent(`classification:${facet}`)}&page=${page}`;

const REQ_INTERVAL_MS = 300;     // global same-origin throttle (~3.3 rps)
const CONCURRENCY = 3;           // workers (limiter still caps the aggregate rate)
const MAX_PAGES_PER_FACET = 400; // hard stop (largest facet Dibujo ≈ 296 pages)
const CF_THRESHOLD = 20;         // colorfulness below this = monochrome print → skip
const MIN_IMG_PX = 400;          // long-edge floor (dispatcher /full is 800px)

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'probe';
const PROBE_TARGET = 20;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ',
  uuml: 'ü', auml: 'ä', ouml: 'ö', Uuml: 'Ü', szlig: 'ß', ccedil: 'ç', Ccedil: 'Ç',
  agrave: 'à', egrave: 'è', igrave: 'ì', ograve: 'ò', ugrave: 'ù', acirc: 'â', ecirc: 'ê',
};
const decodeEntities = (s) => (s || '')
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m);
const stripTags = (s) => decodeEntities((s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// ---------- global same-origin throttle ----------
let nextSlot = 0;
async function throttle() {
  const now = Date.now();
  const wait = nextSlot - now;
  nextSlot = Math.max(now, nextSlot) + REQ_INTERVAL_MS;
  if (wait > 0) await sleep(wait);
}

async function fetchHtml(url) {
  for (let att = 1; att <= 3; att++) {
    await throttle();
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      if (att === 3) throw e;
      await sleep(2000 * att);
    }
  }
}

async function dlImage(url) {
  for (let att = 1; att <= 3; att++) {
    await throttle();
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 3000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) {
      if (att === 3) throw e;
      await sleep(1500 * att);
    }
  }
}

async function uploadR2(key, buffer) {
  for (let att = 1; att <= 4; att++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      return;
    } catch (e) { if (att === 4) throw e; await sleep(500 * att); }
  }
}

// ---------- colorfulness (Hasler-Süsstrunk) on a raw image buffer, pre-upload ----------
// (copied from scripts/audit/curate-grayscale-prints.mjs, adapted to take a buffer)
async function colorfulness(buf) {
  const { data } = await sharp(buf, { limitInputPixels: false }).resize(80, 80, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rg = [], yb = [];
  for (let i = 0; i < data.length; i += 3) {
    const R = data[i], G = data[i + 1], B = data[i + 2];
    rg.push(R - G); yb.push(0.5 * (R + G) - B);
  }
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => { const mu = mean(a); return Math.sqrt(mean(a.map((v) => (v - mu) ** 2))); };
  return Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(mean(rg) ** 2 + mean(yb) ** 2);
}

// ---------- detail page → fields ----------
// Generic eMuseum detailField: <div class="detailField {cls}"><span class="detailFieldLabel">…</span>
//   <span class="detailFieldValue">VALUE</span></div>  (value may wrap an <a>; no nested divs)
function fieldValue(html, cls) {
  const m = html.match(new RegExp(`class="detailField ${cls}">([\\s\\S]*?)</div>`));
  if (!m) return '';
  const inner = m[1].replace(/<span class="detailFieldLabel">[\s\S]*?<\/span>/, '');
  return stripTags(inner);
}

function parseYear(dateStr) {
  if (!dateStr) return null;
  const m4 = dateStr.match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
  if (m4) return parseInt(m4[0], 10);
  // century-only dates ("Siglo XVII") → earliest year of the century
  const rom = dateStr.match(/siglos?\s+([IVXLCDM]+)/i);
  if (rom) {
    const RV = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    const t = rom[1].toUpperCase();
    let c = 0;
    for (let i = 0; i < t.length; i++) {
      const v = RV[t[i]] || 0, nx = RV[t[i + 1]] || 0;
      c += v < nx ? -v : v;
    }
    if (c >= 10 && c <= 21) return (c - 1) * 100 + 1;
  }
  return null;
}

const maxDimCm = (dim) => {
  if (!dim || !/cm/i.test(dim)) return null;
  const nums = (dim.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => parseFloat(n.replace(',', '.')));
  return nums.length ? Math.max(...nums) : null;
};

// Portrait-locket miniature heuristic (guide §1): painting on ivory/vellum/enamel, ≤14 cm.
// "papel vitela" (vellum PAPER) is a paper type, not a locket support → not a miniature.
function isPortraitMiniature(d) {
  if (!/(marfil|vitela|esmalte)/i.test(d.medium) || /papel\s+vitela/i.test(d.medium)) return false;
  const mx = maxDimCm(d.dimensions);
  return mx != null && mx <= 14;
}

function parseDetail(html) {
  const out = {};
  const t = html.match(/class="detailField titleField"><h1[^>]*>([\s\S]*?)<\/h1>/);
  out.title = t ? stripTags(t[1]) : '';

  // artist(s): name spans inside the peopleField block (label "Artista"); life dates in a
  // following plain span, e.g. "(Lima, 1955 - 2016)"
  out.artist = '';
  out.artistLife = '';
  const pf = html.match(/class="detailField peopleField">([\s\S]*?)<\/div>/);
  if (pf) {
    const names = [...pf[1].matchAll(/property="name"[^>]*>([\s\S]*?)<\/span>/g)].map((m) => stripTags(m[1])).filter(Boolean);
    out.artist = [...new Set(names)].join('; ');
    const life = stripTags(pf[1]).match(/\(([^()]*\d{3,4}[^()]*)\)/);
    if (life) out.artistLife = life[1].trim();
  }

  out.dateStr = fieldValue(html, 'displayDateField');
  out.year = parseYear(out.dateStr);
  out.medium = fieldValue(html, 'mediumField');
  out.dimensions = fieldValue(html, 'dimensionsField');
  out.classification = fieldValue(html, 'classificationField');
  out.objectNumber = fieldValue(html, 'invnoField');
  out.credit = fieldValue(html, 'creditlineField');

  const desc = html.match(/descriptionField">[\s\S]*?class="toggleContent"[^>]*>([\s\S]*?)<\/span>/);
  out.description = desc ? stripTags(desc[1]) : '';

  const ov = html.match(/onviewField">[\s\S]{0,400}?class="detailFieldValue[^"]*"[^>]*>([\s\S]*?)<\/span>/);
  out.onDisplay = ov ? /en exposici/i.test(stripTags(ov[1])) : false;

  // primary mediaId: og:image meta first, then first dispatcher/{id}/full in the body
  let mediaId = null;
  const og = html.match(/<meta[^>]*og:image[^>]*>/);
  const m1 = og && og[0].match(/dispatcher\/(\d+)\//);
  if (m1) mediaId = m1[1];
  if (!mediaId) {
    const m2 = html.match(/\/internal\/media\/dispatcher\/(\d+)\/full/);
    if (m2) mediaId = m2[1];
  }
  out.mediaId = mediaId;
  return out;
}

// ---------- progress state ----------
function loadProgress() {
  if (fs.existsSync(PROGRESS)) return JSON.parse(fs.readFileSync(PROGRESS, 'utf8'));
  const facets = {};
  for (const f of FACETS) facets[f] = { nextPage: 1, complete: false, noFresh: 0 };
  return { facets, ids: [], paths: {}, idFacet: {}, works: {} };
}
let lastSave = 0;
function saveProgress(prog, force = false) {
  if (!force && Date.now() - lastSave < 5000) return;
  lastSave = Date.now();
  const tmp = PROGRESS + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(prog));
  fs.renameSync(tmp, PROGRESS);
}
const appendFailed = (obj) => fs.appendFileSync(FAILED, JSON.stringify(obj) + '\n');
const countOk = (prog) => Object.values(prog.works).filter((w) => w.status === 'ok').length;

// ---------- facet browse enumeration (one page per call; dedupes; detects end) ----------
async function fetchFacetPage(prog, facet) {
  const st = prog.facets[facet];
  if (st.nextPage > MAX_PAGES_PER_FACET) { st.complete = true; saveProgress(prog, true); return; }
  const html = await fetchHtml(BROWSE_URL(facet, st.nextPage));
  const pairs = [...(html || '').matchAll(/href="\/objects\/(\d+)\/([^"?#]+)/g)].map((m) => [m[1], m[2]]);
  const seen = new Set();
  const fresh = [];
  for (const [id, slug] of pairs) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (!(id in prog.paths)) fresh.push([id, slug]);
  }
  if (pairs.length === 0) {
    st.complete = true;
    console.log(`[enum] ${facet} p${st.nextPage}: empty → facet complete (${prog.ids.filter((i) => prog.idFacet[i] === facet).length} ids)`);
  } else if (fresh.length === 0) {
    st.noFresh = (st.noFresh || 0) + 1;
    if (st.noFresh >= 3 || !(html || '').includes('id="pager"')) {
      st.complete = true;
      console.log(`[enum] ${facet} p${st.nextPage}: no new ids → facet complete (${prog.ids.filter((i) => prog.idFacet[i] === facet).length} ids)`);
    } else st.nextPage++;
  } else {
    st.noFresh = 0;
    for (const [id, slug] of fresh) {
      prog.paths[id] = `/objects/${id}/${slug}`;
      prog.idFacet[id] = facet;
      prog.ids.push(id);
    }
    if (st.nextPage % 25 === 0 || st.nextPage === 1) console.log(`[enum] ${facet} p${st.nextPage}: +${fresh.length} (total ${prog.ids.length})`);
    st.nextPage++;
  }
  saveProgress(prog, true);
}

// ---------- one work end-to-end ----------
function mark(prog, id, status, reason) {
  prog.works[id] = reason !== undefined ? { status, reason } : { status };
  saveProgress(prog);
}

async function processWork(prog, id) {
  const relPath = prog.paths[id] || `/objects/${id}`;
  const sourceUrl = BASE + relPath;
  try {
    const html = await fetchHtml(sourceUrl);
    if (!html) return mark(prog, id, 'skip', 'detail-404');
    const d = parseDetail(html);
    if (!d.title) return mark(prog, id, 'skip', 'no-title');

    const category = CLASS_MAP[(d.classification || '').toLowerCase().normalize('NFC').trim()];
    if (!category) return mark(prog, id, 'skip', `out-of-scope:${d.classification || 'none'}`);

    const missing = [];
    if (!d.artist) missing.push('artist');
    if (d.year == null) missing.push('year');
    if (missing.length) {
      appendFailed({ id, stage: 'meta', err: `min4-missing:${missing.join(',')}`, date: d.dateStr, url: sourceUrl });
      return mark(prog, id, 'skip', `min4-missing:${missing.join(',')}`);
    }
    if (category === 'painting' && isPortraitMiniature(d)) return mark(prog, id, 'skip', 'portrait-miniature');
    if (!d.mediaId) return mark(prog, id, 'skip', 'no-image');

    const imgUrl = `${BASE}/internal/media/dispatcher/${d.mediaId}/full`;
    const buf = await dlImage(imgUrl);
    const meta = await sharp(buf, { limitInputPixels: false }).metadata();
    if (Math.max(meta.width || 0, meta.height || 0) < MIN_IMG_PX) {
      return mark(prog, id, 'skip', `img-too-small ${meta.width}x${meta.height}`);
    }
    if (category === 'print') {
      const cf = await colorfulness(buf);
      if (cf >= 0 && cf < CF_THRESHOLD) {
        return mark(prog, id, 'skip', `grayscale-print cf=${cf.toFixed(1)}`); // before upload
      }
    }

    const { buffer } = await autocropToWebp(buf); // webp 2048/q85 (trim off by default)
    const gid = `${SLUG}-${id}`; // globally-unique id (guide §2: bare ints collide across collections)
    const key = `artworks/${COLLECTION_STEM}/${gid}-${sha(imgUrl).slice(0, 8)}-imageUrl.webp`;
    await uploadR2(key, buffer);

    prog.works[id] = {
      status: 'ok',
      artwork: {
        id: gid,
        objectNumber: d.objectNumber || '',
        title: d.title,
        artist: d.artist,
        date: d.dateStr,
        year: d.year,
        medium: d.medium,
        dimensions: d.dimensions,
        category,
        description: d.description || '',
        imageUrl: `${R2_PUBLIC}/${key}`,
        thumbnailUrl: `${BASE}/internal/media/dispatcher/${d.mediaId}/thumbnail`,
        onDisplay: d.onDisplay,
        displayLocation: '',
        sourceUrl,
        metadata: {
          object_id: id,
          media_id: d.mediaId,
          classification: d.classification,
          artist_life: d.artistLife,
          credit: d.credit,
          src_px: `${meta.width}x${meta.height}`,
        },
        original_imageUrl: imgUrl,
      },
    };
    saveProgress(prog);
  } catch (e) {
    prog.works[id] = { status: 'error', error: String(e.message || e) };
    appendFailed({ id, stage: 'work', err: String(e.message || e), url: sourceUrl });
    saveProgress(prog);
  }
}

// ---------- output ----------
function writeCollection(prog) {
  const artworks = prog.ids
    .map((id) => prog.works[id])
    .filter((w) => w && w.status === 'ok')
    .map((w) => w.artwork)
    .sort((a, b) => Number(a.metadata.object_id) - Number(b.metadata.object_id));
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Museo de Arte de Lima',
    collection: 'Colección MALI',
    website: 'https://coleccion.mali.pe',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'emuseum',
    category_breakdown: cats,
    artworks,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`[write] ${OUT_PATH} (${artworks.length} works) breakdown=`, cats);
}

function summarize(prog) {
  const tally = {};
  for (const w of Object.values(prog.works)) {
    const k = w.status === 'skip' ? `skip:${(w.reason || '').split(':')[0].split(' ')[0]}` : w.status;
    tally[k] = (tally[k] || 0) + 1;
  }
  console.log('[summary]', tally);
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const prog = loadProgress();
  const target = MODE === 'probe' ? PROBE_TARGET : Infinity;
  console.log(`[${MODE}] resume: ${prog.ids.length} ids known, ${countOk(prog)} ok`);

  if (MODE === 'full') {
    // enumerate every facet completely (resumes from each facet's nextPage)
    for (const facet of FACETS) {
      while (!prog.facets[facet].complete) await fetchFacetPage(prog, facet);
    }
    const perFacet = {};
    for (const id of prog.ids) perFacet[prog.idFacet[id]] = (perFacet[prog.idFacet[id]] || 0) + 1;
    console.log(`[enum] complete: ${prog.ids.length} in-scope ids`, perFacet);
  } else {
    // probe: page 1 of each facet is enough for ~20 works
    for (const facet of FACETS) {
      if (prog.facets[facet].nextPage === 1 && !prog.facets[facet].complete) await fetchFacetPage(prog, facet);
    }
  }

  // processing order: probe interleaves facets round-robin (tests all 4 category paths,
  // incl. the print grayscale gate); full keeps discovery order.
  let order = prog.ids;
  if (MODE === 'probe') {
    const byFacet = FACETS.map((f) => prog.ids.filter((id) => prog.idFacet[id] === f));
    order = [];
    for (let i = 0; i < Math.max(...byFacet.map((a) => a.length)); i++) {
      for (const arr of byFacet) if (arr[i]) order.push(arr[i]);
    }
  }

  let qi = 0, processed = 0, lastCp = countOk(prog);
  const nextId = () => {
    while (qi < order.length) {
      const id = order[qi++];
      const st = prog.works[id];
      if (!st || st.status === 'error') return id; // errors retry on re-run
    }
    return null;
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (countOk(prog) < target) {
      const id = nextId();
      if (id == null) break;
      await processWork(prog, id);
      processed++;
      if (processed % 50 === 0) {
        console.log(`  …${processed} processed this run (ok ${countOk(prog)}/${prog.ids.length} known)`);
      }
      if (MODE === 'full' && countOk(prog) - lastCp >= 500) {
        lastCp = countOk(prog);
        writeCollection(prog); // periodic checkpoint of the public JSON
      }
    }
  }));

  saveProgress(prog, true);
  writeCollection(prog);
  summarize(prog);
  console.log(`[${MODE}] DONE. in-scope ok=${countOk(prog)} of ${prog.ids.length} discovered works.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
