#!/usr/bin/env node
// Museo Jumex (Fundación Jumex Arte Contemporáneo, Mexico City) — collection scraper.
// Source: museum's OWN server-rendered Rails catalogue on fundacionjumex.org.
//   Index : https://www.fundacionjumex.org/es/fundacion/coleccion?page={1..~99} (6 works/page, ~593 online)
//   Detail: https://www.fundacionjumex.org/en/fundacion/coleccion/{id}  (EN locale → English medium strings)
//   Image : detail <meta property="og:image"> → https://www.filepicker.io/api/file/{handle} (original, ~2000px)
// Metadata parsed from the DETAIL page blocks: details__author (artist + birth/death years),
//   details__title ×2 (title, date), details__materials, details__dimensions, details__credit/caption.
//
// SCOPE: flat visual works only (painting/drawing/print/photograph/video/mixed_media_2d), classified
//   from the medium string (EN primary, ES fallback). Sculpture/installation/neon/objects excluded.
//   Monochrome prints (category=print + Hasler-Süsstrunk colorfulness<20 on the downloaded buffer)
//   are skipped BEFORE R2 upload. Drawings always kept regardless of colour.
//
// POLITENESS: robots.txt asks Crawl-delay 10 — we throttle HTML page fetches to 1 per 1.5 s
//   (sequential, ~690 page requests total). Images come from the Filestack/CloudFront CDN
//   (not the Rails origin) and are fetched inline in the same sequential loop.
//
// RESUMABLE: scripts/.state/museo-jumex-progress.json stores discovered ids + per-work status
//   (ok records included), atomically rewritten after every work — safe to kill/re-run.
//   Failures append to scripts/.state/museo-jumex-failed.ndjson; error works retry on next run.
//
// Usage:
//   node scripts/scrape-museo-jumex.mjs --probe   # first ~20 in-scope works end-to-end (meta + R2 + partial JSON)
//   node scripts/scrape-museo-jumex.mjs --full    # everything in-scope (resumable)

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

const SLUG = 'museo-jumex';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://www.fundacionjumex.org';
const INDEX_URL = (p) => `${BASE}/es/fundacion/coleccion?page=${p}`;
const DETAIL_URL = (id) => `${BASE}/en/fundacion/coleccion/${id}`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);
const OUT_PATH = path.join(REPO, 'public/data', `${COLLECTION_STEM}.json`);

const PAGE_DELAY_MS = 1500;   // throttle for fundacionjumex.org HTML fetches
const MAX_INDEX_PAGES = 150;  // hard stop (site has ~99)
const CF_THRESHOLD = 20;      // colorfulness below this = monochrome print → skip

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

