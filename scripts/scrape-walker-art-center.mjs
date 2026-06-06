#!/usr/bin/env node
// Walker Art Center (Minneapolis) — full collection scraper.
// Source: museum-OWN WordPress site, server-rendered HTML detail pages (no auth, no key).
//   Enumerate: 9 sitemaps  https://www.walkerart.org/wp-sitemap-posts-artwork-{1..9}.xml/
//     ⚠️ MUST keep www host + TRAILING SLASH — bare apex / no-slash → 404. 8×2000 + 22 = 16,022 URLs.
//   Detail page: https://www.walkerart.org/collections/artwork/{slug}/
//     Tombstone is a <dt>/<dd> definition list: Title, Artists, Date, Medium, Dimensions,
//     Accession Number, Credit Line. (No JSON-LD, no classification/object-type field.)
//   Full image: the hero <img src> on the page is imgix-proxy.walkerart.org/{wac_NNNN}.tif?fm=jpg&w=1800…
//     We refetch the SAME id at ?fm=jpg&w=2000 (deep-zoom master → real 2000px JPEG, not a thumbnail).
//
// SCOPE (⚠️ Walker has NO object-type field): flat-vs-3D is decided by parsing the Medium STRING.
//   Walker's flat vocabulary is small & regular ("TECHNIQUE on SUPPORT"): lithograph/screenprint/
//   etching/aquatint/etc. on paper, oil/acrylic on canvas, gelatin silver print, video, drawing media
//   on paper. The 3D vocabulary is open-ended (stainless steel, travertine, underwear, soap, …), so we
//   POSITIVELY classify flat works and DROP everything else (conservative). Frame/mount descriptors
//   ("…, painted aluminum frame") are stripped first so a flat board work isn't mis-excluded as metal.
//   Paintings: ALL (no cap). Other 2D (print/photo/drawing/video/mixed_2d): all in-scope, minus the
//   value-filter (study/sketch/copy/reproduction). Sculpture/3D/design objects: excluded.
//   NOTE: moving-image works often have NO still on the detail page (hero=None) → they drop on no-image.
//
// Usage:
//   node scripts/scrape-walker-art-center.mjs --classify [--sample=400]  # dry-run: medium distribution + true in-scope count (no images)
//   node scripts/scrape-walker-art-center.mjs --pilot   [--no-upload]    # build ~20 in-scope (+R2 unless --no-upload), write pilot JSON
//   node scripts/scrape-walker-art-center.mjs --full                     # full scrape + R2 upload, write collection JSON

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { autocropToWebp } from './lib/autocrop.mjs';

const require = createRequire(import.meta.url);
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
require('dotenv').config({ path: path.join(REPO, '.env.local') });

const SLUG = 'walker-art-center';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://www.walkerart.org';
const DETAIL = (s) => `${BASE}/collections/artwork/${s}/`;
const SITEMAP = (n) => `${BASE}/wp-sitemap-posts-artwork-${n}.xml/`; // ⚠️ trailing slash required
const SITEMAP_PAGES = 9;
const IMGIX = (wacId, w = 2000) => `https://imgix-proxy.walkerart.org/${wacId}.tif?fm=jpg&w=${w}`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--pilot') ? 'pilot' : 'classify';
const NO_UPLOAD = args.includes('--no-upload');
const SAMPLE_N = (() => { const a = args.find((x) => x.startsWith('--sample=')); return a ? parseInt(a.split('=')[1], 10) : 400; })();
const PILOT_TARGET = 20;
const CONC = 5;

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

// ---------- fetch ----------
async function fetchText(url, attempt = 1) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (r.status === 429 && attempt <= 4) { await sleep(1000 * 2 ** (attempt - 1)); return fetchText(url, attempt + 1); }
    if (r.status === 404) return { notFound: true };
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return { text: await r.text() };
  } catch (e) { if (attempt <= 3) { await sleep(500 * attempt); return fetchText(url, attempt + 1); } throw e; }
}

