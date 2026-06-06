#!/usr/bin/env node
// Museum Ludwig (Cologne) collection scraper.
// Source: museum-ludwig.kulturelles-erbe-koeln.de — City of Cologne's official
// municipal digital-heritage portal (KEK), self-site for Museum Ludwig records.
//
// ⚠️ The portal is gated by a JavaScript Proof-of-Work challenge: every URL first
//    returns a ~5.7KB challenge shell. We solve it headlessly (difficulty=1 SHA-256
//    grind) and POST the solution to obtain a `pow_token` cookie (1h TTL), then reload.
//    See scripts/SOURCE_RESEARCH_museum-ludwig.md.
//
// Strategy:
//   1. PoW handshake → cookie.
//   2. For each in-scope sub-collection (Malerei / Grafik / Fotografie): reset search
//      (action=neueSuche), apply filter (filter_subsammlungen_ml), page through
//      action=displayResult/{offset} (60 obj/page) collecting ALL obj IDs (no cap).
//   3. For each obj: fetch /documents/obj/{id}, parse the `Bausteine *` metadata divs
//      (non-greedy), extract the `altsrc` high-res standard/ image, read `Standort`
//      (on-display flag), checkpoint the triage decision to .state so re-runs resume.
//   4. Apply the COLLECTION_SCRAPING_GUIDE Phase-C cap policy (see below).
//   5. Download image → webp (2048 inside, q85) → R2 (resumable HeadObject), with an
//      image-quality gate (long-edge ≥ 400px) measured from sharp metadata.
//
// CAP POLICY (Phase C "수집 범위 정책"):
//   • PAINTING (Malerei): collect ALL — no cap.
//   • DRAWING / PRINT / PHOTOGRAPH (Grafik 6.8k + Fotografie 16.8k): VALUE FILTER.
//     KEK exposes NO server-side highlight/masterpiece facet, but every detail page
//     carries a real on-display flag in the `Standort` Baustein
//     ("zurzeit ausgestellt" vs "zurzeit nicht ausgestellt"). Per the guide's
//     huge-category rule, we keep the ON-DISPLAY subset of Grafik+Fotografie, plus
//     the image-quality gate and the explicit-label exclusions below. ("highlight"
//     appears on EVERY page → it's template chrome, not a per-object flag — unused.)
//   EXCLUDE (image-quality + explicit source labels only — no guessing):
//     long-edge <400px · placeholder/broken · Studie/Skizze/Entwurf (study/sketch) ·
//     Kopie/Reproduktion/Nachbildung (copy/repro) · Probedruck/Andruck/Probeabzug (proof).
//
// Usage:  node scripts/scrape-museum-ludwig.mjs [--limit=N] [--concurrency=N]
//         --reset-triage   re-fetch all detail pages (ignore .state triage checkpoint)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(fileURLToPath(import.meta.url), '../../.env.local') });

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const LIMIT       = args.limit ? Number(args.limit) : null;       // pilot: total kept records
const CONCURRENCY = Number(args.concurrency || 4);
const RESET_TRIAGE = !!args['reset-triage'];                      // ignore triage checkpoint
const STEM        = LIMIT ? 'museum-ludwig-pilot-collection' : 'museum-ludwig-collection';
const OUT_JSON    = `public/data/${STEM}.json`;
const REPO_ROOT   = path.resolve(fileURLToPath(import.meta.url), '../..');
const STATE_DIR   = path.join(REPO_ROOT, 'scripts/.state');
const TRIAGE_PATH = path.join(STATE_DIR, `${STEM}-triage.ndjson`); // resumable detail-page triage
const UA          = 'Mozilla/5.0 (compatible; armin-museum-research/1.0)';
const BASE        = 'https://museum-ludwig.kulturelles-erbe-koeln.de';
const PER_PAGE    = 60;
const MIN_EDGE    = 400;                                          // image-quality gate: long edge ≥ 400px
const THROTTLE_MS = Number(args.throttle || 40);                 // per-worker delay between detail fetches (rate-limit politeness)

const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

