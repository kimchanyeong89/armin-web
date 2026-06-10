#!/usr/bin/env node
// Museo Nacional de Bellas Artes (Chile), Santiago — collection scraper.
//
// Source: SURDOC (www.surdoc.cl) — the official national collections catalog run by the
//   museum's own parent agency (SNPC); the MNBA homepage links to it as "Colecciones".
//   Probe: scripts/.state/b3-probes/mnba-santiago.json (viable; 6,078 MNBA records).
// Enumeration: records are DENSE direct detail pages /registro/2-{1..6078} (403 beyond),
//   so we iterate IDs directly — no list-page pagination needed. Server-rendered Drupal HTML.
// Metadata (all parsed from the DETAIL page, per guide §3):
//   field--name-titles, field--name-inventory-numbers, field--name-record-number,
//   field--name-second-level-classification, field--name-collection,
//   field--name-hist-geo-creation-date ("Fecha de creación" — present on ~60% of records),
//   field--name-physical-description, and the field--name-object block whose labelled
//   form-items hold Objeto / Creador / Dimensiones / Técnica  Material / Ubicación / Transcripción.
// Image: first plain-original href in the main area —
//   /sites/default/files/record_images/{id}-original.jpg (legacy, max ~650px long side) or
//   /sites/default/files/records/images/{YYYY-MM}/{file} (new uploads).
//
// SCOPE (guide §1): painting | drawing | print | photograph | video | mixed_media_2d.
//   - Objeto value is the primary classifier (Pintura/Dibujo/Grabado/Fotografía…),
//     Técnica then Colección as fallback. Sculpture/ceramics/decorative → skipped.
//   - Photographic NEGATIVES (Objeto "Negativo (fotografía)") skipped — inverted images.
//   - Portrait miniatures skipped (objeto/técnica "miniatura", or painting on marfil/esmalte/
//     vitela with long side ≤14cm).
//   - B&W reproductive prints skipped at download: category print && colorfulness < 20
//     (Hasler-Süsstrunk; drawings always kept; photographs NEVER colour-gated).
//   - min-4 rule: records missing title/artist/year are DROPPED (no placeholders).
//     Year comes only from "Fecha de creación" ("Siglo XIX" → 1801, earliest estimate).
//   - Image floors: non-painting < 400px long side skipped (low-quality bar);
//     paintings collected with no floor (only a <200px sanity cut). Source max is ~650px.
//
// Usage:
//   node scripts/scrape-mnba-santiago.mjs --probe   # first ~20 in-scope end-to-end → partial collection JSON
//   node scripts/scrape-mnba-santiago.mjs --full    # everything in-scope, resumable
// State (full mode): scripts/.state/mnba-santiago-progress.json (+ -collected.ndjson),
//   failures → scripts/.state/mnba-santiago-failed.ndjson. Re-run to resume.

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

const SLUG = 'mnba-santiago';
const STEM = `${SLUG}-collection`;
const BASE = 'https://www.surdoc.cl';
const MAX_N = 6078;                       // facet total for institution:3 (probe-verified; 403 beyond)
const UA = 'armin-museum-research/1.0';   // probe-verified never blocked
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE, `${SLUG}-progress.json`);
const COLLECTED = path.join(STATE, `${SLUG}-collected.ndjson`);
const FAILED = path.join(STATE, `${SLUG}-failed.ndjson`);
const OUT = path.join(REPO, 'public/data', `${STEM}.json`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'probe';
const PROBE_TARGET = 20;
const START_OVERRIDE = Math.max(1, +(process.env.MNBA_START || 1)); // dev: probe a specific ID region

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- polite rate gate (~3.4 rps across ALL surdoc requests) ----------
let lastReq = 0;
const GAP = 290;
async function gate() {
  const wait = lastReq + GAP - Date.now();
  if (wait > 0) await sleep(wait);
  lastReq = Date.now();
}

async function get(url, asBuf = false) {
  for (let att = 1; att <= 3; att++) {
    try {
      await gate();
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'es' } });
      if (r.status === 403 || r.status === 404) return { gone: r.status };
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return asBuf ? { buf: Buffer.from(await r.arrayBuffer()) } : { text: await r.text() };
    } catch (e) {
      if (att === 3) return { err: String(e.message || e) };
      await sleep(900 * att);
    }
  }
}

