#!/usr/bin/env node
// Museo Botero (Bogotá) — full collection scraper.
// Source: Banco de la República's own collections portal (colecciones.banrepcultural.org,
//   LIMB Gallery-style Symfony app, server-rendered HTML — no API, no auth, no WAF).
//   List:   GET /es/busqueda-simple?ubicacinActual[0]=Museo Botero&pgn={0..N}   (15/page, 195 docs)
//   Detail: GET /es/documento/{slug}/{docId}   — metadata lives in
//           <div class="row field-container" id="{field}-field"> blocks
//           (numeroDeRegistro, artista|artistaPiezas, denominacin, tcnicaYMaterial, dimensiones, fechaDeCreacion)
//           and the main image id in data-image-id (original: /sw-media/{imageId}.jpg).
//
// SCOPE: flat visual works only. Doc slug suffix encodes type — "-escultura" (38) is excluded
//   at list level; everything else is classified authoritatively by the Denominación field:
//   Pintura→painting (114), Dibujo→drawing (38), Obra gráfica→print (4), Collage→mixed_media_2d (1).
//   Monochrome prints (category=print + Hasler-Süsstrunk colorfulness<20 on the downloaded buffer)
//   are skipped BEFORE upload per COLLECTION_SCRAPING_GUIDE §1. Drawings always kept.
//
// Usage:
//   node scripts/scrape-museo-botero.mjs --probe   # first ~20 in-scope works end-to-end (meta+R2+partial JSON)
//   node scripts/scrape-museo-botero.mjs --full    # everything in-scope, resumable
//
// Resume: scripts/.state/museo-botero-progress.json maps docId → {ok:{…}} | {skip:reason}.
//   Re-runs reuse done work (incl. probe's 20) and retry only failures
//   (failures are logged to scripts/.state/museo-botero-failed.ndjson, never stored as done).

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

