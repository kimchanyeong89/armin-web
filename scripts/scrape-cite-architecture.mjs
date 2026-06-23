#!/usr/bin/env node
// Cité de l'architecture et du patrimoine (Paris) — FLAT works scraper.
// Genre: architecture (건축). Source: museum's OWN Drupal collection DB (no auth, no aggregator).
//
//   Collection search view:  https://www.citedelarchitecture.fr/fr/collections
//   Denomination facet list:  /fr/collections/denomination/{id}?page=N   (20 works/page, server-rendered)
//   Work detail page:         /fr/oeuvre/{slug}                          (Drupal field--name-* blocks)
//
// SCOPE — FLAT works only (architectural drawings + architectural photographs). The museum's
//   collection is dominated by 3D plaster casts (moulages) & scale models (maquettes), which are
//   OUT. We enumerate ONLY the in-scope denomination facets below, so 3D never enters the crawl.
//     IN: Dessin (1094) · Photographie (185) · Croquis (77) · Fichiers photographiques (74) ·
//         Dessin d'architecture / tirage numérique (72) · Dessin d'architecture (17) ·
//         Cartes et plans (11) · Carnet de croquis (11) · Plan (8) · Portfolio/planches (1) · Estampes (1)
//   (counts overlap because a work carries several denomination tags; we de-dup by /fr/oeuvre/{slug}.)
//
// METADATA — parsed from the DETAIL page (Detail-Page Completeness):
//   title    = og:title  (clean)
//   artist   = field-auteurs (draughtsman/photographer; name kept before " : "/" - " bio tail).
//              Fallback to field-oeuvre-ref-auteurs (the referenced master, e.g. a medieval sculptor).
//   year     = creation-period heuristic. NOTE (architecture caveat): a record's `datation` block
//              can describe the DEPICTED MONUMENT's period (e.g. "Vers 1140" for a 12thC building)
//              rather than the drawing's creation date. We therefore prefer the AUTHOR's active
//              period (years in field-auteurs / ref-auteurs) — the right order of magnitude for a
//              19thC workshop drawing — and only fall back to the datation/title year. `date` keeps
//              the raw datation string so the source value is never lost.
//   medium   = field-techniques + field-matieres  (e.g. "Graphite — Papier")
//   dims     = Dimensions wrapper value  (e.g. "H : 16,6 cm; l : 11 cm")
//   category = first field-denominations tag → drawing | photograph
//
// IMAGE — the largest derivative is the lightbox style `desktop_oeuvre_collection_full`
//   (≥1280px for both drawings AND photos; the un-styled "original" is sometimes only ~315px for
//   photos, so we must use the _full style). Pulled from the detail page's data-target attribute.
//   Drawings & photographs are NEVER colour-gated (per COLLECTION_SCRAPING_GUIDE §1).
//
// Usage:
//   node scripts/scrape-cite-architecture.mjs --probe   # ~15 in-scope works end-to-end + R2, write *-probe.json
//   node scripts/scrape-cite-architecture.mjs --full     # all in-scope, resumable, write collection JSON
//   node scripts/scrape-cite-architecture.mjs --enumerate # just count unique in-scope oeuvre URLs (no images)

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

const SLUG = 'cite-architecture';
const COLLECTION_STEM = `${SLUG}-collection`;
const ORIGIN = 'https://www.citedelarchitecture.fr';
const UA_RESEARCH = 'armin-museum-research/1.0';
const UA_BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--enumerate') ? 'enumerate' : 'probe';
const PROBE_TARGET = 15;