// ---------- HTML helpers ----------
const decodeEntities = (s) => String(s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d));
const text = (s) => decodeEntities(String(s || '').replace(/<[^>]+>/g, ' '))
  .replace(/\s+/g, ' ').replace(/\s+([,;.:])/g, '$1').trim();
const deacc = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Drupal inline field: slice from field--name-{name} to the NEXT field--name- div.
function fieldBlock(main, name) {
  const m = new RegExp(`field--name-${name}\\b`).exec(main);
  if (!m) return '';
  const rest = main.slice(m.index + m[0].length);
  const next = rest.search(/field--name-/);
  return next === -1 ? rest : rest.slice(0, next);
}
// text of the field-item div(s) inside a block ("field-item" exact class token, not "field-items")
function fieldValue(main, name) {
  const b = fieldBlock(main, name);
  if (!b) return '';
  const items = [...b.matchAll(/class="(?:[^"]*\s)?field-item(?:\s[^"]*)?"[^>]*>(.*?)<\/div>/gs)]
    .map((m) => text(m[1])).filter(Boolean);
  return [...new Set(items)].join('; ');
}
// labelled form-items inside the field--name-object block: Objeto / Creador / Dimensiones / …
function labeledItems(block) {
  return [...block.matchAll(/<label class="form-item__label">([^<]+)<\/label>\s*<div class="field-item">(.*?)<\/div>\s*<\/div>/gs)]
    .map((m) => ({ label: text(m[1]), html: m[2] }));
}
// creator-name-item → person name (strip trailing AAT role links: "Pintor/a", "Grabador/a", …)
function parseCreators(html) {
  if (!html) return [];
  const segs = html.includes('creator-name-item')
    ? html.split(/class="creator-name-item"[^>]*>/).slice(1)
    : [html];
  const names = [];
  for (const seg of segs) {
    const roles = new Set([...seg.matchAll(/<a[^>]*aatespanol[^>]*>([^<]*)<\/a>/g)].map((m) => text(m[1])));
    const name = text(seg).split(',').map((p) => p.trim()).filter((p) => p && !roles.has(p)).join(', ').trim();
    if (name) names.push(name);
  }
  return [...new Set(names)];
}

// ---------- year ----------
const ROMAN = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
const romanVal = (s) => { let v = 0; for (let i = 0; i < s.length; i++) { const a = ROMAN[s[i]], b = ROMAN[s[i + 1]] || 0; v += a < b ? -a : a; } return v; };
function parseYear(s) {
  if (!s) return null;
  const m = s.match(/\b(1[2-9]\d{2}|20[0-2]\d)\b/);          // first 4-digit year = earliest in ranges
  if (m) return +m[1];
  const r = s.match(/siglo\s+([IVXLCDM]+)/i);                // "Siglo XIX" → 1801 (earliest estimate)
  if (r) { const c = romanVal(r[1].toUpperCase()); if (c >= 12 && c <= 21) return (c - 1) * 100 + 1; }
  return null;
}