const SLUG = 'museo-botero';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://colecciones.banrepcultural.org';
const SEARCH = (pgn) => `${BASE}/es/busqueda-simple?ubicacinActual%5B0%5D=Museo%20Botero&pgn=${pgn}`;
const UA = 'armin-museum-research/1.0';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);
const OUT = path.join(REPO, 'public/data', `${COLLECTION_STEM}.json`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--probe') ? 'probe' : null;
if (!MODE) { console.error('usage: node scripts/scrape-museo-botero.mjs --probe | --full'); process.exit(1); }
const PROBE_TARGET = 20;
const CONC = 3;
const PACE_MS = 450;            // sleep after every HTTP request per worker (~polite 3-4 rps total)
const CF_TH = 20;               // colorfulness threshold for monochrome print skip

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const decodeEntities = (s) => (s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#8217;/g, '’')
  .replace(/&#8216;/g, '‘').replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
  .replace(/&hellip;/g, '…').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();
const clean = (s) => decodeEntities(String(s).replace(/<br\s*\/?>/gi, ' | ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const deaccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---------- HTTP ----------
async function fetchText(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const t = await r.text();
      await sleep(PACE_MS);
      return t;
    } catch (e) { if (att === 3) throw e; await sleep(800 * att); }
  }
}

async function fetchBuf(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      await sleep(PACE_MS);
      if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) { if (att === 3) throw e; await sleep(800 * att); }
  }
}

// ---------- enumerate all docs from the server-rendered search ----------
async function enumerateDocs() {
  const docs = new Map(); // docId → {slug, docId}
  const first = await fetchText(SEARCH(0));
  const tm = first.match(/([\d.,]+)\s*resultado/);
  const total = tm ? parseInt(tm[1].replace(/[.,]/g, ''), 10) : 0;
  const pages = total ? Math.ceil(total / 15) : 50; // 50 = safety cap when total unparseable
  console.log(`[enumerate] ${total} documents at Museo Botero → ${pages} pages`);

  const collect = (html) => {
    let n = 0;
    for (const m of html.matchAll(/href="https:\/\/colecciones\.banrepcultural\.org\/es\/documento\/([^/"?]+)\/([0-9a-f]{24})[?"]/g)) {
      if (!docs.has(m[2])) { docs.set(m[2], { slug: m[1], docId: m[2] }); n++; }
    }
    return n;
  };
  collect(first);
  for (let p = 1; p < pages; p++) {
    const added = collect(await fetchText(SEARCH(p)));
    if (!tm && added === 0) break; // unparseable-total fallback: stop on empty page
  }
  console.log(`[enumerate] collected ${docs.size} unique docs`);
  return [...docs.values()];
}

// ---------- detail-page parsing ----------
function extractFields(html) {
  const out = {};
  const parts = html.split(/<div class="row field-container" id="([^"]+)-field">/);
  for (let i = 1; i < parts.length; i += 2) {
    let seg = parts[i + 1];
    // bound the last segment so footer markup can't leak in
    for (const stop of ['<input class="sw-hidden-input"', '</aside']) {
      const k = seg.indexOf(stop);
      if (k !== -1) seg = seg.slice(0, k);
    }
    const links = [...seg.matchAll(/<a [^>]*class="link-field[^"]*"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => clean(m[1])).filter(Boolean);
    const simples = [...seg.matchAll(/<div class="simple-field">([\s\S]*?)<\/div>/g)].map((m) => clean(m[1])).filter(Boolean);
    let text = links.length ? links.join('; ') : simples.join(' | ');
    if (!text) { // rare fallback: raw value-field text
      const vm = seg.match(/<div class="value-field">([\s\S]*)$/);
      if (vm) text = clean(vm[1]);
    }
    out[parts[i]] = { links, simples, text };
  }
  return out;
}

// Denominación → ARMIN category (null = out of scope / unknown)
function classify(denomRaw) {
  const d = deaccent((denomRaw || '').toLowerCase()).trim();
  if (!d) return null;
  if (d.includes('escultura')) return null;
  if (d.includes('pintura') || d.includes('acuarela')) return 'painting';
  if (d.includes('dibujo')) return 'drawing';
  if (d.includes('obra grafica') || d.includes('grabado') || d.includes('estampa')) return 'print';
  if (d.includes('collage')) return 'mixed_media_2d';
  if (d.includes('fotografia')) return 'photograph';
  return null;
}

function parseDetail(html, doc) {
  const f = extractFields(html);
  const denomRaw = (f.denominacin && f.denominacin.text) || '';
  const category = classify(denomRaw);

  let title = '';
  const og = html.match(/property="og:title" content="([^"]*)"/);
  if (og) title = decodeEntities(og[1]);
  if (!title) { const h2 = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/); if (h2) title = clean(h2[1]); }
  // titles carry a " - {Denominación}" suffix — strip it
  if (denomRaw && title.endsWith(` - ${denomRaw}`)) title = title.slice(0, -(` - ${denomRaw}`.length)).trim();
  title = title.replace(/\s+-\s+(Pintura|Dibujo|Escultura|Obra gráfica|Collage)\s*$/i, '').trim();

  const af = f.artista || f.artistaPiezas; // some records label the artist "Artistas" (id=artistaPiezas-field)
  const artist = ((af && af.links.length ? af.links : [af && af.text]) || [])
    .filter(Boolean).map((a) => a.replace(/[,;\s]+$/, '').trim()).filter(Boolean).join('; ');

  const dateRaw = (f.fechaDeCreacion && f.fechaDeCreacion.text) || '';
  const ym = dateRaw.match(/\b(1[3-9]\d{2}|20[0-2]\d)\b/);
  const year = ym ? parseInt(ym[1], 10) : null;

  const medium = (f.tcnicaYMaterial && f.tcnicaYMaterial.text) || '';

  // dimensions: "alto/largo : 43,0 cm | ancho/diam : 32,0 cm | prof/grosor : 0,0 cm [| framed set]"
  const dimRaw = (f.dimensiones && f.dimensiones.text) || '';
  const alto = dimRaw.match(/alto\/largo\s*:\s*([\d.,]+)\s*cm/);
  const ancho = dimRaw.match(/ancho\/diam\s*:\s*([\d.,]+)\s*cm/);
  const dimensions = alto && ancho ? `${alto[1]} × ${ancho[1]} cm` : dimRaw;
  const maxCm = Math.max(...[alto, ancho].map((m) => (m ? parseFloat(m[1].replace(',', '.')) : 0)));

  const im = html.match(/data-image-id="([0-9a-f]+)"/);

  return {
    docId: doc.docId, slug: doc.slug, title, artist, dateRaw, year, medium, dimensions, maxCm,
    denomRaw, category,
    objectNumber: (f.numeroDeRegistro && f.numeroDeRegistro.text) || '',
    coleccion: (f.coleccin && f.coleccin.text) || '',
    imageId: im ? im[1] : null,
    sourceUrl: `${BASE}/es/documento/${doc.slug}/${doc.docId}`,
  };
}

// ---------- monochrome detector (Hasler-Süsstrunk colorfulness, buffer input) ----------
// copied from scripts/audit/curate-grayscale-prints.mjs colorfulness() — buffer instead of R2 key
async function colorfulness(buf) {
  const { data } = await sharp(buf, { limitInputPixels: false }).resize(80, 80, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rg = [], yb = [];
  for (let i = 0; i < data.length; i += 3) { const R = data[i], G = data[i + 1], B = data[i + 2]; rg.push(R - G); yb.push(0.5 * (R + G) - B); }
  const m = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => { const mu = m(a); return Math.sqrt(m(a.map((v) => (v - mu) ** 2))); };
  return Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(m(rg) ** 2 + m(yb) ** 2);
}

// ---------- per-work pipeline ----------
async function uploadR2(key, buffer) {
  for (let att = 1; att <= 4; att++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      return;
    } catch (e) { if (att === 4) throw e; await sleep(400 * att); }
  }
}