// ---------- throttled page fetch (fundacionjumex.org origin) ----------
let lastPageFetch = 0;
async function fetchHtml(url) {
  for (let att = 1; att <= 3; att++) {
    const wait = lastPageFetch + PAGE_DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastPageFetch = Date.now();
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

// ---------- scope classifier (EN medium strings primary, ES fallback) ----------
// Returns painting | drawing | print | photograph | video | mixed_media_2d, or null (out of scope).
function classify(mediumRaw) {
  const t = ` ${(mediumRaw || '').toLowerCase().normalize('NFC')} `;
  if (!t.trim()) return null;

  // 1) PHOTOGRAPH — process keywords win even when mounted on aluminum/dibond/plexiglas.
  if (/c-?print|chromogenic|cromogénic|cromógen|gelatin silver|silver gelatin|plata sobre gelatina|gelatina de plata|cibachrome|ilfochrome|fujiflex|fuji ?crystal|crystal archive|inkjet|inyección de tinta|pigment print|impresión de pigmento|lambda|lightjet|polaroid|photograph|photogram\b|fotografía|fotografia\b|fotograma|duratrans|diapositiva|transparency/.test(t)) return 'photograph';

  // 2) VIDEO / film / moving image
  if (/\bvideo|single.?channel|multi.?channel|16 ?mm|35 ?mm|super ?8|\bfilm\b|película|pelicula\b|dvd\b|vhs\b|animation|animación|monocanal/.test(t)) return 'video';

  // 3) strong PAINTING "pigment on support" — before the 3D exclude so oil-on-wood/plywood panels survive.
  if (/(oil|óleo|\boleo\b|acrylic|acrílico|acrilico|alkyd|tempera|témpera|watercolou?r|acuarela|gouache|aguada|enamel|esmalte|encaustic|encáustica|casein|caseína|lacquer|\blaca\b|vinyl|vinílica|vinilica|spray paint|aerosol|pintura)[^.;]{0,60}?\s(?:on|sobre|en)\s(?:[^.;]{0,30}?\s)?(canvas|tela|lienzo|linen|\blino\b|panel|madera|wood|board|masonite|paper|papel|cardboard|cartón|\bcarton\b|burlap|yute|fabric|silk|seda|velvet|hardboard|celotex|amate|tabla)/.test(t)) return 'painting';

  // 4) EXCLUDE — unambiguous 3D / sculpture / installation / object materials & forms.
  if (/sculpture|escultura|installation|instalación|\binstalacion\b|\bneon\b|neón|fluorescent|fluorescente|light ?bulbs?|\bfocos?\b|bronze|bronce|marble|mármol|\bmarmol\b|granite|granito|\bstone\b|piedra|concrete|concreto|\bcemento?\b|plaster|\byeso\b|ceramic|cerámica|ceramica\b|porcelain|porcelana|terracotta|terracota|\bresin\b|resina|fiberglass|fibra de vidrio|polyurethane|poliuretano|epoxy|epóxic|silicone|silicona|taxiderm|steel|acero|\biron\b|hierro|brass|latón|\blaton\b|copper|cobre|aluminum|aluminium|aluminio|\bwood\b|madera|plywood|triplay|\bmdf\b|\bglass\b|vidrio|cristal|mirror|espejo|motor\b|machine|máquina|\bmaquina\b|furniture|\bchair\b|\bsilla\b|stool|vitrine|vitrina|mannequin|maniquí|balloon|\brope\b|cuerda|\bchain\b|cadena|scaffold|andamio|carpet|alfombra|\brug\b|\blamps?\b|lámpara|\blampara\b|leather|cuero\b|\bfoam\b|espuma|rubber|\bhule\b|latex|látex|\bwax\b|\bcera\b|\bsand\b|\barena\b|\bsoil\b|tierra\b|\bplants?\b|plantas?\b|\bfood\b|chocolate|sugar\b|azúcar|\bclothes\b|\bropa\b|garments?\b|found objects?|objetos? encontrados?|ready-?made|sound system|altavoz|speakers?\b|turntable|jukebox|automobile|\bcar\b|carrousel|carousel/.test(t)) return null;

  // 5) PRINT (multiples on paper)
  if (/lithograph|litografía|\blitografia\b|silk-?screen|screen ?print|serigraph|serigrafía|\bserigrafia\b|etching|aguafuerte|grabado|engraving|woodcut|xilografía|\bxilografia\b|linocut|linóleo|\blinoleo\b|aquatint|aguatinta|drypoint|punta seca|mezzotint|monotype|monotipo|monoprint|offset|photogravure|fotograbado|heliograbado|giclée|giclee|risograph|digital print|impresión digital|impresion digital|\bprint\b|estampa/.test(t)) return 'print';

  // 6) DRAWING (unique works on paper)
  if (/graphite|grafito|pencil|lápiz|\blapiz\b|charcoal|carbón|carboncillo|crayon|crayola|\bpastel\b|pen and ink|\bink\b|tinta|marker\b|rotulador|plumón|\bplumon\b|felt-?tip|ballpoint|bolígrafo|\bboligrafo\b|drawing|dibujo|sanguine|sanguina|conté|silverpoint/.test(t)) return 'drawing';

  // 7) loose PAINTING (no explicit support)
  if (/\boil\b|óleo|\boleo\b|acrylic|acrílico|acrilico|tempera|témpera|watercolou?r|acuarela|gouache|aguada|encaustic|encáustica|\bfresco\b|painting|pintura/.test(t)) return 'painting';

  // 8) flat mixed media / collage / wall textile
  if (/collage|papier collé|décollage|decollage|mixed media|técnica mixta|tecnica mixta|embroidery|bordado|tapestry|tapiz\b|appliqué/.test(t)) return 'mixed_media_2d';

  return null; // unknown → out of scope (conservative)
}

// ---------- detail page → fields ----------
// TWO page layouts exist:
//   A (e.g. /274): author | title-div=title | title-div=date | materials=medium | dimensions=dims
//   B (e.g. /449): author ×N | title-div="<em>Title</em>, year" | title-div=medium |
//                  materials=dims | "materials markdown-styles"=description. No details__dimensions div.
function parseDetail(html, id) {
  let imgUrl = null;
  const og = html.match(/<meta property="og:image" content="([^"]+)"/);
  if (og && og[1].includes('/api/file/')) imgUrl = og[1].trim();
  if (!imgUrl) {
    const c = html.match(/cloudfront\.net\/api\/file\/([A-Za-z0-9]+)\/convert/);
    if (c) imgUrl = `https://www.filepicker.io/api/file/${c[1]}`;
  }

  // authors: 1..n divs, each "Name (1946 - 2012)"
  const names = [], lives = [];
  for (const m of html.matchAll(/<div class="details__author">([\s\S]*?)<\/div>/g)) {
    const a = stripTags(m[1]);
    const life = a.match(/\(([^()]*\d{4}[^()]*)\)\s*$/);
    if (life) lives.push(life[1].trim());
    const name = a.replace(/\s*\([^()]*\)\s*$/, '').trim();
    if (name) names.push(name);
  }
  const artist = names.join('; ');
  const artistLife = lives.join('; ');

  const grab = (cls) => {
    const m = html.match(new RegExp(`<div class="details__${cls}">([\\s\\S]*?)</div>`));
    return m ? stripTags(m[1]) : '';
  };
  const titleDivs = [...html.matchAll(/<div class="details__title">([\s\S]*?)<\/div>/g)].map((m) => m[1]);
  const markdown = (() => {
    const m = html.match(/<div class="details__materials markdown-styles">([\s\S]*?)<\/div>/);
    return m ? stripTags(m[1]) : '';
  })();

  let title = '', dateStr = '', medium = '', dimensions = '', description = '';
  if (html.includes('class="details__dimensions"')) {
    // layout A
    title = stripTags(titleDivs[0] || '');
    dateStr = stripTags(titleDivs[1] || '');
    medium = grab('materials');
    dimensions = grab('dimensions');
    description = grab('caption') || markdown;
  } else {
    // layout B
    const raw0 = titleDivs[0] || '';
    const em = raw0.match(/<em>([\s\S]*?)<\/em>([\s\S]*)$/);
    if (em) {
      title = stripTags(em[1]);
      dateStr = stripTags(em[2]).replace(/^[,;\s]+/, '');
    } else {
      const t0 = stripTags(raw0);
      const m = t0.match(/^(.*?),\s*((?:c\.?\s*)?\d{4}(?:\s*[–/-]\s*\d{2,4})?)\s*$/);
      if (m) { title = m[1].trim(); dateStr = m[2]; } else title = t0;
    }
    medium = stripTags(titleDivs[1] || '');
    dimensions = grab('materials');
    description = markdown || grab('caption');
  }

  const ym = dateStr.match(/\d{4}/);
  const year = ym ? parseInt(ym[0], 10) : null;
  return { id: String(id), artist, artistLife, title, dateStr, year, medium, dimensions, credit: grab('credit'), description, imgUrl };
}

// ---------- colorfulness (Hasler-Süsstrunk) on a raw image buffer, pre-upload ----------
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

// ---------- image download (Filestack CDN; original → /convert fallback) ----------
async function dlImage(url) {
  const tryUrls = [url, `${url}/convert?w=1600&fit=max&compress=true`];
  let lastErr;
  for (const u of tryUrls) {
    for (let att = 1; att <= 3; att++) {
      try {
        const r = await fetch(u, { headers: { 'User-Agent': UA } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
        return buf;
      } catch (e) { lastErr = e; await sleep(700 * att); }
    }
  }
  throw lastErr;
}

async function uploadR2(key, buffer) {
  for (let att = 1; att <= 4; att++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      return;
    } catch (e) { if (att === 4) throw e; await sleep(500 * att); }
  }
}

// ---------- progress state ----------
function loadProgress() {
  if (fs.existsSync(PROGRESS)) return JSON.parse(fs.readFileSync(PROGRESS, 'utf8'));
  return { indexComplete: false, nextPage: 1, ids: [], works: {} };
}
function saveProgress(p) {
  const tmp = PROGRESS + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(p));
  fs.renameSync(tmp, PROGRESS);
}
const appendFailed = (obj) => fs.appendFileSync(FAILED, JSON.stringify(obj) + '\n');
const countOk = (p) => Object.values(p.works).filter((w) => w.status === 'ok').length;

// ---------- index enumeration (one page per call; dedupes; detects end) ----------
async function fetchNextIndexPage(prog, idSet) {
  const page = prog.nextPage;
  if (page > MAX_INDEX_PAGES) { prog.indexComplete = true; return; }
  const html = await fetchHtml(INDEX_URL(page));
  const found = [...(html || '').matchAll(/href="\/es\/fundacion\/coleccion\/(\d+)[^"]*"/g)].map((m) => m[1]);
  const fresh = [...new Set(found)].filter((id) => !idSet.has(id));
  if (found.length === 0 || fresh.length === 0) {
    prog.indexComplete = true;
    console.log(`[index] page ${page}: no new works → index complete (${prog.ids.length} ids)`);
  } else {
    for (const id of fresh) { idSet.add(id); prog.ids.push(id); }
    prog.nextPage = page + 1;
    if (page % 10 === 0 || page === 1) console.log(`[index] page ${page}: +${fresh.length} (total ${prog.ids.length})`);
  }
  saveProgress(prog);
}

// ---------- one work end-to-end ----------
async function processWork(prog, id) {
  try {
    const html = await fetchHtml(DETAIL_URL(id));
    if (!html) { prog.works[id] = { status: 'skip', reason: 'detail-404' }; return; }
    const d = parseDetail(html, id);

    const missing = ['title', 'artist'].filter((k) => !d[k]);
    if (d.year == null) missing.push('year');
    if (missing.length) {
      prog.works[id] = { status: 'skip', reason: `min4-missing:${missing.join(',')}` };
      appendFailed({ id, stage: 'meta', err: `min4-missing:${missing.join(',')}`, url: DETAIL_URL(id) });
      return;
    }

    const category = classify(d.medium);
    if (!category) { prog.works[id] = { status: 'skip', reason: `out-of-scope: ${d.medium.slice(0, 90)}` }; return; }
    if (!d.imgUrl) { prog.works[id] = { status: 'skip', reason: 'no-image' }; return; }

    const buf = await dlImage(d.imgUrl);
    const meta = await sharp(buf).metadata();
    if (Math.max(meta.width || 0, meta.height || 0) < 500) throw new Error(`image too small ${meta.width}x${meta.height}`);

    if (category === 'print') {
      const cf = await colorfulness(buf);
      if (cf >= 0 && cf < CF_THRESHOLD) {
        prog.works[id] = { status: 'skip', reason: `grayscale-print cf=${cf.toFixed(1)}` };
        return; // skipped BEFORE upload
      }
    }

    const { buffer } = await autocropToWebp(buf); // webp 2048/q85 (trim off by default)
    const key = `artworks/${COLLECTION_STEM}/${id}-${sha(d.imgUrl).slice(0, 8)}-imageUrl.webp`;
    await uploadR2(key, buffer);

    prog.works[id] = {
      status: 'ok',
      artwork: {
        id: String(id),
        objectNumber: '',
        title: d.title,
        artist: d.artist,
        date: d.dateStr,
        year: d.year,
        medium: d.medium,
        dimensions: d.dimensions,
        category,
        description: d.description || '',
        imageUrl: `${R2_PUBLIC}/${key}`,
        thumbnailUrl: d.imgUrl,
        onDisplay: false,
        displayLocation: '',
        sourceUrl: DETAIL_URL(id),
        metadata: { artist_life: d.artistLife, credit: d.credit, src_px: `${meta.width}x${meta.height}` },
        original_imageUrl: d.imgUrl,
      },
    };
  } catch (e) {
    prog.works[id] = { status: 'error', error: String(e.message || e) };
    appendFailed({ id, stage: 'work', err: String(e.message || e), url: DETAIL_URL(id) });
  } finally {
    saveProgress(prog);
  }
}

// ---------- output ----------
function writeCollection(prog) {
  const artworks = prog.ids
    .map((id) => prog.works[id])
    .filter((w) => w && w.status === 'ok')
    .map((w) => w.artwork)
    .sort((a, b) => Number(a.id) - Number(b.id));
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Museo Jumex',
    collection: 'Colección Jumex',
    website: 'https://www.fundacionjumex.org/en/fundacion/coleccion',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'html+paginated-index',
    category_breakdown: cats,
    artworks,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`[write] ${OUT_PATH} (${artworks.length} works) breakdown=`, cats);

  // duplicate-image sanity (placeholder sign): same filepicker handle on ≥4 works
  const byImg = {};
  for (const w of artworks) byImg[w.original_imageUrl] = (byImg[w.original_imageUrl] || 0) + 1;
  const dupes = Object.entries(byImg).filter(([, n]) => n >= 4);
  if (dupes.length) console.log('[warn] repeated og:image (possible placeholder):', dupes);
}

function summarize(prog) {
  const tally = {};
  for (const w of Object.values(prog.works)) {
    const k = w.status === 'skip' ? `skip:${w.reason.split(':')[0].split(' ')[0]}` : w.status;
    tally[k] = (tally[k] || 0) + 1;
  }
  console.log('[summary]', tally);
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const prog = loadProgress();
  const idSet = new Set(prog.ids);
  const target = MODE === 'probe' ? PROBE_TARGET : Infinity;
  console.log(`[${MODE}] resume: ${prog.ids.length} ids known, ${countOk(prog)} ok, indexComplete=${prog.indexComplete}`);

  // full mode: enumerate the whole index up front (resumes from prog.nextPage)
  if (MODE === 'full') {
    while (!prog.indexComplete) await fetchNextIndexPage(prog, idSet);
    console.log(`[index] total ${prog.ids.length} works online`);
  }

  let cursor = 0, processed = 0;
  while (countOk(prog) < target) {
    // next unprocessed (or previously-errored) id
    let id = null;
    for (; cursor < prog.ids.length; cursor++) {
      const st = prog.works[prog.ids[cursor]];
      if (!st || st.status === 'error') { id = prog.ids[cursor]; cursor++; break; }
    }
    if (id == null) {
      if (prog.indexComplete) break; // nothing left anywhere
      await fetchNextIndexPage(prog, idSet); // probe mode: lazy index
      continue;
    }
    await processWork(prog, id);
    processed++;
    if (processed % 10 === 0) console.log(`  …${processed} processed this run (ok ${countOk(prog)}/${prog.ids.length} known)`);
  }

  writeCollection(prog);
  summarize(prog);
  console.log(`[${MODE}] DONE. in-scope ok=${countOk(prog)} of ${prog.ids.length} discovered works.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