// ---------- scope classifier (Objeto → Técnica → Colección) ----------
const PLACEHOLDER_ARTIST = /^(anonymous|unknown|unidentified|n\/?a|none|sin firma|sin autor|autor desconocido|desconocid[oa](\s*\/\s*a)?|no artist|artist unknown|-+)$/i; // "Anónimo" is a legitimate attribution, NOT in this list; SURDOC writes "Desconocido/a"
const OUT_OF_SCOPE = /escultura|relieve|ceramica|alfareria|porcelana|loza|textil|tapiz|tapiceria|alfombra|bordado|vestimenta|indumentaria|traje|mobiliario|mueble|silla\b|mesa\b|numismatica|medalla|moneda|billete|filatelia|vitral|vidrio|orfebreria|plateria|joyeria|mascara|vasija|jarron|anfora|busto|instalacion|maqueta|herramienta|arma\b|armamento|libro|partitura|manuscrito|abanico|figura\b|estatuilla|talla\b|trofeo|placa conmemorativa/;
function classify(objeto, tecnica, coleccion) {
  const o = deacc((objeto || '').toLowerCase());
  const t = deacc((tecnica || '').toLowerCase());
  const c = deacc((coleccion || '').toLowerCase());
  if (/miniatura/.test(o + ' ' + t)) return { skip: 'miniature' };
  if (/negativo|diapositiva|placa fotografica/.test(o)) return { skip: 'photo-negative' };
  if (o && OUT_OF_SCOPE.test(o)) return { skip: `out-of-scope:${objeto.slice(0, 40)}` };
  if (/pintura|cuadro|acuarela/.test(o)) return { cat: 'painting' };
  if (/dibujo|boceto|croquis|apunte/.test(o)) return { cat: 'drawing' };
  if (/grabado|estampa|aguafuerte|litografia|xilografia|serigrafia|afiche|cartel|poster/.test(o)) return { cat: 'print' };
  if (/fotografia/.test(o)) return { cat: 'photograph' };
  if (/video|pelicula|cine/.test(o)) return { cat: 'video' };
  if (/collage|tecnica mixta/.test(o)) return { cat: 'mixed_media_2d' };
  // técnica fallback (objeto missing/unrecognised)
  if (/oleo|acrilic|tempera|temple\b|gouache|encaustica|fresco|acuarela/.test(t)) return { cat: 'painting' };
  if (/aguafuerte|aguatinta|litografia|xilografia|serigrafia|grabado|punta seca|mezzotinta|linoleo|buril|estampa|offset/.test(t)) return { cat: 'print' };
  if (/lapiz|carboncillo|carbon\b|sanguina|pastel|grafito|tinta|pluma|crayon|dibujo/.test(t)) return { cat: 'drawing' };
  if (/fotografia|gelatina|albumina|daguerrotipo|cianotipo/.test(t)) return { cat: 'photograph' };
  if (/video/.test(t)) return { cat: 'video' };
  if (/collage|mixta/.test(t)) return { cat: 'mixed_media_2d' };
  if (/- ?pintura/.test(c)) return { cat: 'painting' };
  if (/- ?dibujo/.test(c)) return { cat: 'drawing' };
  if (/- ?grabado/.test(c)) return { cat: 'print' };
  if (/- ?fotografia/.test(c)) return { cat: 'photograph' };
  return { skip: `unclassified:${(objeto || tecnica || coleccion || '?').slice(0, 40)}` };
}
const maxDimCm = (dim) => Math.max(0, ...[...(dim || '').matchAll(/(\d+(?:[.,]\d+)?)\s*cm/gi)].map((m) => parseFloat(m[1].replace(',', '.'))));

// ---------- image ----------
function findImage(main) {
  const href = main.match(/href="((?:https:\/\/www\.surdoc\.cl)?\/sites\/default\/files\/(?:records\/images|record_images)\/[^"?]+\.(?:jpe?g|png|tiff?))"/i);
  if (href) return href[1].startsWith('http') ? href[1] : BASE + href[1];
  const src = main.match(/(?:data-src|src)="(\/sites\/default\/files\/styles\/[^"]+?\/public\/(?:records\/images|record_images)\/[^"?]+)(?:\?[^"]*)?"/i);
  if (src) return BASE + src[1].replace(/\/styles\/[^/]+\/public\//, '/');
  return null;
}
// Hasler-Süsstrunk colorfulness on the downloaded buffer (B&W reproductive-print gate)
async function colorfulness(buf) {
  const { data, info } = await sharp(buf, { limitInputPixels: false })
    .resize(80, 80, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels < 3) return 0; // grayscale source = monochrome by definition
  const rg = [], yb = [];
  for (let i = 0; i + 2 < data.length; i += info.channels) {
    const R = data[i], G = data[i + 1], B = data[i + 2];
    rg.push(R - G); yb.push(0.5 * (R + G) - B);
  }
  const m = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => { const mu = m(a); return Math.sqrt(m(a.map((v) => (v - mu) ** 2))); };
  return Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(m(rg) ** 2 + m(yb) ** 2);
}
async function uploadR2(key, buffer) {
  for (let att = 1; att <= 4; att++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      return;
    } catch (e) { if (att === 4) throw e; await sleep(500 * att); }
  }
}