// In-scope sub-collections, in priority order. (Skulptur 002 is excluded.)
const SUBCOLLECTIONS = [
  { term: '001\\Malerei',    category: 'painting',   label: 'Malerei' },
  { term: '006\\Grafik',     category: 'print',      label: 'Grafik' },
  { term: '005\\Fotografie', category: 'photograph', label: 'Fotografie' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha256hex = b => crypto.createHash('sha256').update(b).digest('hex');
const hash8 = s => sha256hex(s).slice(0, 8);
// The KEK image URL is CloudFront-signed: the ?Expires/Signature querystring changes on
// every fetch. Hash only the STABLE path so the R2 key is deterministic across runs —
// otherwise HeadObject-skip can never match a previously-uploaded image (re-downloads all).
const stableImgHash = url => hash8(String(url).split('?')[0]);

const ENT = {
  uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß', Uuml: 'Ü', Ouml: 'Ö', Auml: 'Ä',
  amp: '&', quot: '"', lt: '<', gt: '>', nbsp: ' ', apos: "'",
  eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', uacute: 'ú', iacute: 'í', oacute: 'ó', aacute: 'á',
  ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', hellip: '…',
};
function dec(s) {
  return (s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, e) => (ENT[e] !== undefined ? ENT[e] : m));
}

// ---------- Proof-of-Work aware fetch ----------
let COOKIE = '';
function mergeCookie(jar, setStr) {
  const kv = setStr.split(';')[0];
  const k = kv.split('=')[0];
  const parts = (jar ? jar.split('; ') : []).filter(p => p.split('=')[0] !== k);
  parts.push(kv);
  return parts.join('; ');
}
function absorb(res) { for (const c of (res.headers.getSetCookie?.() || [])) COOKIE = mergeCookie(COOKIE, c); }

// Serialize PoW solving: when the token expires, only ONE worker solves it; the
// others await the same promise instead of each racing a fresh challenge (which
// corrupts the shared cookie and yields the challenge shell as "content").
let powInFlight = null;

// Fetch a URL, decode as windows-1252 (ISO-8859-1). Transparently solve the PoW
// challenge if the response is the challenge shell, then retry.
async function fetchPage(url, attempt = 1) {
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA, ...(COOKIE ? { Cookie: COOKIE } : {}) }, redirect: 'follow' });
  } catch (e) {
    if (attempt <= 4) { await sleep(800 * 2 ** (attempt - 1)); return fetchPage(url, attempt + 1); }
    throw e;
  }
  absorb(res);
  if (res.status === 429 && attempt <= 4) { await sleep(1000 * 2 ** (attempt - 1)); return fetchPage(url, attempt + 1); }
  const ab = await res.arrayBuffer();
  // The challenge shell is small (~5.7KB) and is the PoW page (`const challenge` /
  // "Service Status - Proof-of-Work"). Re-solve and retry — never return the shell as content.
  if (ab.byteLength < 9000) {
    const probe = new TextDecoder('latin1').decode(ab);
    if (/const challenge\s*=/.test(probe) || /Service Status - Proof-of-Work/.test(probe)) {
      if (attempt > 8) throw new Error('PoW solve loop exceeded');
      // Solve under a shared lock so concurrent workers don't each POST a
      // different challenge and clobber the cookie.
      if (powInFlight) { await powInFlight; }
      else { powInFlight = solvePow(url, probe).finally(() => { powInFlight = null; }); await powInFlight; }
      await sleep(150);
      return fetchPage(url, attempt + 1);
    }
  }
  if (!res.ok) {
    if (attempt <= 3) { await sleep(800 * 2 ** (attempt - 1)); return fetchPage(url, attempt + 1); }
    throw new Error(`HTTP ${res.status}`);
  }
  return new TextDecoder('windows-1252').decode(ab);
}

async function solvePow(url, shellHtml) {
  const m = shellHtml.match(/const challenge\s*=\s*(\{.*?\});/s);
  if (!m) throw new Error('no challenge token in shell');
  const ch = JSON.parse(m[1]);
  const target = '0'.repeat(ch.difficulty || 1);
  let sol = 0, h = '';
  do { h = sha256hex(ch.nonce + ch.ts + sol); sol++; } while (!h.startsWith(target));
  sol -= 1;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', ...(COOKIE ? { Cookie: COOKIE } : {}) },
    body: new URLSearchParams({ solution: String(sol), challenge: ch.challenge, sig: ch.sig }),
  });
  absorb(res);
  await res.json().catch(() => ({}));
}

