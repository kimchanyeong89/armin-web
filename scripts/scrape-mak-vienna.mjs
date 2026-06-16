#!/usr/bin/env node
// MAK — Museum für angewandte Kunst (Vienna) — flat-works scraper.
//
// Source (museum-own, no auth):
//   Search API : https://api.sammlung.mak.at/web-api/search?q=*&start=N&rows=50&random=false
//                  &filter_fields=object_name_all_de-DE:{type}&filter_fields=has_reproduction_public:true
//                  (Solr-backed; rows hard-capped at 50; deep paging OK; facets respect filters;
//                   sort param is IGNORED by the API — verified asc==desc)
//   Detail page: https://sammlung.mak.at/en/collect/collect_{id_original}  (301 → slug URL)
//                  WP HTML with <div class="detail-label">…</div><ul class="detail-content">…</ul>
//                  blocks: Title / Production (roles+date) / Material | Technique / Measurements /
//                  Inventory number / Department / Collection
//   Images     : https://mak-media.azureedge.net/{xl|l|s}/{hash}.jpg  (xl ≈ 2560px long side)
//
// SCOPE: FLAT works only. Total in-scope union (with public images) ≈ 140k — far over the 24k JSON
// cap, so we collect by VALUE TIERS (museum's own facets; documented, not arbitrary top-N):
//   T1 poster  — Plakat, ALL (≈7.7k; the MAK poster collection is a core holding)
//   T2 drawing — Zeichnung, creator-prioritized (named designers via creator facet, count-desc:
//                Wiener Werkstätte, Hoffmann, Moser, Peche, Praun …), cap 6,000
//   T3 gdesign — Gebrauchsgrafik (graphic design), creator-prioritized, cap 3,500
//   T4 print   — Druckgrafik, creator-prioritized, cap 3,500 (colour-gated: B&W reproductive
//                prints skipped at download via colorfulness<20 — ONLY this category)
//   T5 photo   — Fotografie, creator-prioritized, cap 3,000
// Anonymous-only records (no named creator in any role) are dropped (min-4 artist rule).
// Posters keep named printing plants / executors as legit attribution when no designer is named.
// CATEGORY NOTE: posters use category "poster" (not "print").
//
// Usage:
//   node scripts/scrape-mak-vienna.mjs --probe   # ~15 works end-to-end (separate probe JSON, no state)
//   node scripts/scrape-mak-vienna.mjs --full    # tiered scrape, resumable
//
// State: scripts/.state/mak-vienna-progress.json | failures: scripts/.state/mak-vienna-failed.ndjson
// Out  : public/data/mak-vienna-collection.json (probe: …-collection-probe.json)

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

// api.sammlung.mak.at serves an incomplete TLS chain (missing Let's Encrypt "YE2" intermediate);
// system curl builds it via AIA, Node cannot. Process-scoped opt-out (repo precedent: scrape-hermitage.cjs).
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const SLUG = 'mak-vienna';
const STEM = `${SLUG}-collection`;
const API = 'https://api.sammlung.mak.at/web-api/search';
const SITE = 'https://sammlung.mak.at';
const UA = 'armin-museum-research/1.0';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--probe') ? 'probe' : null;
if (!MODE) { console.log('usage: node scripts/scrape-mak-vienna.mjs --probe | --full'); process.exit(1); }

const GLOBAL_CAP = 24000;
const TIERS = MODE === 'probe'
  ? [
      { type: 'Plakat', cap: 6, creatorMode: false },
      { type: 'Zeichnung', cap: 4, creatorMode: true },
      { type: 'Gebrauchsgrafik', cap: 2, creatorMode: true },
      { type: 'Druckgrafik', cap: 2, creatorMode: true },
      { type: 'Fotografie', cap: 1, creatorMode: true },
    ]
  : [
      { type: 'Plakat', cap: Infinity, creatorMode: false },
      { type: 'Zeichnung', cap: 6000, creatorMode: true },
      { type: 'Gebrauchsgrafik', cap: 3500, creatorMode: true },
      { type: 'Druckgrafik', cap: 3500, creatorMode: true },
      { type: 'Fotografie', cap: 3000, creatorMode: true },
    ];

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const stripTags = (h) => (h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const decodeEntities = (s) => (s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();

// ---------- HTTP ----------
async function getJSON(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { if (att === 3) throw e; await sleep(800 * att); }
  }
}
async function getHTML(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return { html: await r.text(), finalUrl: r.url };
    } catch (e) { if (att === 3) throw e; await sleep(800 * att); }
  }
}