// ---------- one record end-to-end ----------
async function processN(n) {
  const url = `${BASE}/registro/2-${n}`;
  const res = await get(url);
  if (res.gone) return { status: 'gone' };
  if (res.err) return { status: 'fail', stage: 'detail', url, err: res.err };
  const main = res.text.split('contenido-relacionado-wrapper')[0];

  const inst = fieldValue(main, 'institution-id');
  if (inst && !/bellas artes/i.test(inst)) return { status: 'skip', reason: 'other-institution' };

  const objBlock = fieldBlock(main, 'object');
  const items = labeledItems(objBlock);
  const first = (lbl) => (items.find((i) => i.label === lbl) || {}).html || '';
  const objeto = text(first('Objeto'));
  const tecnica = text(first('Técnica / Material'));
  const dimensions = text(first('Dimensiones'));
  const location = text(first('Ubicación'));
  const transcription = text(first('Transcripción'));
  const creators = parseCreators(first('Creador'));

  let title = fieldValue(main, 'titles');
  if (!title) {
    const t = res.text.match(/<title>([^<]*?)\s*\|\s*SURDOC/);
    if (t) title = text(t[1]);
  }
  const clasif = fieldValue(main, 'second-level-classification');
  const coleccion = fieldValue(main, 'collection');
  const inventory = fieldValue(main, 'inventory-numbers');
  const recordNumber = fieldValue(main, 'record-number') || `2-${n}`;
  const dateStr = fieldValue(main, 'hist-geo-creation-date');
  const place = fieldValue(main, 'hist-geo-creation-place');
  const description = fieldValue(main, 'physical-description');
  const year = parseYear(dateStr);

  const cls = classify(objeto, tecnica, coleccion);
  if (cls.skip) return { status: 'skip', reason: cls.skip };
  const cat = cls.cat;
  if (cat === 'painting' && /marfil|esmalte|vitela/.test(deacc(tecnica.toLowerCase())) && maxDimCm(dimensions) > 0 && maxDimCm(dimensions) <= 14)
    return { status: 'skip', reason: 'miniature' };

  // min-4 guard — drop, never placeholder-fill (guide §2)
  const artist = creators.join('; ');
  if (!title) return { status: 'skip', reason: 'no-title' };
  if (!artist || PLACEHOLDER_ARTIST.test(artist)) return { status: 'skip', reason: 'no-artist' };
  if (year == null) return { status: 'skip', reason: 'no-year' };

  const imgSrc = findImage(main);
  if (!imgSrc) return { status: 'skip', reason: 'no-image' };

  const ires = await get(imgSrc, true);
  if (ires.gone) return { status: 'skip', reason: 'image-gone' };
  if (ires.err) return { status: 'fail', stage: 'image-dl', url: imgSrc, err: ires.err };
  if (ires.buf.length < 3000) return { status: 'skip', reason: 'image-tiny-file' };

  let meta;
  try { meta = await sharp(ires.buf, { limitInputPixels: false }).metadata(); }
  catch (e) { return { status: 'fail', stage: 'image-decode', url: imgSrc, err: String(e.message || e) }; }
  const long = Math.max(meta.width || 0, meta.height || 0);
  if (cat === 'painting' ? long < 200 : long < 400) return { status: 'skip', reason: `small-image-${cat}` };

  if (cat === 'print') {
    const cf = await colorfulness(ires.buf);
    if (cf < 20) return { status: 'skip', reason: 'bw-print' };
  }

  const id = `${SLUG}-${recordNumber}`;
  const hash8 = sha(imgSrc).slice(0, 8);
  const key = `artworks/${STEM}/${id}-${hash8}-imageUrl.webp`;
  try {
    const { buffer } = await autocropToWebp(ires.buf); // default: pure webp(2048/q85), no trim
    await uploadR2(key, buffer);
  } catch (e) { return { status: 'fail', stage: 'webp-upload', url: imgSrc, err: String(e.message || e) }; }

  const metadata = {};
  if (recordNumber) metadata.record_number = recordNumber;
  if (clasif) metadata.classification = clasif;
  if (coleccion) metadata.collection = coleccion;
  if (place) metadata.creation_place = place;
  if (transcription) metadata.transcription = transcription;
  if (location) metadata.location = location;
  const onDisplay = /en exhibici/i.test(location);

  return {
    status: 'ok',
    work: {
      id,
      objectNumber: inventory || recordNumber,
      title,
      artist,
      date: dateStr,
      year,
      medium: tecnica,
      dimensions,
      category: cat,
      description,
      imageUrl: `${R2_PUBLIC}/${key}`,
      thumbnailUrl: imgSrc,
      onDisplay,
      displayLocation: onDisplay ? text(location.replace(/^en exhibici[oó]n\s*-?\s*/i, '')) : '',
      sourceUrl: url,
      metadata,
      original_imageUrl: imgSrc,
    },
  };
}

