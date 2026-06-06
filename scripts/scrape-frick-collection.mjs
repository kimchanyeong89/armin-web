#!/usr/bin/env node
// The Frick Collection (New York) — collection scraper.
// Source: museum-OWN eMuseum (Gallery Systems / TMS) + IIIF Image API, collections.frick.org.
//   eMuseum JSON content-negotiation is DISABLED on this instance (?format=json / Accept:json
//   both return the rendered HTML detail page), so we PARSE SERVER HTML — there is no JSON API.
//
// ⚠️ FASTLY WAF GATE. collections.frick.org is fronted by a Fastly Next-Gen WAF "Client
//   Challenge". A plain fetch/curl gets either a 3 KB JS-challenge shell or (current posture,
//   verified 2026-06-05) a hard HTTP 418 with a 0-byte body. The documented bypass is: load one
//   page in a REAL browser so the Fastly challenge JS runs and sets a clearance cookie, then
//   reuse that cleared browser context for in-page fetch() of every other page (HTML + IIIF).
//   This script drives Playwright (or system Chrome) to obtain that clearance, then fetches
//   everything in-page. If the WAF refuses to serve a challenge body (418 / no body), the
//   challenge JS never runs, no cookie can be obtained, and the scrape is BLOCKED — the script
//   exits non-zero rather than fabricating data.
//
// SCOPE (scripts/COLLECTION_SCRAPING_GUIDE.md §1): flat visual art only.
//   Paintings  = collect ALL (no cap)         — group "explore-paintings"  (~199).
//   Works on paper (drawings/prints) = value-filter; skip study/sketch/copy + portrait
//                                       miniatures — group "explore-works-on-paper" (~134).
//   Excluded: sculpture, decorative arts, clocks, porcelain, furniture (the other ~1,550 of the
//   1,883 total objects). We only enumerate the two in-scope groups, so 3D never enters.
//
// METADATA: all 6 fields come from the DETAIL record's label/value DOM rows + the artist anchor
//   under <h1>. artist kept verbatim as source ("Charles-François Daubigny (French, 1817–1878)");
//   NEVER backfilled with Anonymous. min-4 (title+artist+year+category) or the record is dropped.
//
// IMAGE: full-size via IIIF. primary mediaId = first `dispatcher/(\d+)/preview` in the object
//   HTML; full image = /apis/iiif/image/v2/{mediaId}/full/2048,/0/default.jpg (bounded — native
//   /full/full 500s). webp(2048/q85), autocrop OFF. R2 key
//   artworks/frick-collection-collection/{id}-{hash8}-imageUrl.webp.
//
// Usage:
//   node scripts/scrape-frick-collection.mjs --classify        # enumerate groups, scope tally (no images)
//   node scripts/scrape-frick-collection.mjs --pilot           # ~20 in-scope, parse + IIIF, NO R2 (validation)
//   node scripts/scrape-frick-collection.mjs --pilot --upload  # pilot WITH R2 upload
//   node scripts/scrape-frick-collection.mjs --full            # full scrape + R2 upload → collection JSON

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { autocropToWebp } from './lib/autocrop.mjs';

const require = createRequire(import.meta.url);
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const REPO_DIR = path.resolve(fileURLToPath(import.meta.url), '../..');
require('dotenv').config({ path: path.join(REPO_DIR, '.env.local') });

const SLUG = 'frick-collection';
const COLLECTION_STEM = `${SLUG}-collection`;
const ORIGIN = 'https://collections.frick.org';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO_DIR, 'scripts/.state');