// ---------- search enumeration ----------
function searchUrl({ type, creator, start, rows, facet }) {
  const p = new URLSearchParams();
  p.set('q', '*'); p.set('start', String(start)); p.set('rows', String(rows));
  p.set('facet', facet ? 'true' : 'false'); p.set('random', 'false');
  p.append('filter_fields', `object_name_all_de-DE:${type}`);
  p.append('filter_fields', 'has_reproduction_public:true');
  if (creator) p.append('filter_fields', `creator:${creator}`);
  return `${API}?${p.toString()}`;
}

async function* enumerateDocs(type, creator) {
  let start = 0;
  while (true) {
    const d = await getJSON(searchUrl({ type, creator, start, rows: 50, facet: false }));
    const docs = d.response?.docs || [];
    for (const doc of docs) yield doc;
    start += 50;
    if (start >= (d.response?.numFound || 0) || docs.length === 0) return;
    await sleep(280);
  }
}

async function topCreators(type) {
  const d = await getJSON(searchUrl({ type, start: 0, rows: 0, facet: true }));
  return (d.facets?.creator?.buckets || [])
    .map((b) => b.val)
    .filter((v) => !/^anonym/i.test(v));
}

// ---------- category from object_name list (precedence; posters → "poster") ----------
function categorize(names) {
  const j = (names || []).join(' | ').toLowerCase();
  if (/plakat/.test(j)) return 'poster';
  if (/fotografie|photographie|lichtbild/.test(j)) return 'photograph';
  if (/zeichnung|entwurf|aquarell|pastell|skizze/.test(j)) return 'drawing';
  if (/druckgrafik|grafik|reproduktionstechnik|druck/.test(j)) return 'print';
  return null;
}

// ---------- detail page parsing ----------
const PREFERRED_ROLE = /design|entwurf|artist|draughts|drawing|painter|maler|photograph|fotograf|architect|author|graphic|künstler|zeichner/i;
const YEAR_RE = /\b(1[0-9]{3}|20[0-2][0-9])\b/g;
const DATE_RE = /(?:(?:um|ca\.?|circa|around|about|vor|nach|before|after)\s*)?\b(?:1[0-9]{3}|20[0-2][0-9])(?:\s*[–\-\/]\s*\d{2,4})?/i;