// ---------- enumerate slugs from the 9 sitemaps ----------
async function enumerateSlugs() {
  const slugs = [];
  for (let n = 1; n <= SITEMAP_PAGES; n++) {
    const { text, notFound } = await fetchText(SITEMAP(n));
    if (notFound || !text) { console.log(`  [sitemap ${n}] missing`); continue; }
    const locs = [...text.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1]);
    for (const u of locs) {
      const m = u.match(/\/collections\/artwork\/([^/]+)\/?$/);
      if (m) slugs.push(m[1]);
    }
    console.log(`  [sitemap ${n}] ${locs.length} urls`);
    await sleep(300);
  }
  // de-dup (sitemaps can repeat a slug)
  return [...new Set(slugs)];
}

// ---------- detail-page parser: dt/dd tombstone + hero imgix id ----------
function parseDetail(html) {
  // pair each <dt>label</dt> with the FOLLOWING <dd>value</dd> (non-greedy dd to avoid swallowing next pair)
  const pairs = {};
  for (const m of html.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)) {
    const k = decodeEntities(m[1].replace(/<[^>]+>/g, ' ')).replace(/:\s*$/, '').replace(/\s+/g, ' ').trim();
    const v = decodeEntities(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (k && !(k in pairs)) pairs[k] = v;
  }

  const title = pairs['Title'] || '';
  const artist = (pairs['Artists'] || '').trim(); // may be multiple names already space/comma joined by the <a> tags
  const dateStr = pairs['Date'] || '';
  const medium = pairs['Medium'] || '';
  const dimensions = pairs['Dimensions'] || '';
  const accession = pairs['Accession Number'] || '';
  const creditLine = pairs['Credit Line'] || '';

  // year: first 4-digit run in the Date string ("1961-1963" → 1961; "not dated"/"unknown" → null)
  const ym = dateStr.match(/\d{4}/);
  const year = ym ? parseInt(ym[0], 10) : null;

  // hero image = the imgix <img src>/data-src with the LARGEST w (the on-page hero is w=1800;
  // related-work thumbnails use tiny w). Refetch that id at w=2000 for the master.
  let heroId = null, bestW = -1, heroOnPageUrl = null;
  for (const m of html.matchAll(/(?:src|data-src)="(https:\/\/imgix-proxy\.walkerart\.org\/(wac_\d+)\.tif\?[^"]*)"/g)) {
    const wm = m[1].match(/[?&]w=(\d+)/);
    const w = wm ? parseInt(wm[1], 10) : 0;
    if (w > bestW) { bestW = w; heroId = m[2]; heroOnPageUrl = m[1]; }
  }

  return { title, artist, dateStr, year, medium, dimensions, accession, creditLine, heroId, heroOnPageUrl };
}