async function processDoc(doc) {
  const html = await fetchText(`${BASE}/es/documento/${doc.slug}/${doc.docId}`);
  const a = parseDetail(html, doc);

  if (!a.category) return { skip: `out-of-scope denominacion: ${a.denomRaw || '?'}` };
  // portrait-locket miniature guard (ivory/enamel/vellum paint-led ≤14cm) — §1 scope
  if (a.category === 'painting' && /\b(marfil|esmalte|vitela)\b/i.test(a.medium) && a.maxCm > 0 && a.maxCm <= 14) {
    return { skip: `portrait-miniature: ${a.medium} ${a.dimensions}` };
  }
  const missing = [['title', a.title], ['artist', a.artist], ['year', a.year], ['category', a.category]].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) return { skip: `min4-missing: ${missing.join(',')} (date="${a.dateRaw}")` };
  if (!a.imageId) throw new Error('no data-image-id on detail page');

  const ORIG = `${BASE}/sw-media/${a.imageId}.jpg`;
  const BIG = `${BASE}/media/cache/big/sw-media/${a.imageId}.jpg`;
  let src, srcUrl = ORIG;
  try { src = await fetchBuf(ORIG); }
  catch { src = await fetchBuf(BIG); srcUrl = BIG; }

  const meta = await sharp(src, { limitInputPixels: false }).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 400) throw new Error(`too small ${meta.width}x${meta.height}`);
  if (a.category === 'print') {
    const cf = await colorfulness(src);
    if (cf < CF_TH) return { skip: `grayscale-print cf=${cf.toFixed(1)}` };
  }

  const { buffer } = await autocropToWebp(src); // opt-in trim is OFF → pure webp(2048/q85)
  const id = `${SLUG}-${a.docId}`;
  const key = `artworks/${COLLECTION_STEM}/${id}-${sha(srcUrl).slice(0, 8)}-imageUrl.webp`;
  await uploadR2(key, buffer);

  return {
    ok: {
      id,
      objectNumber: a.objectNumber,
      title: a.title,
      artist: a.artist,
      date: a.dateRaw,
      year: a.year,
      medium: a.medium,
      dimensions: a.dimensions,
      category: a.category,
      description: '',
      imageUrl: `${R2_PUBLIC}/${key}`,
      thumbnailUrl: BIG,
      onDisplay: true,
      displayLocation: 'Museo Botero',
      sourceUrl: a.sourceUrl,
      metadata: { docId: a.docId, imageId: a.imageId, coleccion: a.coleccion, srcW: meta.width || null, srcH: meta.height || null },
      original_imageUrl: srcUrl,
    },
  };
}

// ---------- output ----------
function writeCollection(artworks) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Museo Botero',
    collection: 'Collection',
    website: 'https://colecciones.banrepcultural.org/es/busqueda-simple?ubicacinActual%5B0%5D=Museo%20Botero',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'html+server-rendered-search',
    category_breakdown: cats,
    artworks,
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(`[write] ${OUT} (${artworks.length} works) breakdown=`, cats);
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const progress = fs.existsSync(PROGRESS) ? JSON.parse(fs.readFileSync(PROGRESS, 'utf8')) : {};
  const saveProgress = () => fs.writeFileSync(PROGRESS, JSON.stringify(progress));

  const all = await enumerateDocs();
  const sculptures = all.filter((d) => d.slug.endsWith('-escultura'));
  const inScope = all.filter((d) => !d.slug.endsWith('-escultura'));
  console.log(`[scope] in-scope ${inScope.length} (sculpture excluded at list level: ${sculptures.length})`);

  const targets = MODE === 'probe' ? inScope.slice(0, PROBE_TARGET) : inScope;
  const todo = targets.filter((d) => !progress[d.docId]);
  console.log(`[${MODE}] targets ${targets.length} | already done ${targets.length - todo.length} | to process ${todo.length}\n`);

  let done = 0, failed = 0;
  let idx = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < todo.length) {
      const doc = todo[idx++];
      try {
        const res = await processDoc(doc);
        progress[doc.docId] = res;
        if (res.skip) console.log(`  [skip] ${doc.slug.slice(0, 48)}: ${res.skip}`);
      } catch (e) {
        failed++;
        fs.appendFileSync(FAILED, JSON.stringify({ docId: doc.docId, slug: doc.slug, err: String(e.message || e), at: new Date().toISOString() }) + '\n');
        console.log(`  [fail] ${doc.slug.slice(0, 48)}: ${e.message}`);
      }
      if (++done % 10 === 0) { saveProgress(); console.log(`  …${done}/${todo.length} (failed ${failed})`); }
    }
  }));
  saveProgress();

  // assemble output from progress, in enumeration order
  const artworks = [];
  const skips = {};
  for (const d of targets) {
    const r = progress[d.docId];
    if (!r) continue; // failed this run → retry next run
    if (r.ok) artworks.push(r.ok);
    else if (r.skip) { const k = r.skip.split(':')[0]; skips[k] = (skips[k] || 0) + 1; }
  }
  writeCollection(artworks);
  console.log(`\n[${MODE}] DONE. collected ${artworks.length}/${targets.length} | failed ${failed} | skips:`, skips);
  console.log(`[${MODE}] full corpus: ${all.length} docs = ${inScope.length} in-scope + ${sculptures.length} sculpture`);
  if (failed) console.log(`[${MODE}] failures logged → ${FAILED} (re-run to retry)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