function parseDetail(html) {
  const blocks = {};
  const re = /<div class="detail">\s*<div class="detail-label">\s*([^<]{2,40}?)\s*<\/div>\s*<ul class="detail-content[^"]*">([\s\S]*?)<\/ul>/g;
  let m;
  while ((m = re.exec(html))) blocks[m[1].trim()] = m[2];

  const liOf = (block) => (block || '').split(/<li[^>]*>/).slice(1).map((x) => x.split('</li>')[0]);

  // Production: li = "role: <a href=…/artist/…>Name</a>[, Place][, date]"
  const preferred = [], fallback = [];
  let dateStr = '', years = [];
  for (const li of liOf(blocks['Production'])) {
    const text = decodeEntities(stripTags(li));
    const colon = text.indexOf(':');
    if (colon < 0) continue;
    const role = text.slice(0, colon).trim();
    const nameLink = li.match(/<a[^>]*\/artist\/[^>]*>([\s\S]*?)<\/a>/);
    const name = decodeEntities(stripTags(nameLink ? nameLink[1] : text.slice(colon + 1).split(',')[0]));
    for (const y of text.matchAll(YEAR_RE)) years.push(parseInt(y[1], 10));
    if (!dateStr) { const dm = text.slice(colon + 1).match(DATE_RE); if (dm) dateStr = dm[0].trim(); }
    if (!name || /^anonym/i.test(name)) continue;
    (PREFERRED_ROLE.test(role) ? preferred : fallback).push(name);
  }
  // Dating block fallback (rare)
  for (const key of ['Dating', 'Date']) {
    const t = decodeEntities(stripTags(blocks[key] || ''));
    if (t) { for (const y of t.matchAll(YEAR_RE)) years.push(parseInt(y[1], 10)); if (!dateStr) { const dm = t.match(DATE_RE); if (dm) dateStr = dm[0].trim(); } }
  }

  const uniq = (a) => [...new Set(a)];
  const artist = uniq(preferred).join('; ') || uniq(fallback).join('; ');
  const year = years.length ? Math.min(...years) : null;
  // li texts carry trailing " ," separators and repeated materials — strip and dedupe
  const medium = [...new Set(liOf(blocks['Material | Technique'])
    .map((x) => decodeEntities(stripTags(x)).replace(/^[,\s]+|[,\s]+$/g, ''))
    .filter(Boolean))].join(', ');
  const dimensions = liOf(blocks['Measurements']).map((x) => decodeEntities(stripTags(x))).filter(Boolean).join('; ');
  const titleDetail = decodeEntities(stripTags(liOf(blocks['Title'])[0] || ''))
    .replace(/\s*\((Kurztitel|Werktitel|Sachtitel|Originaltitel|short title|work title)\)\s*$/i, '');
  const department = decodeEntities(stripTags(liOf(blocks['Department'])[0] || ''));
  const collection = decodeEntities(stripTags(liOf(blocks['Collection'])[0] || ''));
  return { artist, year, dateStr, medium, dimensions, titleDetail, department, collection };
}

// portrait-locket miniature guard (guide §1): ivory/enamel/vellum paint-led AND ≤14cm
function isLocketMiniature(medium, dimensions) {
  if (!/ivory|elfenbein|enamel|email\b|vellum|pergament/i.test(medium || '')) return false;
  const cms = [...(dimensions || '').matchAll(/([\d.]+)\s*cm/g)].map((m) => parseFloat(m[1]));
  return cms.length > 0 && Math.max(...cms) <= 14;
}

// Hasler-Süsstrunk colorfulness (from scripts/audit/curate-grayscale-prints.mjs) on a buffer
async function colorfulness(buf) {
  const { data } = await sharp(buf, { limitInputPixels: false }).resize(80, 80, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rg = [], yb = [];
  for (let i = 0; i < data.length; i += 3) { const R = data[i], G = data[i + 1], B = data[i + 2]; rg.push(R - G); yb.push(0.5 * (R + G) - B); }
  const m = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => { const mu = m(a); return Math.sqrt(m(a.map((v) => (v - mu) ** 2))); };
  return Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(m(rg) ** 2 + m(yb) ** 2);
}

// ---------- image pipeline ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) { if (att === 3) throw e; await sleep(700 * att); }
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

// ---------- state ----------
function loadState() {
  if (MODE === 'probe' || !fs.existsSync(PROGRESS)) return { done: {}, artworks: [] };
  try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { return { done: {}, artworks: [] }; }
}
let saveTick = 0;
function saveState(state, force = false) {
  if (MODE === 'probe') return;
  if (!force && ++saveTick % 20 !== 0) return;
  fs.writeFileSync(PROGRESS, JSON.stringify(state));
}

// ---------- per-work processing ----------
async function processDoc(doc, state, counts) {
  const idO = String(doc.id_original);
  const category = categorize(doc['object_name_all_de-DE']);
  if (!category) { state.done[idO] = 'skip:cat'; counts.skipCat++; return; }

  const imgs = doc.reproduction_public_img_url || [];
  const imgUrl = imgs[0]?.xl || imgs[0]?.l;
  if (!imgUrl) { state.done[idO] = 'skip:noimg'; counts.skipNoImg++; return; }

  const { html, finalUrl } = await getHTML(`${SITE}/en/collect/collect_${idO}`);
  await sleep(280);
  const det = parseDetail(html);

  const title = decodeEntities((doc['title_en-US'] || [])[0] || (doc['title_de-DE'] || [])[0] || '') || det.titleDetail;
  const artist = det.artist;
  const year = det.year;
  if (!title || !artist || year == null) { state.done[idO] = 'skip:min4'; counts.skipMin4++; return; }
  if (isLocketMiniature(det.medium, det.dimensions)) { state.done[idO] = 'skip:miniature'; counts.skipMini++; return; }

  const buf = await dl(imgUrl);
  await sleep(280);
  const meta = await sharp(buf).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) { state.done[idO] = 'skip:small'; counts.skipSmall++; return; }
  if (category === 'print') {                       // colour gate — prints ONLY (never poster/drawing/photo)
    const c = await colorfulness(buf);
    if (c < 20) { state.done[idO] = 'skip:grayscale-print'; counts.skipGray++; return; }
  }

  const { buffer } = await autocropToWebp(buf);     // default: webp convert only, no trim
  const id = `${SLUG}-${idO}`;
  const key = `artworks/${STEM}/${id}-${sha(imgUrl).slice(0, 8)}-imageUrl.webp`;
  await uploadR2(key, buffer);

  state.artworks.push({
    id,
    objectNumber: doc.object_number || '',
    title,
    artist,
    date: det.dateStr || String(year),
    year,
    medium: det.medium || '',
    dimensions: det.dimensions || '',
    category,
    description: '',
    imageUrl: `${R2_PUBLIC}/${key}`,
    thumbnailUrl: imgs[0]?.s || imgUrl,
    onDisplay: !!doc.on_display,
    displayLocation: '',
    sourceUrl: finalUrl || `${SITE}/en/collect/collect_${idO}`,
    metadata: { department: det.department, mak_collection: det.collection, id_original: idO },
    original_imageUrl: imgUrl,
  });
  state.done[idO] = 'ok';
  counts.ok++;
}