// ---------- scope classifier (parse Medium string) ----------
// Returns painting | photograph | print | drawing | video | mixed_media_2d (in-scope) or null (out).
// Walker grammar = "TECHNIQUE on SUPPORT". We POSITIVELY classify flat works; unmatched → null.
function classify(mediumRaw) {
  let t = (mediumRaw || '').toLowerCase().trim();
  if (!t) return null;

  // 0) strip FRAME / MOUNT descriptors so "…on board, painted aluminum frame" reads as a board work,
  //    not a metal object. (Frame metal is the frame, not the artwork.)
  t = t.replace(/,?\s*(painted\s+|powder[- ]coated\s+|anodized\s+)?(aluminum|steel|stainless steel|brass|bronze|wood|wooden|metal|plexiglas[s]?|acrylic|artist'?s)\s+frame\b/g, ' ');
  t = t.replace(/,?\s*in\s+(the\s+)?artist'?s\s+frame\b/g, ' ');
  t = t.replace(/,?\s*framed\b/g, ' ');

  // A flat-SUPPORT signal ("… on SHEET"): paper variants, canvas/linen/panel/board, AND rigid sheets
  // a flat work can be painted/printed on (aluminum/steel/copper/zinc/plexiglas/dibond). When present, the
  // work is flat → the 3D-material EXCLUDE below must NOT fire (the metal is the support, not a sculpture).
  const hasFlatSupport = /\bon\s+[\w'’\- ]*?paper\b|\bon\s+(rives|arches|japan(ese)?|handmade|wove|card\s*stock|board|vellum|mylar|acetate|canvas|linen|panel|masonite|cardboard|newspaper|newsprint|aluminum|aluminium|steel|copper|zinc|brass|metal|plexiglas[s]?|acrylic|dibond|plywood|wood\s*panel|fabric|silk|cotton)\b/.test(t);

  // 1) hard EXCLUDE — unambiguous 3D / sculpture / object FORMS & primary materials, but ONLY when the
  //    work is NOT clearly a flat work on a support (guard against print plates / framed flats above).
  const SCULPT = /\b(sculptur|installation|maquette|cast\b|bronze|terracotta|terra[- ]cotta|ceramic|porcelain|stoneware|earthenware|marble|granite|travertine|limestone|alabaster|plaster\b|resin|fiberglass|polyurethane|silicone|epoxy|neon\b|fluorescent|light\s*bulb|taxidermy|furniture|chair\b|table\b|vitrine|etched copper|copper plate|lithograph(ic)?\s*stone|woodblock\b|printing\s*block|relief\s*block)\b/;
  const HARD_OBJECT_MATERIAL = /\b(stainless steel|aluminum|steel|iron|brass|copper|lead\b|concrete|cement|rubber|latex|foam|vinyl|wax\b)\b/;
  const FLAT_TECHNIQUE = /\b(print|photograph|gelatin|lithograph|screenprint|silkscreen|serigraph|etching|aquatint|engraving|intaglio|woodcut|linocut|emboss|collagraph|pochoir|drawing|graphite|charcoal|pastel|paint(ing|ed)?\b|collage)\b/;

  if (!hasFlatSupport) {
    if (SCULPT.test(t)) return null;
    // pure object materials with no flat support and no flat technique → 3D object
    if (HARD_OBJECT_MATERIAL.test(t) && !FLAT_TECHNIQUE.test(t)) return null;
  }

  // --- photographic-film guard: "Polaroid film", "sheet film", "dye diffusion … (… film)" are
  //     PHOTOGRAPHS, not moving image. Detect a photo-print context so the video "film" match below
  //     does not steal them. (Gauge films — 8mm/16mm/35mm/super-8 — and "video" are always moving image.)
  const isPhotoFilm = /\b(polaroid|sheet\s*film|roll\s*film|instant\s*film|dye[- ]?diffusion|dye[- ]?transfer|gelatin silver|chromogenic|cibachrome|ilfochrome|type\s*\d+\s*film)\b/.test(t);

  // 2) VIDEO / moving image — explicit moving-image words, or "film" only when NOT a photographic film.
  if (/\b(video|videotape|super[- ]?8|16\s*mm|8\s*mm|35\s*mm|dvd|laserdisc|u-?matic|projection|moving\s*image|slide\s*projection|multimedia\s*installation)\b/.test(t)
      || (/\bfilm\b/.test(t) && !isPhotoFilm && !/\bfilm\s*positive\b/.test(t))) return 'video';

  // 3) PHOTOGRAPH (incl. silver dye-bleach = Cibachrome/Ilfochrome)
  if (/\b(gelatin silver|c[- ]?print|chromogenic|cibachrome|ilfochrome|silver\s+dye[- ]?bleach|dye[- ]?bleach|dye[- ]?transfer|dye diffusion|polaroid|inkjet|pigment(ed)?\s*print|archival\s*pigment|giclée|giclee|platinum print|albumen|photogram|black[- ]and[- ]white photograph|color photograph|photograph(s)?\b|photo(?:lithograph)?)\b/.test(t)
      && !/lithograph|screenprint|etching|aquatint|woodcut/.test(t.replace('photolithograph', '').replace('photogravure', ''))) return 'photograph';

  // 4) PAINTING (collect ALL) — paint media on a 2D support
  if (/\b(oil|acrylic|tempera|gouache|encaustic|enamel|casein|alkyd|watercolor)\b/.test(t)
      && (hasFlatSupport || /\bon\b/.test(t))) {
    // a print/photo that merely mentions watercolor-tint stays a print → guard
    if (!/\b(lithograph|screenprint|silkscreen|etching|aquatint|engraving|intaglio|woodcut|relief print|letterpress|offset|photogravure|mezzotint|emboss|collagraph)\b/.test(t)) return 'painting';
  }

  // 5) PRINT (multiples / printmaking on paper or sheet)
  if (/\b(lithograph|offset|screenprint|silkscreen|serigraph|etching|aquatint|drypoint|engraving|intaglio|woodcut|linocut|wood\s*engraving|woodblock|relief\s*(print)?|letterpress|photogravure|mezzotint|chine[- ]?coll[ée]|carborundum|collagraph|emboss(ing|ed)?|pochoir|monoprint|monotype|photocopy|photocopies|xerox|risograph|fax print|print\s+on)\b/.test(t)) return 'print';

  // 6) DRAWING (unique works on paper / sheet)
  if (/\b(graphite|pencil|colored pencil|charcoal|ink\b|pen and ink|crayon|pastel|conté|chalk|gouache|watercolor|wash\b|collage|gelatin|silverpoint|marker)\b/.test(t)
      && (hasFlatSupport || /\bon\b/.test(t))) return 'drawing';

  // 7) generic flat mixed media on a support → mixed_media_2d
  if (/\bmixed media|digital art|digital print|digital images?\b/.test(t)) return 'mixed_media_2d';
  if (hasFlatSupport && /\bink|paint|wash|collage|gouache|tempera|dye\b/.test(t)) return 'mixed_media_2d';

  return null; // unmatched → out of scope (conservative)
}

// ---------- value filter: skip secondary/study genres (per guide) ----------
// study/sketch/copy/reproduction are excluded for non-painting works only (a painted "study" canvas
// is still a painting and kept; a "study for the sculpture …" drawing is secondary → drop).
function isValueFilteredOut(category, title) {
  if (category === 'painting') return false;
  const t = (title || '').toLowerCase();
  if (/\b(study|studies)\s+(for|of|after)\b/.test(t)) return true;
  if (/^\s*(sketch|sketches)\s+(for|of|after)\b/.test(t)) return true;
  if (/\b(copy|reproduction)\s+(of|after)\b/.test(t)) return true;
  return false;
}

// ---------- detail → ARMIN candidate ----------
function toCandidate(slug, d) {
  const category = classify(d.medium);
  return {
    id: d.heroId || `wac-${slug}`,          // native Walker image id (wac_NNNN) — NOT slug-prefixed
    slug,
    title: d.title,
    artist: d.artist,
    year: d.year,
    dateStr: d.dateStr,
    medium: d.medium,
    dimensions: d.dimensions,
    accession: d.accession,
    creditLine: d.creditLine,
    category,
    heroId: d.heroId,
    imgUrl: d.heroId ? IMGIX(d.heroId, 2000) : null,
    thumbUrl: d.heroId ? IMGIX(d.heroId, 400) : null,
    sourceUrl: DETAIL(slug),
  };
}

// ---------- image: download full-size, (no-trim) webp, upload to R2 ----------
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
async function r2Exists(key) { try { await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key })); return true; } catch { return false; } }

async function processImage(a, { upload = true } = {}) {
  const hash8 = sha(a.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
  if (upload && await r2Exists(key)) return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: null, srcH: null, skipped: true };
  const src = await dl(a.imgUrl);                                  // full-size jpeg (imgix master, w=2000)
  const sharp = (await import('sharp')).default;
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(src);                   // webp(2048/q85), NO trim (opt-in only)
  if (upload) await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (min-4 guard; NEVER Anonymous-fill) ----------
function toArtwork(a, imageUrl) {
  if (!a.title || !a.artist || a.year == null || !a.category) return null; // min-4 → drop (no placeholders)
  return {
    id: a.id,
    objectNumber: a.accession || '',
    title: a.title,
    artist: a.artist,
    date: a.dateStr || (a.year != null ? String(a.year) : ''),
    year: a.year,
    medium: a.medium,
    dimensions: a.dimensions,
    category: a.category,
    description: '',
    imageUrl,
    thumbnailUrl: a.thumbUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: { wac_image_id: a.heroId, wac_slug: a.slug, accession: a.accession, credit_line: a.creditLine },
    original_imageUrl: a.imgUrl,
  };
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Walker Art Center',
    collection: 'Collection',
    website: 'https://www.walkerart.org/collections/',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'sitemap+html',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`[write] ${out} (${artworks.length} works) breakdown=`, cats);
  return out;
}

// fetch+parse a single slug → candidate (concurrency worker helper)
async function fetchCandidate(slug) {
  const { text, notFound } = await fetchText(DETAIL(slug));
  if (notFound || !text) return null;
  return toCandidate(slug, parseDetail(text));
}

// ---------- CLASSIFY mode: sample medium distribution, report true in-scope ----------
async function runClassify(slugs) {
  // sample evenly across the corpus so the distribution is representative of all 16k
  const N = Math.min(SAMPLE_N, slugs.length);
  const step = Math.max(1, Math.floor(slugs.length / N));
  const sample = [];
  for (let i = 0; i < slugs.length && sample.length < N; i += step) sample.push(slugs[i]);
  console.log(`\n[classify] sampling ${sample.length} of ${slugs.length} detail pages (step ${step}) …`);

  const tally = {}; let inScope = 0, outScope = 0, noImg = 0, dropMin4 = 0, valueFiltered = 0, fetchFail = 0;
  const excludedMediums = []; const inScopeNoImgMediums = [];
  let idx = 0, done = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < sample.length) {
      const slug = sample[idx++];
      let c; try { c = await fetchCandidate(slug); } catch { fetchFail++; continue; }
      if (!c) { fetchFail++; continue; }
      await sleep(120);
      if (!c.category) { outScope++; if (excludedMediums.length < 40) excludedMediums.push(c.medium); }
      else if (isValueFilteredOut(c.category, c.title)) { valueFiltered++; }
      else {
        inScope++; tally[c.category] = (tally[c.category] || 0) + 1;
        if (!c.imgUrl) { noImg++; if (inScopeNoImgMediums.length < 20) inScopeNoImgMediums.push(c.medium); }
        if (!c.title || !c.artist || c.year == null) dropMin4++;
      }
      if (++done % 50 === 0) console.log(`  …${done}/${sample.length}`);
    }
  }));

  const frac = (v) => `${v} (${((v / sample.length) * 100).toFixed(1)}%)`;
  console.log('\n[classify] sample size:', sample.length, '| fetch fails:', fetchFail);
  console.log('[classify] IN-SCOPE:', frac(inScope), '| out-of-scope (3D/unmatched):', frac(outScope), '| value-filtered (study/sketch/copy):', frac(valueFiltered));
  console.log('[classify] in-scope WITHOUT a still image (mostly moving-image):', frac(noImg));
  console.log('[classify] in-scope that would DROP on min-4 (missing title/artist/year):', frac(dropMin4));
  console.log('[classify] category breakdown (in-scope):', tally);
  // project to full corpus
  const projIn = Math.round((inScope / sample.length) * slugs.length);
  const projWithImg = Math.round(((inScope - noImg) / sample.length) * slugs.length);
  const projDrop = Math.round((dropMin4 / sample.length) * slugs.length);
  console.log(`\n[classify] PROJECTED to full ${slugs.length}: in-scope ≈ ${projIn}, with-image-and-min4 ≈ ${Math.max(0, projWithImg - projDrop)} (final collectible estimate)`);
  const projCats = {}; for (const k of Object.keys(tally)) projCats[k] = Math.round((tally[k] / sample.length) * slugs.length);
  console.log('[classify] PROJECTED category breakdown:', projCats);
  console.log('\n[classify] sample EXCLUDED mediums:');
  for (const m of excludedMediums) console.log('   -', JSON.stringify(m).slice(0, 90));
  if (inScopeNoImgMediums.length) { console.log('\n[classify] in-scope-but-no-still mediums (will drop on no-image):'); for (const m of inScopeNoImgMediums) console.log('   -', JSON.stringify(m).slice(0, 90)); }
}