// ---------- metadata parse ----------
function baustein(html, cls) {
  const re = new RegExp(`<div class="Bausteine ${cls}">([\\s\\S]*?)</div>`, 'i');
  const m = html.match(re);
  if (!m) return null;
  let v = m[1]
    .replace(/<p class="kursiv"[^>]*>[\s\S]*?<\/p>/gi, '')   // drop English-translation line
    .replace(/<[^>]+>/g, ' ');
  v = dec(v).replace(/\s+/g, ' ').trim().replace(/[,;]\s*$/, '').trim();
  return v || null;
}

function parseDetail(html) {
  const out = {
    artist: baustein(html, 'Autor'),
    title: baustein(html, 'Titel'),
    date: baustein(html, 'Datierung'),
    medium: baustein(html, 'Material_Technik'),
    dimensions: baustein(html, 'Ma&szlig;e') || baustein(html, 'Maße'),
    objektbez: baustein(html, 'Objektbezeichnung'),
    gattung: baustein(html, 'Gattung'),
    standort: baustein(html, 'Standort'),
    invnr: null,
    year: null,
    onDisplay: false,
    stdImg: null,
    thumbImg: null,
  };
  // On-display flag: Standort reads "zurzeit ausgestellt" / "zurzeit nicht ausgestellt".
  if (out.standort) out.onDisplay = /zurzeit ausgestellt/i.test(out.standort);
  // year from Datierung (earliest 4-digit; handle "um 1914", "1910/1920")
  if (out.date) { const y = out.date.match(/\b(1[0-9]\d{2}|20\d{2})\b/); if (y) out.year = Number(y[0]); }
  // Inventory number from Verwalter block: "Inv.-Nr. ML 76/2943,"
  const inv = html.match(/Inv\.-Nr\.\s*([^<,]+?)\s*(?:,|<)/);
  if (inv) out.invnr = dec(inv[1]).trim();
  // High-res image: altsrc of the main <img class="thumb"> (standard/ path), else src
  const std = html.match(/<img class="thumb"[^>]*\baltsrc="(https:\/\/kekmedien[^"]+\/standard\/[^"]+)"/i);
  if (std) out.stdImg = dec(std[1]);
  const th = html.match(/<img class="thumb"[^>]*\bsrc="(https:\/\/kekmedien[^"]+\/thumbnail\/[^"]+)"/i);
  if (th) out.thumbImg = dec(th[1]);
  if (!out.stdImg && out.thumbImg) out.stdImg = out.thumbImg.replace('/thumbnail/', '/standard/');
  return out;
}

// Refine category. The sub-collection (base) is authoritative; only override on an
// unambiguous medium signal. Keep it conservative — a painting with mixed media
// ("Öl, Kreide und Sand auf Leinwand") stays a painting because it's on canvas/panel.
function refineCategory(base, meta) {
  const t = `${meta.medium || ''} ${meta.objektbez || ''} ${meta.gattung || ''}`.toLowerCase();
  const onSupport = /(leinwand|holz|pappe|karton|hartfaser|tafel|kupfer|aluminium|leinen)/.test(t); // canvas/panel/board
  if (base === 'painting') {
    // Only downgrade to drawing if clearly a work on paper with no canvas/panel support.
    if (!onSupport && /(aquarell|gouache|pastell|zeichnung|bleistift|tusche auf papier|auf papier)/.test(t)) return 'drawing';
    return 'painting';
  }
  if (base === 'photograph') {
    if (/(film|video|loop|moving image)/.test(t)) return 'video';
    return 'photograph';
  }
  // base === 'print' (Grafik): split between print, drawing, and the odd painting/photo.
  if (/(fotografie|photograph|gelatin|silbergelatine|c-print|diapositiv|negativ)/.test(t)) return 'photograph';
  if (/(film|video|loop)/.test(t)) return 'video';
  if (/(radierung|lithografie|lithographie|siebdruck|holzschnitt|kupferstich|stich|aquatinta|offset|serigrafie|druck)/.test(t)) return 'print';
  if (/(aquarell|gouache|pastell|zeichnung|bleistift|kohle|kreide|tusche|feder|collage|montage)/.test(t)) return 'drawing';
  if (onSupport && /(öl|tempera|acryl|gemälde)/.test(t)) return 'painting';
  return base;
}