// ---------- output ----------
function writeCollection(artworks) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'MAK – Museum für angewandte Kunst',
    collection: 'Collection',
    website: 'https://sammlung.mak.at/en/',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'api',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', MODE === 'probe' ? `${STEM}-probe.json` : `${STEM}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`[write] ${out} (${artworks.length} works)`, cats);
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const state = loadState();
  const counts = { ok: 0, skipCat: 0, skipNoImg: 0, skipMin4: 0, skipMini: 0, skipSmall: 0, skipGray: 0, err: 0 };
  const okTotal = () => state.artworks.length;
  console.log(`[${MODE}] resume: ${Object.keys(state.done).length} ids done, ${okTotal()} collected`);

  for (const tier of TIERS) {
    if (okTotal() >= GLOBAL_CAP) break;
    const tierStart = okTotal();
    const tierOk = () => okTotal() - tierStart;
    console.log(`\n[tier ${tier.type}] cap=${tier.cap} creatorMode=${tier.creatorMode}`);

    const creatorList = tier.creatorMode ? await topCreators(tier.type) : [null];
    if (tier.creatorMode) console.log(`  creators (top, named): ${creatorList.slice(0, 8).join(' · ')} …(${creatorList.length})`);

    outer:
    for (const creator of creatorList) {
      for await (const doc of enumerateDocs(tier.type, creator)) {
        if (tierOk() >= tier.cap || okTotal() >= GLOBAL_CAP) break outer;
        const idO = String(doc.id_original || '');
        if (!idO || state.done[idO]) continue;       // dedupe across tiers/creators + resume
        try {
          await processDoc(doc, state, counts);
        } catch (e) {
          counts.err++;
          state.done[idO] = 'err';
          fs.appendFileSync(FAILED, JSON.stringify({ id: idO, err: String(e.message || e) }) + '\n');
          if (counts.err <= 8) console.log(`  [err] ${idO}: ${e.message}`);
        }
        saveState(state);
        if ((counts.ok + counts.err) % 100 === 0 && counts.ok > 0)
          console.log(`  …ok=${counts.ok} err=${counts.err} skips(min4=${counts.skipMin4} gray=${counts.skipGray} noimg=${counts.skipNoImg})`);
      }
      if (creator) await sleep(280);
    }
    console.log(`[tier ${tier.type}] collected ${tierOk()}`);
  }

  saveState(state, true);
  writeCollection(state.artworks);
  console.log(`\n[${MODE}] DONE`, counts);
}

main().catch((e) => { console.error(e); process.exit(1); });
