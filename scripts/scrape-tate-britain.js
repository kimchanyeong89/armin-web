#!/usr/bin/env node
/* Scrape Tate Britain exhibitions and write to public/data/tate-britain.json
   Output shape (for ExhibitionDetails ngOverride for Tate*):
   { description: string, items: Array<{ id, name, title, description, startDate, endDate, image, url }> }
*/
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';

const ROOT = 'https://www.tate.org.uk';
const CANDIDATE_LIST_URLS = [
  `${ROOT}/whats-on/tate-britain`,
  `${ROOT}/whats-on?venue=Tate%20Britain`,
  `${ROOT}/visit/tate-britain` // fallback to visit page if listings fail
];

function norm(s) {
  if (!s) return '';
  return String(s).replace(/\s+/g, ' ').trim();
}

function absUrl(href) {
  if (!href) return '';
  if (/^https?:/i.test(href)) return href;
  return ROOT + (href.startsWith('/') ? href : `/${href}`);
}

function pickImg($el) {
  let img = $el.attr('data-src') || $el.attr('data-original') || $el.attr('src') || $el.attr('srcset') || '';
  if (img && /\s/.test(img) && /\s+\d+w/.test(img)) {
    // srcset -> take the last (largest)
    const parts = img.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length) img = parts[parts.length - 1].split(' ')[0];
  }
  return absUrl(img);
}

async function tryFetchText(url) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

async function fetchFirstGoodListing() {
  for (const url of CANDIDATE_LIST_URLS) {
    const html = await tryFetchText(url);
    if (!html) continue;
    const $ = cheerio.load(html);
    // Heuristic: page must contain multiple cards linking to /whats-on/ entries under Tate Britain
    const cards = $('a:has(img), article:has(img), .card');
    if (cards.length >= 3) {
      return { url, html, $ };
    }
  }
  throw new Error('No suitable Tate Britain listings page found');
}

function parseDateText($, scope) {
  const txt = [
    $('.exhibition__dates', scope).first().text(),
    $('.exhibition-dates', scope).first().text(),
    $('.event__date', scope).first().text(),
    $('.dates', scope).first().text(),
    $('.date', scope).first().text(),
    $('[class*="date"]', scope).first().text()
  ].map(norm).find(Boolean) || '';
  if (!txt) return { startDate: '', endDate: '' };
  const cleaned = txt.replace(/\s+to\s+/i, ' - ').replace(/[–—]/g, '-').replace(/\u00a0/g, ' ').trim();
  const parts = cleaned.split(/\s*-\s*/);
  return { startDate: parts[0] || '', endDate: parts[1] || '' };
}

async function enrichItem(item) {
  if (!item || !item.url) return item;
  try {
    const res = await fetch(item.url, { headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!res.ok) return item;
    const html = await res.text();
    const $ = cheerio.load(html);
    const ogDesc = norm($('meta[property="og:description"]').attr('content'));
    const metaDesc = norm($('meta[name="description"]').attr('content'));
    const desc = ogDesc || metaDesc || '';
    if (desc && desc.length > 20) item.description = desc;
    let hero = $('meta[property="og:image"]').attr('content') || pickImg($('img').first());
    if (hero) item.image = absUrl(hero);
    // JSON-LD dates
    try {
      const scripts = $('script[type="application/ld+json"]').toArray();
      let startDate = item.startDate, endDate = item.endDate;
      for (const s of scripts) {
        const txt = $(s).contents().text();
        if (!txt) continue;
        let parsed; try { parsed = JSON.parse(txt); } catch { continue; }
        const visit = (node) => {
          if (!node) return;
          if (Array.isArray(node)) return node.forEach(visit);
          if (typeof node === 'object') {
            const t = String(node['@type'] || node.type || '').toLowerCase();
            const likely = t.includes('event') || t.includes('exhibition') || t.includes('visualarts');
            const sdt = node.startDate || node.start_time || node.start;
            const edt = node.endDate || node.end_time || node.end;
            if (likely || (sdt || edt)) {
              if (sdt && !startDate) startDate = String(sdt);
              if (edt && !endDate) endDate = String(edt);
            }
            if (node['@graph']) visit(node['@graph']);
            if (node.mainEntity) visit(node.mainEntity);
            if (node.itemListElement) visit(node.itemListElement);
          }
        };
        visit(parsed);
      }
      if (startDate) item.startDate = startDate;
      if (endDate) item.endDate = endDate;
    } catch {}
  } catch {}
  return item;
}

async function ensureBuildingImage() {
  const outDir = path.join(process.cwd(), 'public', 'images');
  const out = path.join(outDir, 'tate-britain-building.jpg');
  try {
    const st = fs.statSync(out);
    if (st.size > 40_000) return; // already good enough
  } catch {}
  fs.mkdirSync(outDir, { recursive: true });
  const src = 'https://commons.wikimedia.org/wiki/Special:FilePath/Tate_Britain_art_museum,_London,_England_(U.K.)_(53337196625).jpg?width=1600';
  const res = await fetch(src, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (res.ok) {
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(out, buf);
    console.log(`Downloaded building -> ${out} (${buf.length} bytes)`);
  }
}

async function main() {
  // 1) Ensure building image
  await ensureBuildingImage();

  // 2) Find a listings page and parse items
  const { url, html, $ } = await fetchFirstGoodListing();
  const pageDesc = norm($('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || $('h1').text() || 'Tate Britain exhibitions');

  const items = [];
  const seen = new Set();
  const push = (it) => {
    const key = it.url || it.title;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(it);
  };
  const pushFromCard = (card) => {
    const $c = $(card);
    const a = $c.is('a') ? $c : $c.find('a').first();
    const href = absUrl(a.attr('href'));
    if (!href || !/\/whats-on\/tate-britain\//i.test(href)) return; // keep only Tate Britain pages
    const title = norm($c.find('h3, h2, .card__title, .promo__title, .teaser__title').first().text()) || norm($c.find('img').attr('alt'));
    const img = pickImg($c.find('img').first());
    const { startDate, endDate } = parseDateText($, $c);
    push({ id: href, name: title, title, description: '', startDate, endDate, image: img, url: href });
  };

  $('article, .card, li:has(img), a:has(img)').each((_, el) => pushFromCard(el));
  if (items.length < 3) {
    // generic fallback
    $('a[href*="/whats-on/tate-britain/"]').each((_, el) => pushFromCard(el));
  }

  // 3) Enrich items (concurrency limited)
  const limit = pLimit(6);
  await Promise.all(items.map((it, idx) => limit(() => enrichItem(it))));

  // 4) Reclassify current/upcoming/past by parsed dates (optional; ExhibitionDetails only needs items)
  // Keep as-is; the panel will classify by date client-side.

  // 5) Write output
  const outDir = path.join(process.cwd(), 'public', 'data');
  const outFile = path.join(outDir, 'tate-britain.json');
  fs.mkdirSync(outDir, { recursive: true });
  const out = { description: pageDesc, items };
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf-8');
  console.log(`Wrote ${outFile} with ${items.length} items from ${url}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