// ---------- state / output ----------
function loadNdjson() {
  if (!fs.existsSync(COLLECTED)) return [];
  const seen = new Set(); const out = [];
  for (const line of fs.readFileSync(COLLECTED, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const w = JSON.parse(line); if (!seen.has(w.id)) { seen.add(w.id); out.push(w); } } catch { /* skip bad line */ }
  }
  return out;
}
function saveProgress(nextN, tallies, done = false) {
  const tmp = PROGRESS + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ nextN, done, tallies, updated: new Date().toISOString() }, null, 2));
  fs.renameSync(tmp, PROGRESS);
}
function writeCollection(works) {
  const seen = new Set();
  const artworks = works.filter((w) => !seen.has(w.id) && seen.add(w.id))
    .sort((a, b) => (+a.id.split('-').pop() || 0) - (+b.id.split('-').pop() || 0));
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Museo Nacional de Bellas Artes, Santiago',
    collection: 'Collection',
    website: 'https://www.surdoc.cl/colecciones?f%5B0%5D=institution%3A3',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'html',
    category_breakdown: cats,
    artworks,
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  const mb = (fs.statSync(OUT).size / 1e6).toFixed(1);
  console.log(`[write] ${OUT} — ${artworks.length} works, ${mb} MB,`, cats);
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE, { recursive: true });
  let startN = START_OVERRIDE;
  let works = [];
  let tallies = { scanned: 0, ok: 0, gone: 0, fail: 0, skips: {} };

  if (MODE === 'full' && fs.existsSync(PROGRESS)) {
    const prog = JSON.parse(fs.readFileSync(PROGRESS, 'utf8'));
    works = loadNdjson();
    if (prog.done) { console.log(`[resume] already done — rebuilding JSON from ${works.length} collected works`); writeCollection(works); return; }
    startN = prog.nextN || 1;
    tallies = prog.tallies || tallies;
    console.log(`[resume] from 2-${startN} (${works.length} collected so far)`);
  }

  console.log(`[${MODE}] iterating /registro/2-{${startN}..${MAX_N}}${MODE === 'probe' ? ` until ${PROBE_TARGET} in-scope works` : ''}`);
  for (let n = startN; n <= MAX_N; n++) {
    const r = await processN(n);
    tallies.scanned++;
    if (r.status === 'ok') {
      works.push(r.work);
      tallies.ok++;
      if (MODE === 'full') fs.appendFileSync(COLLECTED, JSON.stringify(r.work) + '\n');
      if (MODE === 'probe') console.log(`  [ok ${works.length}/${PROBE_TARGET}] 2-${n} ${r.work.category} | ${r.work.artist} — ${r.work.title.slice(0, 40)} (${r.work.year})`);
    } else if (r.status === 'skip') {
      tallies.skips[r.reason] = (tallies.skips[r.reason] || 0) + 1;
    } else if (r.status === 'gone') {
      tallies.gone++;
    } else {
      tallies.fail++;
      fs.appendFileSync(FAILED, JSON.stringify({ ts: new Date().toISOString(), mode: MODE, n, stage: r.stage, url: r.url, err: r.err }) + '\n');
      console.log(`  [fail] 2-${n} @${r.stage}: ${r.err}`);
    }
    if (MODE === 'full') {
      if (n % 100 === 0) saveProgress(n + 1, tallies);
      if (n % 500 === 0) { writeCollection(works); console.log(`[progress] 2-${n}/${MAX_N} | ok ${tallies.ok} fail ${tallies.fail} gone ${tallies.gone}`); }
    } else if (n % 25 === 0) {
      console.log(`[progress] scanned to 2-${n} | collected ${works.length}`);
    }
    if (MODE === 'probe' && works.length >= PROBE_TARGET) break;
  }

  writeCollection(works);
  if (MODE === 'full') saveProgress(MAX_N + 1, tallies, true);
  console.log(`\n[${MODE}] DONE. scanned ${tallies.scanned} | collected ${tallies.ok} | failed ${tallies.fail} | gone ${tallies.gone}`);
  console.log('[skips]', JSON.stringify(tallies.skips, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