// In-scope denomination facets (id → label). 3D denominations are deliberately NOT listed,
// so the crawl never touches casts/maquettes.
const INSCOPE_DENOMS = [
  ['4340', 'Dessin'],
  ['4338', 'Photographie'],
  ['4433', 'Croquis'],
  ['4641', 'Fichiers photographiques'],
  ['5432', "Dessin d'architecture (tirage numérique)"],
  ['4408', "Dessin d'architecture"],
  ['4567', 'Cartes et plans'],
  ['5481', 'Carnet de croquis'],
  ['4437', 'Plan'],
  ['4335', 'Port-folio et recueil de planches'],
  ['4356', 'Estampes'],
];

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function decodeEntities(s) {
  return (s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x27;/gi, "'")
    .replace(/&#8217;/g, '’').replace(/&#8216;/g, '‘')
    .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
    .replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
    .replace(/&hellip;/g, '…').replace(/&nbsp;/g, ' ').replace(/&deg;/g, '°')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}
const stripTags = (s) => decodeEntities((s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// ---------- HTTP with research-UA, browser-UA fallback ----------
async function getHtml(url, tries = 3) {
  let lastErr;
  for (let att = 0; att < tries; att++) {
    const ua = att === 0 ? UA_RESEARCH : UA_BROWSER;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': ua, 'Accept-Language': 'fr-FR,fr;q=0.9' }, redirect: 'follow' });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { lastErr = e; await sleep(600 * (att + 1)); }
  }
  throw lastErr;
}

// ---------- enumerate: collect unique in-scope /fr/oeuvre/ URLs across denomination facets ----------
function extractOeuvreLinks(html) {
  const set = new Set();
  const re = /href="(\/fr\/oeuvre\/[^"#?]+)"/gi;
  let m;
  while ((m = re.exec(html))) set.add(m[1]);
  return [...set];
}
function extractResultCount(html) {
  const m = html.match(/([0-9][0-9 . ]*)\s*r[ée]sultat/i);
  return m ? parseInt(m[1].replace(/[ . ]/g, ''), 10) : null;
}

async function enumerateInScope(limitPages = Infinity) {
  const urls = new Set();
  const perDenom = {};
  for (const [id, label] of INSCOPE_DENOMS) {
    const base = `${ORIGIN}/fr/collections/denomination/${id}`;
    const first = await getHtml(base);
    await sleep(500);
    if (!first) { console.log(`  [denom ${id} ${label}] page0 missing`); continue; }
    const total = extractResultCount(first);
    const pages = total != null ? Math.ceil(total / 20) : 1;
    let got = new Set(extractOeuvreLinks(first));
    const maxPage = Math.min(pages, limitPages);
    for (let p = 1; p < maxPage; p++) {
      const h = await getHtml(`${base}?page=${p}`);
      await sleep(400);
      if (!h) break;
      const links = extractOeuvreLinks(h);
      if (!links.length) break;
      links.forEach((u) => got.add(u));
      if ((p % 20) === 0) console.log(`    [denom ${id}] page ${p}/${pages} … (${got.size} so far)`);
    }
    perDenom[`${id}:${label}`] = { total, collected_urls: got.size };
    got.forEach((u) => urls.add(u));
    console.log(`  [denom ${id} ${label}] résultats=${total} | unique URLs=${got.size} | running-union=${urls.size}`);
  }
  return { urls: [...urls], perDenom };
}

// ---------- detail-page parser ----------
function fieldItems(html, name) {
  // grab the field--name-<name> block, then its field__item values (non-greedy)
  const block = html.match(new RegExp(`field--name-${name}\\b[\\s\\S]*?(?=field--name-|<footer|</article|$)`));
  if (!block) return [];
  const items = [...block[0].matchAll(/field__item[^>]*>([\s\S]*?)<\/(?:div|span|a|li|p|h\d)/g)].map((m) => stripTags(m[1])).filter(Boolean);
  if (items.length) return items;
  // some fields render a single value with no field__item wrapper
  const inner = block[0].replace(/^field--name-[a-z0-9-]+[^>]*>/, '');
  const t = stripTags(inner);
  return t ? [t] : [];
}

// value of a labelled wrapper: text after `label` up to the first stop-label
function wrapperValue(html, label, stops) {
  const re = new RegExp(`${label}([\\s\\S]*?)(?:${stops.join('|')})`);
  const m = html.match(re);
  return m ? stripTags(m[1]) : '';
}

function cleanArtist(raw) {
  if (!raw) return '';
  // forms: "Surname, Given : Place, date - Place, date"  |  "Surname, Given - 1977"  |  "Jean de Bruxelles ou ..."
  let a = raw.split(/\s:\s/)[0];               // drop biography after " : "
  a = a.replace(/\s[-–]\s*\d{3,4}.*$/, ''); // drop trailing " - 1977 ..." date tail
  a = a.replace(/\s*\[[^\]]*\]\s*$/, '');        // drop "[v.1510 ?-v.1565]" bracket dates
  return a.trim();
}

function pickYear({ datation, author, refAuthor, title }) {
  const yrsIn = (s) => (s ? [...String(s).matchAll(/\b(1[0-9]{3}|20[0-2][0-9])\b/g)].map((m) => +m[1]) : []);
  // Prefer the author's active period (closest to when the FLAT work was actually made);
  // architecture-museum datation often describes the depicted building, not the drawing.
  const a = yrsIn(author);
  if (a.length) return Math.min(...a);
  const r = yrsIn(refAuthor);
  if (r.length) return Math.min(...r);
  const d = yrsIn(datation);
  if (d.length) return Math.min(...d);
  const t = yrsIn(title);
  if (t.length) return Math.min(...t);
  return null;
}

function categoryFor(denom0) {
  const d = (denom0 || '').toLowerCase();
  if (/photograph|fichiers photo/.test(d)) return 'photograph';
  // dessin, croquis, plan, cartes, carnet, estampe, portfolio, dessin d'architecture (incl. tirage numérique)
  if (/dessin|croquis|plan|carte|carnet|estampe|port-?folio|planche/.test(d)) return 'drawing';
  return null;
}

// build the largest image URL from the detail page (lightbox style desktop_oeuvre_collection_full)
function imageUrlFromDetail(html) {
  // the main image lives in field--name-field-image; data-target holds the _full lightbox derivative
  const imgBlock = html.match(/field--name-field-image[\s\S]*?(?=field--name-|<\/article|$)/);
  const scope = imgBlock ? imgBlock[0] : html;
  // prefer an explicit _full styled URL
  let m = scope.match(/(?:data-target|href|src)="([^"]*styles\/desktop_oeuvre_collection_full\/public\/flora-images\/[^"]+)"/i);
  if (m) return ORIGIN + (m[1].startsWith('http') ? m[1].replace(ORIGIN, '') : m[1]);
  // fallback: any flora-images src in the image block → upgrade its style to _full
  m = scope.match(/(?:src|data-target)="([^"]*flora-images\/[^"]+)"/i);
  if (!m) return null;
  let u = m[1];
  // normalize to the _full style; strip any ?itok and re-fetch will 200 with a fresh token-free path if allowed
  u = u.replace(/styles\/[^/]+\/public\//, 'styles/desktop_oeuvre_collection_full/public/');
  if (!/styles\//.test(u)) u = u.replace('/sites/default/files/', '/sites/default/files/styles/desktop_oeuvre_collection_full/public/');
  return ORIGIN + (u.startsWith('http') ? u.replace(ORIGIN, '') : u);
}

async function parseDetail(oeuvrePath) {
  const url = ORIGIN + oeuvrePath;
  const html = await getHtml(url);
  if (!html) return null;

  const ogt = html.match(/og:title"\s+content="([^"]*)"/i);
  const title = ogt ? decodeEntities(ogt[1]).trim() : (fieldItems(html, 'title')[0] || '').replace(/<.*$/, '').trim();

  const authorRaw = fieldItems(html, 'field-auteurs')[0] || '';
  const refAuthorRaw = fieldItems(html, 'field-oeuvre-ref-auteurs')[0] || '';
  const artist = cleanArtist(authorRaw) || cleanArtist(refAuthorRaw);

  const denoms = fieldItems(html, 'field-denominations');
  const category = categoryFor(denoms[0]);

  const techniques = fieldItems(html, 'field-techniques');
  const matieres = fieldItems(html, 'field-matieres');
  const mediumParts = [...techniques, ...matieres].filter(Boolean);
  const medium = mediumParts.join(' — ');

  const datation = wrapperValue(html, 'Datation', ['Pr[ée]cisions', 'Dimensions', 'Statut', 'Situation', 'Auteur', 'Édifice', 'Edifice', 'Inscription']);
  const dimensions = wrapperValue(html, 'Dimensions', ['Inscription', 'Statut', 'Situation', 'Mise à jour', 'Rechercher', 'Pr[ée]cisions']);
  const inv = (fieldItems(html, 'field-num-inventaire')[0] || '').trim();

  const year = pickYear({ datation, author: authorRaw, refAuthor: refAuthorRaw, title });
  const imgUrl = imageUrlFromDetail(html);

  return {
    oeuvrePath, sourceUrl: url, title, artist,
    category, denomination: denoms[0] || '',
    medium, dimensions, datation, inv,
    date: datation || (year != null ? String(year) : ''),
    year, imgUrl,
  };
}

// ---------- image: download _full derivative, verify ≥600px, autocrop→webp, upload R2 ----------
async function dl(url) {
  let lastErr;
  for (let att = 0; att < 3; att++) {
    const ua = att === 0 ? UA_RESEARCH : UA_BROWSER;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': ua, Referer: ORIGIN + '/fr/collections' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 4000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) { lastErr = e; await sleep(500 * (att + 1)); }
  }
  throw lastErr;
}

async function uploadR2(key, buffer) {
  for (let att = 0; att < 4; att++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      return true;
    } catch (e) { if (att === 3) throw e; await sleep(400 * (att + 1)); }
  }
}

async function processImage(rec) {
  const src = await dl(rec.imgUrl);
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`small ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(src); // webp 2048/q85 (trim off by default — museum gives clean masters)
  const hash8 = sha(rec.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${rec.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (min-4 guard: title, artist, year, category) ----------
function makeId(rec) {
  const base = rec.inv ? rec.inv.replace(/[^A-Za-z0-9._-]+/g, '-') : rec.oeuvrePath.split('/').pop();
  return `${SLUG}-${base}`.replace(/-+/g, '-').replace(/^-|-$/g, '');
}
function toArtwork(rec, imageUrl) {
  if (!rec.title || !rec.artist || rec.year == null || !rec.category) return null;
  return {
    id: makeId(rec),
    objectNumber: rec.inv || '',
    title: rec.title,
    artist: rec.artist,
    date: rec.date || '',
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
    metadata: { inventory: rec.inv || '', denomination: rec.denomination || '', datation: rec.datation || '' },
    original_imageUrl: rec.imgUrl,
  };
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: "Cité de l'architecture et du patrimoine",
    collection: 'Collection (drawings & photographs)',
    website: 'https://www.citedelarchitecture.fr/fr/collections',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'html',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  // probe → pretty; full → compact (CAP <23MB)
  const json = stem.endsWith('-probe') ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
  fs.writeFileSync(out, json);
  console.log(`[write] ${out} (${artworks.length} works) breakdown=`, cats, `bytes=${json.length}`);
  return out;
}

const loadProgress = () => { try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { return { done: {}, urls: null }; } };
const saveProgress = (p) => fs.writeFileSync(PROGRESS, JSON.stringify(p));

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });

  if (MODE === 'enumerate') {
    const { urls, perDenom } = await enumerateInScope();
    console.log('\n[enumerate] per-denomination:', JSON.stringify(perDenom, null, 2));
    console.log(`[enumerate] TOTAL unique in-scope oeuvre URLs = ${urls.length}`);
    return;
  }

  if (MODE === 'probe') {
    // pull a handful from a couple of in-scope facets (drawings + photographs) and run end-to-end
    const sampleUrls = [];
    for (const [id] of [['4340'], ['4338'], ['4408']]) {
      const h = await getHtml(`${ORIGIN}/fr/collections/denomination/${id}`);
      await sleep(400);
      if (h) extractOeuvreLinks(h).forEach((u) => sampleUrls.push(u));
      if (sampleUrls.length >= PROBE_TARGET * 2) break;
    }
    const uniq = [...new Set(sampleUrls)].slice(0, PROBE_TARGET + 6);
    console.log(`[probe] parsing ${uniq.length} detail pages …`);
    const artworks = [];
    let parsed = 0, dropMin4 = 0, imgErr = 0;
    for (const u of uniq) {
      if (artworks.length >= PROBE_TARGET) break;
      try {
        const rec = await parseDetail(u);
        await sleep(300);
        parsed++;
        if (!rec || !rec.category) { continue; }
        rec.id = makeId(rec);
        if (!rec.imgUrl) { dropMin4++; continue; }
        const { imageUrl, srcW, srcH } = await processImage(rec);
        const w = toArtwork(rec, imageUrl);
        if (!w) { dropMin4++; console.log(`   drop(min4) ${u} [t=${!!rec.title} a=${!!rec.artist} y=${rec.year} c=${rec.category}]`); continue; }
        artworks.push(w);
        console.log(`   ok ${w.id} | ${w.category} | ${srcW}x${srcH} | ${w.artist.slice(0, 28)} | y=${w.year} | ${w.title.slice(0, 40)}`);
      } catch (e) {
        imgErr++;
        console.log(`   ERR ${u}: ${e.message}`);
      }
    }
    writeCollection(artworks, `${COLLECTION_STEM}-probe`);
    console.log(`\n[probe] DONE. collected=${artworks.length} parsed=${parsed} min4-drops=${dropMin4} errors=${imgErr}`);
    return;
  }

  // ---- full ----
  const prog = loadProgress();
  let urls = prog.urls;
  if (!urls) {
    console.log('[full] enumerating in-scope universe …');
    const e = await enumerateInScope();
    urls = e.urls;
    prog.urls = urls; saveProgress(prog);
    console.log(`[full] universe = ${urls.length} unique in-scope URLs`);
  } else {
    console.log(`[full] resuming with cached universe = ${urls.length} URLs (${Object.keys(prog.done).length} already done)`);
  }

  const collected = [];
  // re-load any already-collected from a side file to survive restarts
  const partFile = path.join(STATE_DIR, `${SLUG}-collected.ndjson`);
  if (fs.existsSync(partFile)) {
    for (const line of fs.readFileSync(partFile, 'utf8').split('\n')) {
      if (line.trim()) { try { collected.push(JSON.parse(line)); } catch {} }
    }
  }

  let done = Object.keys(prog.done).length, dropMin4 = 0, imgErr = 0;
  const CONC = 3;
  let idx = 0;
  const todo = urls.filter((u) => !prog.done[u]);
  console.log(`[full] ${todo.length} to fetch …`);
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < todo.length) {
      const u = todo[idx++];
      try {
        const rec = await parseDetail(u);
        await sleep(250);
        if (!rec || !rec.category) { prog.done[u] = 0; continue; }
        rec.id = makeId(rec);
        if (!rec.imgUrl) { prog.done[u] = 0; dropMin4++; continue; }
        const { imageUrl } = await processImage(rec);
        const w = toArtwork(rec, imageUrl);
        if (!w) { prog.done[u] = 0; dropMin4++; }
        else { collected.push(w); fs.appendFileSync(partFile, JSON.stringify(w) + '\n'); prog.done[u] = 1; }
      } catch (e) {
        imgErr++;
        fs.appendFileSync(FAILED, JSON.stringify({ url: u, err: String(e.message || e) }) + '\n');
        prog.done[u] = 0;
      }
      if (++done % 50 === 0) { saveProgress(prog); console.log(`  …${done}/${urls.length} (ok ${collected.length}, drop ${dropMin4}, err ${imgErr})`); }
    }
  }));
  saveProgress(prog);

  // de-dup by id (URLs across denominations map to same work)
  const byId = new Map();
  for (const w of collected) byId.set(w.id, w);
  const artworks = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  writeCollection(artworks, COLLECTION_STEM);
  console.log(`\n[full] DONE. unique works=${artworks.length} min4-drops=${dropMin4} errors=${imgErr}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