// ---------- PILOT / FULL: build candidates, fetch images, write JSON ----------
async function runBuild(slugs) {
  // For pilot we don't need all 16k detail fetches — walk slugs until we have enough in-scope+imaged.
  const upload = !(MODE === 'pilot' && NO_UPLOAD);
  const want = MODE === 'pilot' ? PILOT_TARGET : Infinity;
  console.log(`\n[${MODE}] building (upload=${upload}) target=${want === Infinity ? 'ALL' : want} …`);

  const artworks = []; let scanned = 0, inScope = 0, imgErr = 0, dropMin4 = 0, valueFiltered = 0, noImg = 0;
  let idx = 0;
  const enough = () => artworks.length >= want;

  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < slugs.length && !enough()) {
      const slug = slugs[idx++];
      let c; try { c = await fetchCandidate(slug); } catch { continue; }
      scanned++;
      if (!c) continue;
      if (!c.category) continue;
      if (isValueFilteredOut(c.category, c.title)) { valueFiltered++; continue; }
      inScope++;
      if (!c.imgUrl) { noImg++; continue; }
      if (!c.title || !c.artist || c.year == null) { dropMin4++; continue; }
      if (enough()) break;
      try {
        const { imageUrl } = await processImage(c, { upload });
        const w = toArtwork(c, imageUrl);
        if (w) artworks.push(w); else dropMin4++;
      } catch (e) {
        imgErr++;
        fs.appendFileSync(path.join(STATE_DIR, `${SLUG}-failed.ndjson`), JSON.stringify({ slug, id: c.id, url: c.imgUrl, err: String(e.message || e) }) + '\n');
        if (imgErr <= 8) console.log(`  img err ${slug} (${c.id}): ${e.message}`);
      }
      if (artworks.length && artworks.length % 100 === 0) console.log(`  …collected ${artworks.length} (scanned ${scanned}, inScope ${inScope}, imgErr ${imgErr})`);
      await sleep(100);
    }
  }));

  artworks.sort((a, b) => (a.metadata.wac_slug < b.metadata.wac_slug ? -1 : 1));
  const stem = MODE === 'pilot' ? `${COLLECTION_STEM}-pilot` : COLLECTION_STEM;
  const out = writeCollection(artworks, stem);
  console.log(`\n[${MODE}] DONE. collected ${artworks.length} | scanned ${scanned} | in-scope seen ${inScope} | value-filtered ${valueFiltered} | no-image ${noImg} | min4-drops ${dropMin4} | img errors ${imgErr}`);
  console.log(`[${MODE}] output: ${out}`);
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  console.log('[enumerate] reading 9 artwork sitemaps …');
  const slugs = await enumerateSlugs();
  console.log(`[enumerate] ${slugs.length} unique artwork slugs`);

  if (MODE === 'classify') return runClassify(slugs);
  return runBuild(slugs);
}

main().catch((e) => { console.error(e); process.exit(1); });