// Value-filter EXCLUSIONS for drawings/prints/photographs — only when the source
// EXPLICITLY labels the work as a study/copy/proof (matched on the German fields,
// word-boundaried so e.g. "Studie" doesn't catch "Studio"). Never applied to paintings.
const EXCLUDE_LABEL = /\b(studie|studien|skizze|skizzen|entwurf|vorzeichnung|kopie|nachbildung|reproduktion|nachdruck|abklatsch|probedruck|probeabzug|andruck|zustandsdruck|arbeitsabzug)\b/i;
function isExcludedGenre(meta) {
  const t = `${meta.objektbez || ''} ${meta.gattung || ''} ${meta.title || ''} ${meta.medium || ''}`.toLowerCase();
  return EXCLUDE_LABEL.test(t);
}

// ---------- R2 ----------
async function r2Exists(key) {
  try { await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key })); return true; }
  catch { return false; }
}
async function r2Upload(key, buf) {
  await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buf, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
}
async function downloadImage(url, attempt = 1) {
  let res;
  try { res = await fetch(url, { headers: { 'User-Agent': UA, Referer: BASE + '/' }, redirect: 'follow' }); }
  catch (e) { if (attempt <= 4) { await sleep(700 * 2 ** (attempt - 1)); return downloadImage(url, attempt + 1); } throw e; }
  // 429/5xx = transient CDN throttle → back off and retry the same signed URL (TTL is hours).
  if ((res.status === 429 || res.status >= 500) && attempt <= 4) { await sleep(900 * 2 ** (attempt - 1)); return downloadImage(url, attempt + 1); }
  // 403/404 are PERSISTENT for kekmedien — the standard/ image is rights-restricted or absent
  // (verified: retries never clear it). Fail fast with a distinct tag so the caller EXCLUDES
  // it as a broken image rather than retrying forever.
  if (res.status === 403 || res.status === 404) throw new Error(`img-broken ${res.status}`);
  if (!res.ok) throw new Error(`img HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 2048) throw new Error(`tiny: ${buf.length}B`);
  return buf;
}

// ---------- listing ----------
// Collect EVERY obj id in a sub-collection (no cap). 60 ids/page, zero overlap.
async function listSubcollection(sub) {
  await fetchPage(`${BASE}/ete?action=neueSuche`);
  const first = await fetchPage(`${BASE}/ete?action=hinzufuegenFilter&filter=filter_subsammlungen_ml&term=${encodeURIComponent(sub.term)}`);
  const totalM = first.match(/([0-9.]+)\s*Dokument/);
  const total = totalM ? Number(totalM[1].replace(/\./g, '')) : 0;
  console.log(`[ml] ${sub.label}: ${total} documents`);

  const ids = new Set();
  const collect = html => { for (const m of html.matchAll(/obj\/(\d+)/g)) ids.add(m[1]); };
  collect(first);
  // Drive pagination by OFFSET up to `total` (result position), NOT by "no new ids".
  // KEK occasionally serves a page with no fresh ids mid-run; bailing on that drops the
  // tail (earlier bug: Fotografie stopped at 9,960/16,791). Walk every offset to total,
  // tolerate empty/duplicate pages, and only stop early after a long empty streak past
  // where we'd expect results. Retry a failed page a few times (rate-limit cool-off).
  const lastOffset = total ? total + PER_PAGE : 60000;
  let emptyStreak = 0;
  for (let offset = 1 + PER_PAGE; offset <= lastOffset; offset += PER_PAGE) {
    let html = null;
    for (let a = 1; a <= 4 && html === null; a++) {
      try { html = await fetchPage(`${BASE}/ete?action=displayResult/${offset}`); }
      catch (e) { console.warn(`[ml] ${sub.label} offset ${offset} err: ${e.message} (try ${a})`); await sleep(1200 * a); }
    }
    if (html === null) { console.warn(`[ml] ${sub.label} offset ${offset} unrecoverable — skipping page`); continue; }
    const before = ids.size;
    collect(html);
    // Stop only if we've passed `total` AND pages have gone dry for a while (true end).
    if (ids.size === before) { emptyStreak++; if (ids.size >= total && emptyStreak >= 3) break; if (emptyStreak >= 50) break; }
    else emptyStreak = 0;
    if (ids.size % 1200 < PER_PAGE) console.log(`[ml]   ${sub.label} listed ${ids.size}/${total} (offset ${offset})`);
    if (total && ids.size >= total) break;
    await sleep(70);
  }
  console.log(`[ml] ${sub.label}: collected ${ids.size} ids (source total ${total})`);
  return { total, items: [...ids].map(id => ({ id, category: sub.category, sub: sub.label })) };
}

// ---------- triage checkpoint (resumable) ----------
// One NDJSON line per detail page we've decided on, so re-runs skip already-fetched
// pages. A "kept" line carries the full parsed record (incl. R2 key) so a resumed run
// can rebuild the JSON without re-downloading. status ∈ kept | excluded | failed.
function loadTriage() {
  const map = new Map();
  if (RESET_TRIAGE || !fs.existsSync(TRIAGE_PATH)) return map;
  for (const line of fs.readFileSync(TRIAGE_PATH, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const o = JSON.parse(line); map.set(o.id, o); } catch {}
  }
  return map;
}

async function main() {
  console.log(`[ml] mode=${LIMIT ? `pilot(${LIMIT})` : 'full (no painting cap; value-filter graphics+photo)'}  concurrency=${CONCURRENCY}`);
  fs.mkdirSync(STATE_DIR, { recursive: true });

  // 0. warm up PoW cookie
  await fetchPage(`${BASE}/`);
  console.log(`[ml] PoW cookie acquired: ${COOKIE ? COOKIE.split('=')[0] : '(none)'}`);

  // 1. List EVERY id in each in-scope sub-collection (no cap). Record source totals.
  const sourceTotals = {};   // label → total documents on source
  const candidates = [];
  for (const sub of SUBCOLLECTIONS) {
    const { total, items } = await listSubcollection(sub);
    sourceTotals[sub.label] = total;
    candidates.push(...items);
    if (LIMIT && candidates.length >= LIMIT * 4) break;  // pilot only needs a slice
  }
  const totalInScope = Object.values(sourceTotals).reduce((a, b) => a + b, 0);
  console.log(`[ml] listed ${candidates.length} ids across sub-collections (source in-scope ${totalInScope})`);
  console.log(`[ml] source totals: ${JSON.stringify(sourceTotals)}`);

  // Re-warm the PoW cookie: the listing phase can run >30 min and the token TTL is ~1h,
  // so refresh before the long triage so workers don't all stampede the shell at once.
  COOKIE = '';
  await fetchPage(`${BASE}/`);
  console.log(`[ml] PoW cookie re-warmed for triage: ${COOKIE ? COOKIE.split('=')[0] : '(none)'}`);

  // 2. Triage each detail page (resumable). Paintings: keep all. Graphics/photo: value filter.
  const triage = loadTriage();
  const triageFh = fs.openSync(TRIAGE_PATH, 'a');
  const writeTriage = rec => { fs.writeSync(triageFh, JSON.stringify(rec) + '\n'); triage.set(rec.id, rec); };

  const stats = {};  // label → {seen, kept, excluded, failed, exclReason:{}}
  const bump = (label, k, sub) => { (stats[label] = stats[label] || { seen: 0, kept: 0, excluded: 0, failed: 0, exclReason: {} })[k]++; if (sub) stats[label].exclReason[sub] = (stats[label].exclReason[sub] || 0) + 1; };

  let done = 0, kept = 0, excluded = 0, failed = 0;
  // Transient only. img-broken (persistent 403/404) is handled separately as an exclusion;
  // img HTTP 5xx that escapes downloadImage's own retries is worth one more serial attempt.
  const RETRYABLE = /^(detail:|no-title$|soft-block$|HTTP \d|img HTTP 5|tiny:|fetch failed|other side closed|terminated|PoW)/i;

  // Decide + (if kept) fetch image → R2. Writes one triage line. Returns 'kept'|'excluded'|'failed'.
  async function processOne(c) {
    const detailUrl = `${BASE}/documents/obj/${c.id}`;
    let html;
    try { html = await fetchPage(detailUrl); }
    catch (e) { writeTriage({ id: c.id, status: 'failed', reason: `detail: ${e.message}`, retryable: true }); return 'failed'; }

    // A genuine record always has several "Bausteine" blocks. ZERO blocks ⇒ the fetch got
    // a soft-block / error interstitial (server rate-limited us after many rapid requests),
    // not a real titleless record. Mark soft-block (retryable, backs off) so we don't poison
    // the checkpoint with false no-titles. (This was the 100%-no-title failure mode.)
    const hasAnyBaustein = /<div class="Bausteine /.test(html);
    const meta = parseDetail(html);
    if (!meta.title) {
      const reason = hasAnyBaustein ? 'no-title' : 'soft-block';
      writeTriage({ id: c.id, status: 'failed', reason, retryable: true });
      if (!hasAnyBaustein) await sleep(400); // ease off the rate limiter
      return 'failed';
    }
    if (!meta.stdImg || /dummy|fehler|platzhalter/i.test(meta.stdImg)) {
      writeTriage({ id: c.id, status: 'excluded', sub: c.sub, reason: 'no-image', exclTag: 'no-image' });
      bump(c.sub, 'excluded', 'no-image'); return 'excluded';
    }
    const category = refineCategory(c.category, meta);

    // VALUE FILTER — paintings are never filtered. Graphics/photo: drop explicit study/copy/proof.
    if (category !== 'painting' && isExcludedGenre(meta)) {
      writeTriage({ id: c.id, status: 'excluded', sub: c.sub, reason: 'genre-label', exclTag: 'study/copy/proof' });
      bump(c.sub, 'excluded', 'study/copy/proof'); return 'excluded';
    }

    let artist = meta.artist;
    if (!artist || /^(unbekannt|anonym|ohne|n\.n\.?)$/i.test(artist)) artist = 'Anonymous';
    const imgUrl = meta.stdImg;
    const key = `artworks/${STEM}/${c.id}-${stableImgHash(imgUrl)}-imageUrl.webp`;
    try {
      const exists = await r2Exists(key);
      if (!exists) {
        const buf = await downloadImage(imgUrl);
        const probe = await sharp(buf, { limitInputPixels: false }).metadata();
        // IMAGE-QUALITY GATE (graphics/photo only) — long edge must be ≥ MIN_EDGE.
        // Paintings are kept regardless (rare, prestigious, never undersized in practice).
        if (category !== 'painting' && Math.max(probe.width || 0, probe.height || 0) < MIN_EDGE) {
          writeTriage({ id: c.id, status: 'excluded', sub: c.sub, reason: `small-img ${probe.width}x${probe.height}`, exclTag: 'low-res' });
          bump(c.sub, 'excluded', 'low-res'); return 'excluded';
        }
        const webp = await sharp(buf, { limitInputPixels: false })
          .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 85 }).toBuffer();
        await r2Upload(key, webp);
      }
      const rec = {
        id: `ml-${c.id}`,
        objectNumber: meta.invnr || c.id,
        title: meta.title,
        artist,
        date: meta.date || (meta.year ? String(meta.year) : null),
        year: meta.year,
        medium: meta.medium || '',
        dimensions: meta.dimensions || '',
        category,
        description: '',
        imageUrl: `${R2_PUBLIC}/${key}`,
        thumbnailUrl: meta.thumbImg || imgUrl,
        onDisplay: meta.onDisplay,
        displayLocation: meta.onDisplay ? (meta.standort || '') : '',
        sourceUrl: detailUrl,
        metadata: {
          kekObjId: c.id,
          subCollection: c.sub,
          objektbezeichnung: meta.objektbez || '',
          gattung: meta.gattung || '',
          standort: meta.standort || '',
        },
        original_imageUrl: imgUrl,
      };
      writeTriage({ id: c.id, status: 'kept', sub: c.sub, record: rec });
      bump(c.sub, 'kept'); return 'kept';
    } catch (e) {
      // Persistent 403/404 ⇒ the standard image is rights-restricted/absent ⇒ broken image.
      // Exclude per the value-filter (not a retryable failure).
      if (/^img-broken/.test(e.message)) {
        writeTriage({ id: c.id, status: 'excluded', sub: c.sub, reason: e.message, exclTag: 'broken-img' });
        bump(c.sub, 'excluded', 'broken-img'); return 'excluded';
      }
      writeTriage({ id: c.id, status: 'failed', reason: e.message, retryable: RETRYABLE.test(e.message) });
      return 'failed';
    }
  }

  async function runPool(items, concurrency, label) {
    const queue = [...items];
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (queue.length) {
        const c = queue.shift();
        if (!c) return;
        const r = await processOne(c);
        done++;
        if (r === 'kept') kept++; else if (r === 'excluded') excluded++; else failed++;
        if (done % 100 === 0) console.log(`[ml] ${label} ${done}/${items.length}  kept=${kept} excl=${excluded} fail=${failed}`);
        await sleep(THROTTLE_MS); // global rate cap — KEK soft-blocks bursts of a few hundred req
      }
    }));
  }

  // Skip ids already decided in a prior run (resume). Re-attempt only prior transient failures.
  const todo = candidates.filter(c => {
    const t = triage.get(c.id);
    if (!t) return true;
    return t.status === 'failed' && t.retryable;  // retry transient fails, keep settled ones
  });
  console.log(`[ml] triage: ${triage.size} already decided, ${todo.length} to (re)fetch`);

  await runPool(todo, CONCURRENCY, 'triage');

  // Retry passes for transient failures (incl. rate-limit soft-blocks). Low concurrency +
  // a cooldown + a fresh PoW cookie each round, so a temporary block has time to clear.
  for (let round = 1; round <= 4; round++) {
    const retry = [...triage.values()].filter(t => t.status === 'failed' && t.retryable).map(t => candidates.find(c => c.id === t.id)).filter(Boolean);
    if (!retry.length) break;
    console.log(`[ml] retry round ${round}: ${retry.length} transient failures`);
    await sleep(5000);
    COOKIE = ''; await fetchPage(`${BASE}/`);
    await runPool(retry, 2, `retry${round}`);
  }
  fs.closeSync(triageFh);

  // 3. Assemble final artwork list from all "kept" triage rows (full collection — no cap).
  let finalArtworks = [...triage.values()].filter(t => t.status === 'kept' && t.record).map(t => t.record);
  if (LIMIT) finalArtworks = finalArtworks.slice(0, LIMIT);

  // Per-medium total vs collected (mandatory reporting).
  const collectedBy = {};
  finalArtworks.forEach(a => { const s = a.metadata.subCollection; collectedBy[s] = (collectedBy[s] || 0) + 1; });

  // 4. Write JSON
  const out = {
    museum: 'Museum Ludwig',
    collection: LIMIT ? `Pilot ${finalArtworks.length} items` : 'Museum Ludwig — flat visual art (all paintings; value-filtered graphics & photography)',
    website: 'https://www.museum-ludwig.de/en/collection/',
    source: 'museum-ludwig.kulturelles-erbe-koeln.de (City of Cologne KEK portal) — PoW handshake + per-object HTML scrape',
    scraped_date: '2026-06-03',
    total_count: finalArtworks.length,
    source_type: 'kek-pow+html',
    source_totals: sourceTotals,
    collected_by_subcollection: collectedBy,
    value_filter: 'paintings: all (no cap). graphics+photo: keep all passing image-quality gate (long-edge ≥400px, not dummy/broken); exclude source-labelled study/sketch/copy/reproduction/proof. on-display (Standort) recorded but not used to thin (only ~0-1% are on display).',
    artworks: finalArtworks,
  };
  fs.writeFileSync(path.join(REPO_ROOT, OUT_JSON), JSON.stringify(out, null, 2));
  console.log(`\n[ml] wrote ${OUT_JSON} (${finalArtworks.length} artworks)`);

  // 5. Report — per-medium total / collected / excluded breakdown
  console.log(`\n=== Per-medium: source total / collected / excluded / failed ===`);
  for (const sub of SUBCOLLECTIONS) {
    const s = stats[sub.label] || { kept: 0, excluded: 0, failed: 0, exclReason: {} };
    const col = collectedBy[sub.label] || 0;
    console.log(`  ${sub.label}: source ${sourceTotals[sub.label]} / collected ${col} / excluded ${s.excluded} (${JSON.stringify(s.exclReason)}) / failed ${s.failed}`);
  }
  const n = finalArtworks.length;
  const catDist = {};
  finalArtworks.forEach(a => { catDist[a.category] = (catDist[a.category] || 0) + 1; });
  console.log(`\n=== Coverage on ${n} kept ===`);
  console.log(`  title:      ${finalArtworks.filter(a => a.title).length}/${n}`);
  console.log(`  artist:     ${finalArtworks.filter(a => a.artist && a.artist !== 'Anonymous').length}/${n} real (+${finalArtworks.filter(a => a.artist === 'Anonymous').length} Anonymous)`);
  console.log(`  year:       ${finalArtworks.filter(a => a.year != null).length}/${n}`);
  console.log(`  medium:     ${finalArtworks.filter(a => a.medium).length}/${n}`);
  console.log(`  dimensions: ${finalArtworks.filter(a => a.dimensions).length}/${n}`);
  console.log(`  onDisplay:  ${finalArtworks.filter(a => a.onDisplay).length}/${n}`);
  console.log(`  cat dist:   ${JSON.stringify(catDist)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