// In-scope eMuseum groups. classHint guides value-filter/category for works-on-paper.
const GROUPS = [
  { slug: 'explore-paintings', kind: 'painting' },
  { slug: 'explore-works-on-paper', kind: 'works-on-paper' },
];

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--pilot') ? 'pilot' : 'classify';
const DO_UPLOAD = args.includes('--upload') || MODE === 'full';
const PILOT_TARGET = 20;
const SEED_URL = `${ORIGIN}/objects/146/the-washerwomen`; // any real object — used to clear the WAF

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
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .trim();
const stripTags = (s) => decodeEntities(String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();

// ---------- browser session: clear Fastly WAF, expose in-page fetch ----------
// Resolve a usable Chrome binary: Playwright's bundled chromium if present, else a
// puppeteer-cached "Chrome for Testing", else the user's system Google Chrome.
function resolveChromeExe(chromium) {
  const candidates = [];
  try { const p = chromium.executablePath(); if (p) candidates.push(p); } catch { /* ignore */ }
  const ppDir = path.join(process.env.HOME || '', '.cache/puppeteer/chrome');
  try {
    for (const d of fs.readdirSync(ppDir).sort().reverse()) {
      for (const sub of ['chrome-mac-arm64', 'chrome-mac-x64']) {
        const p = path.join(ppDir, d, sub, 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
        if (fs.existsSync(p)) candidates.push(p);
      }
    }
  } catch { /* ignore */ }
  candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  return candidates.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || null;
}

// Returns { ctx, page, fetchText, fetchImage, close } — all fetches run inside the cleared page.
async function openSession() {
  const { chromium } = await import('playwright');
  const exe = resolveChromeExe(chromium);
  const launchOpts = { headless: true, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] };
  if (exe) launchOpts.executablePath = exe;
  const browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext({ userAgent: UA, locale: 'en-US', viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();

  // Load one page so the Fastly challenge JS runs and sets a clearance cookie. The challenge
  // body is served with a non-2xx status, so page.goto throws ERR_HTTP_RESPONSE_CODE_FAILURE —
  // swallow it and poll until the real object page (an <h1>) renders. If the WAF returns a hard
  // 418/0-byte (no challenge body), Chromium shows its own error page forever → we never clear.
  try {
    await page.goto(SEED_URL, { waitUntil: 'commit', timeout: 45000 });
  } catch (e) { /* expected on challenge status */ }

  let cleared = false;
  for (let i = 0; i < 12; i++) {
    await sleep(2500);
    let h1 = null, title = null;
    try { title = await page.title(); } catch { /* ignore */ }
    try { h1 = await page.evaluate(() => { const e = document.querySelector('h1'); return e ? e.textContent.trim() : null; }); } catch { /* ignore */ }
    const bad = /client challenge|isn.t working|can.t be reached/i.test(`${title || ''} ${h1 || ''}`);
    if (h1 && !bad) { cleared = true; break; }
  }
  if (!cleared) {
    await browser.close();
    throw new Error(
      'WAF_BLOCKED: Fastly Client Challenge never cleared. collections.frick.org served a hard ' +
      '418 / no challenge body, so the challenge JS could not run and no clearance cookie was set. ' +
      'Unattended browser automation cannot pass this posture. Re-run when the WAF relaxes, or ' +
      'supply a valid clearance cookie obtained from a manual browser session.'
    );
  }

  // In-page fetch helpers (same cleared origin → cookie + JA3 are honoured).
  const fetchText = async (url) => page.evaluate(async (u) => {
    const r = await fetch(u, { credentials: 'include' });
    return { status: r.status, body: await r.text() };
  }, url);
  const fetchImage = async (url) => {
    // Pull bytes inside the page (base64) so the cleared session is used, then decode in Node.
    const r = await page.evaluate(async (u) => {
      const res = await fetch(u, { credentials: 'include' });
      if (!res.ok) return { status: res.status, b64: null, ct: res.headers.get('content-type') };
      const buf = new Uint8Array(await res.arrayBuffer());
      let bin = ''; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      return { status: res.status, b64: btoa(bin), ct: res.headers.get('content-type') };
    }, url);
    return { status: r.status, ct: r.ct, buf: r.b64 ? Buffer.from(r.b64, 'base64') : null };
  };
  const close = () => browser.close();
  return { ctx, page, fetchText, fetchImage, close };
}

// ---------- listing: enumerate object ids per group (server-rendered, paginated) ----------
// eMuseum group results list /objects/{id}/{slug} links; standard ?page= (1-based), 100/page.
async function listGroup(sess, groupSlug) {
  const ids = new Map(); // id -> slug
  let total = null;
  for (let page = 1; page <= 60; page++) {
    const url = `${ORIGIN}/groups/${groupSlug}/results?page=${page}`;
    const { status, body } = await sess.fetchText(url);
    await sleep(400);
    if (status !== 200) throw new Error(`listGroup ${groupSlug} page ${page}: HTTP ${status}`);
    if (total == null) {
      const m = body.replace(/,/g, '').match(/([\d]+)\s+results?/i);
      total = m ? parseInt(m[1], 10) : null;
    }
    let found = 0;
    const re = /\/objects\/(\d+)\/([a-z0-9\-]+)/gi;
    let mm;
    while ((mm = re.exec(body))) { if (!ids.has(mm[1])) { ids.set(mm[1], mm[2]); found++; } }
    if (found === 0) break; // no more object links → past the last page
  }
  return { ids, total };
}

// ---------- detail HTML → fields ----------
// eMuseum renders fields as label/value rows. We extract by label keyword from the field block.
function valueForLabel(html, labels) {
  for (const lab of labels) {
    // <dt|th|span class=...>Medium</...> <dd|td|span ...>VALUE</...>  — tolerate wrappers between.
    const re = new RegExp(`>\\s*${lab}\\s*<\\/[a-z0-9]+>\\s*(?:<[^>]*>\\s*)*?<[^>]*>([\\s\\S]*?)<\\/`, 'i');
    const m = html.match(re);
    if (m && stripTags(m[1])) return stripTags(m[1]);
    // eMuseum variant: data-attribute rows  "field-Medium ...>VALUE<"
    const re2 = new RegExp(`field[-_ ]?${lab}[^>]*>\\s*(?:<[^>]*>\\s*)*([\\s\\S]*?)<\\/`, 'i');
    const m2 = html.match(re2);
    if (m2 && stripTags(m2[1])) return stripTags(m2[1]);
  }
  return '';
}

function parseDetail(id, slug, html, group) {
  const title = stripTags((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '');
  // artist: the anchor/line directly under <h1> — "/people/" link or "people"-class block.
  let artist = '';
  const aMatch = html.match(/<a[^>]+href="\/people\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
  if (aMatch) artist = stripTags(aMatch[1]);
  if (!artist) artist = valueForLabel(html, ['Artist', 'Maker', 'Culture']);

  const date = valueForLabel(html, ['Date', 'Dated']);
  const medium = valueForLabel(html, ['Medium', 'Materials', 'Material']);
  const dimensions = valueForLabel(html, ['Dimensions', 'Measurements']);
  const objectNumber = valueForLabel(html, ['Accession Number', 'Accession number', 'Object Number', 'Object number']);
  const creditLine = valueForLabel(html, ['Credit Line', 'Credit line']);
  const classification = valueForLabel(html, ['Classification', 'Object Type', 'Type']);
  const onView = valueForLabel(html, ['On View', 'On view', 'Location']);

  const yMatch = (date || '').match(/\d{4}/);
  const year = yMatch ? parseInt(yMatch[0], 10) : null;

  // primary IIIF mediaId = FIRST dispatcher/{id}/preview (subsequent ids are "Discover More").
  const mediaId = (html.match(/dispatcher\/(\d+)\/preview/i) || [])[1] || null;

  const category = classify({ group, classification, medium, title });

  return {
    id: String(id), slug, title, artist, date, year, medium, dimensions,
    objectNumber, creditLine, classification, onView, mediaId, category,
    sourceUrl: `${ORIGIN}/objects/${id}/${slug}`,
  };
}

// ---------- scope classifier ----------
// Paintings group → painting (collect all). Works-on-paper group → drawing|print by medium,
// with value-filter (skip study/sketch/copy + portrait miniatures). Returns null = out of scope.
function classify({ group, classification, medium, title }) {
  const cls = (classification || '').toLowerCase();
  const med = (medium || '').toLowerCase();
  const ttl = (title || '').toLowerCase();

  // hard EXCLUDE — sculpture / decorative arts / 3D (defensive; groups already exclude these).
  if (/sculpture|bronze|marble|terracotta|porcelain|ceramic|enamel\b|clock|furniture|cabinet|vase|medal|bust|relief|silver|gilt bronze|mounts?\b/.test(cls)) return null;

  // portrait miniature exclusion (ivory/enamel/vellum pendant portraits) — policy §1.
  if (/miniature/.test(cls) || (/portrait miniature/.test(ttl)) ||
      (/(ivory|vellum|enamel)/.test(med) && !/vellum paper/.test(med) && /miniature|locket|pendant/.test(`${cls} ${ttl}`))) return null;

  if (group === 'painting' || /\bpainting\b/.test(cls)) return 'painting';

  // works on paper: value-filter — drop preparatory/derivative sheets.
  if (/\b(study|studies|sketch|copy after|copy of|reproduction|tracing)\b/.test(`${ttl} ${cls}`)) return null;

  if (/etching|engraving|lithograph|woodcut|aquatint|mezzotint|drypoint|print\b|intaglio|serigraph|screenprint/.test(`${cls} ${med}`)) return 'print';
  if (/drawing|chalk|charcoal|graphite|pen and ink|ink\b|watercolor|watercolour|gouache|pastel|wash\b|crayon/.test(`${cls} ${med}`)) return 'drawing';

  // works-on-paper group fallback: treat as drawing (unique sheet) unless clearly 3D (handled above).
  if (group === 'works-on-paper') return 'drawing';
  return null;
}

// ---------- image: IIIF full-size → autocrop(off) webp → R2 ----------
function iiifUrl(mediaId) { return `${ORIGIN}/apis/iiif/image/v2/${mediaId}/full/2048,/0/default.jpg`; }

async function uploadR2(key, buffer) {
  for (let att = 1; att <= 4; att++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      return true;
    } catch (e) { if (att === 4) throw e; await sleep(400 * att); }
  }
}

async function processImage(sess, a, doUpload) {
  if (!a.mediaId) throw new Error('no mediaId');
  const url = iiifUrl(a.mediaId);
  const { status, ct, buf } = await sess.fetchImage(url);
  if (status !== 200 || !buf) throw new Error(`IIIF ${status}`);
  if (!/image\//.test(ct || '')) throw new Error(`not image (${ct})`);
  if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
  const sharp = (await import('sharp')).default;
  const meta = await sharp(buf).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(buf); // autocrop OFF (no trim opts) → pure webp 2048/q85
  const hash8 = sha(url).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
  if (doUpload) await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, original_imageUrl: url, srcW: meta.width || null, srcH: meta.height || null, uploaded: doUpload };
}

// ---------- record assembly (min-4 guard) ----------
function toArtwork(a, imageUrl, original_imageUrl) {
  if (!a.title || !a.artist || a.year == null || !a.category) return null; // min-4 → drop
  return {
    id: a.id,
    objectNumber: a.objectNumber || '',
    title: a.title,
    artist: a.artist, // verbatim source; never Anonymous-backfilled
    date: a.date || (a.year != null ? String(a.year) : ''),
    year: a.year,
    medium: a.medium || '',
    dimensions: a.dimensions || '',
    category: a.category,
    description: '',
    imageUrl,
    thumbnailUrl: original_imageUrl,
    onDisplay: !!(a.onView && !/not on view/i.test(a.onView)),
    displayLocation: a.onView || '',
    sourceUrl: a.sourceUrl,
    creditLine: a.creditLine || '',
    classification: a.classification || '',
    metadata: { emuseum_id: a.id, emuseum_slug: a.slug, media_id: a.mediaId },
    original_imageUrl,
  };
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'The Frick Collection',
    collection: 'Collection',
    website: 'https://collections.frick.org',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'html',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO_DIR, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`[write] ${out} (${artworks.length} works) breakdown=`, cats);
  return out;
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  console.log(`[frick] mode=${MODE} upload=${DO_UPLOAD}`);
  console.log('[frick] opening cleared browser session (Fastly WAF) …');
  const sess = await openSession();
  console.log('[frick] WAF cleared ✓');

  try {
    // 1) enumerate in-scope object ids from both groups
    const objs = []; // { id, slug, group }
    for (const g of GROUPS) {
      const { ids, total } = await listGroup(sess, g.slug);
      console.log(`[list] ${g.slug}: ${ids.size} ids (group reports ${total ?? '?'} results)`);
      for (const [id, slug] of ids) objs.push({ id, slug, group: g.kind === 'painting' ? 'painting' : 'works-on-paper' });
    }
    // de-dup across groups (an object can appear once)
    const seen = new Set();
    const queue = objs.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
    console.log(`[list] total unique objects to fetch = ${queue.length}`);

    if (MODE === 'classify') {
      // fetch detail for a sample to verify the scope classifier + field extraction
      const sample = queue.slice(0, 12);
      const tally = {};
      console.log('\n[classify] sampling', sample.length, 'detail pages …');
      for (const o of sample) {
        const { status, body } = await sess.fetchText(o.sourceUrl || `${ORIGIN}/objects/${o.id}/${o.slug}`);
        await sleep(400);
        if (status !== 200) { console.log(`   obj ${o.id}: HTTP ${status}`); continue; }
        const d = parseDetail(o.id, o.slug, body, o.group);
        tally[d.category || 'OUT'] = (tally[d.category || 'OUT'] || 0) + 1;
        console.log(`   obj ${o.id} [${d.category || 'OUT'}] "${(d.title || '').slice(0, 40)}" — ${d.artist.slice(0, 30)} | ${d.year} | ${d.medium.slice(0, 24)} | media=${d.mediaId}`);
      }
      console.log('\n[classify] sample category tally:', tally);
      console.log('[classify] projected in-scope total ≈ paintings(all) + works-on-paper(value-filtered)');
      return;
    }

    if (MODE === 'pilot') queue.length = Math.min(queue.length, PILOT_TARGET * 3); // headroom for OUT/min4 drops

    // 2) fetch detail + image for each object
    const artworks = [];
    let done = 0, outScope = 0, imgErr = 0, dropMin4 = 0;
    for (const o of queue) {
      try {
        const { status, body } = await sess.fetchText(o.sourceUrl || `${ORIGIN}/objects/${o.id}/${o.slug}`);
        await sleep(350);
        if (status !== 200) throw new Error(`detail HTTP ${status}`);
        const d = parseDetail(o.id, o.slug, body, o.group);
        if (!d.category) { outScope++; continue; }
        const { imageUrl, original_imageUrl } = await processImage(sess, d, DO_UPLOAD);
        const w = toArtwork(d, imageUrl, original_imageUrl);
        if (w) artworks.push(w); else dropMin4++;
      } catch (e) {
        imgErr++;
        fs.appendFileSync(path.join(STATE_DIR, `${SLUG}-failed.ndjson`), JSON.stringify({ id: o.id, err: String(e.message || e) }) + '\n');
        if (imgErr <= 8) console.log(`  err id=${o.id}: ${e.message}`);
      }
      if (++done % 25 === 0) console.log(`  …${done}/${queue.length} (ok ${artworks.length}, out ${outScope}, err ${imgErr})`);
      if (MODE === 'pilot' && artworks.length >= PILOT_TARGET) break;
    }

    artworks.sort((x, y) => Number(x.id) - Number(y.id));
    const stem = MODE === 'pilot' ? `${COLLECTION_STEM}-pilot` : COLLECTION_STEM;
    writeCollection(artworks, stem);
    console.log(`\n[${MODE}] DONE. collected ${artworks.length} | out-of-scope ${outScope} | errors ${imgErr} | min4-drops ${dropMin4}`);
  } finally {
    await sess.close();
  }
}

main().catch((e) => { console.error('[frick] FATAL:', e.message || e); process.exit(1); });
