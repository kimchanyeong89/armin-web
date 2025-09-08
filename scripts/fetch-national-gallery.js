#!/usr/bin/env node
/* Fetch National Gallery exhibitions and write to public/data/national-gallery-exhibitions.json
  Categories: permanent (core), special(current), upcoming, past
  Fields: id, name, title, description, startDate, endDate, image
*/
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';

const ROOT = 'https://www.nationalgallery.org.uk';
const LIST_URL = `${ROOT}/exhibitions`;

function norm(s) {
  if (!s) return '';
  return String(s).replace(/\s+/g, ' ').trim();
}

function absUrl(href) {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  return ROOT + (href.startsWith('/') ? href : `/${href}`);
}

async function main() {
  const res = await fetch(LIST_URL, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const result = { representativeImage: '', description: '', permanent: [], special: [], upcoming: [], past: [] };

  // Try to extract a page hero image as representative (fallback)
  const hero = $('meta[property="og:image"]').attr('content') || $('img[src*="/media/"]').first().attr('src');
  if (hero) result.representativeImage = absUrl(hero);
  result.description = norm($('meta[name="description"]').attr('content') || $('h1').text());

  function pushItem(arr, $card) {
    const title = norm($card.find('h3, h2, .card__title').first().text()) || norm($card.find('img').attr('alt'));
    const url = absUrl($card.find('a').attr('href'));
    let img = $card.find('img').attr('data-src') || $card.find('img').attr('src');
    img = img ? absUrl(img) : '';
    const dateText = norm($card.find('.card__dates, .date, .dates').text());
    let startDate = '', endDate = '';
    if (dateText) {
      const cleaned = dateText.replace(/\s+to\s+/i, ' - ').replace(/[–—]/g, '-').replace(/\u00a0/g, ' ').trim();
      const parts = cleaned.split(/\s*-\s*/);
      startDate = parts[0] || '';
      endDate = parts[1] || '';
    }
    arr.push({ id: url || title, name: title, title, description: '', startDate, endDate, image: img, url });
  }

  // Heuristic: sections or headings that denote categories
  const sections = $('main').find('section, div');
  sections.each((_, sec) => {
    const $sec = $(sec);
    const heading = norm($sec.find('h2, h3').first().text());
    if (!heading) return;
    let bucket = null;
    if (/permanent|collection/i.test(heading)) bucket = result.permanent;
    else if (/current|on now|now/i.test(heading)) bucket = result.special;
    else if (/upcoming|coming|future/i.test(heading)) bucket = result.upcoming;
    else if (/past|previous/i.test(heading)) bucket = result.past;
    if (!bucket) return;
    $sec.find('article, .card, li, a:has(img)').each((_, el) => pushItem(bucket, $(el)));
  });

  // Fallback: if buckets empty, collect generic cards
  if (result.special.length + result.upcoming.length + result.past.length === 0) {
    $('.card, article, li:has(img)').each((_, el) => pushItem(result.special, $(el)));
  }

  // Reclassify by parsed dates: move items into current(special), upcoming, past
  function toDate(s) {
    if (!s) return null;
    const t = s
      .replace(/(\d+)(st|nd|rd|th)/ig, '$1') // remove ordinals
      .replace(/\s+/g, ' ')
      .trim();
    const d = new Date(t);
    if (!isNaN(d.getTime())) return d;
    // Try adding current year if missing
    const year = new Date().getFullYear();
    const d2 = new Date(`${t} ${year}`);
    if (!isNaN(d2.getTime())) return d2;
    return null;
  }

  const today = new Date();
  const tmp = [...result.special, ...result.upcoming];
  const cur = [];
  const upc = [];
  const pst = [...result.past];
  for (const it of tmp) {
    const s = toDate(it.startDate);
    const e = toDate(it.endDate);
    if (e && e < today) { pst.push(it); continue; }
    if (s && s > today) { upc.push(it); continue; }
    cur.push(it);
  }
  // Deduplicate by id or title
  function dedupe(list) {
    const seen = new Set();
    const out = [];
    for (const x of list) {
      const key = x.id || x.title;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(x);
    }
    return out;
  }
  result.special = dedupe(cur);
  result.upcoming = dedupe(upc);
  result.past = dedupe(pst);

  // Enrich each item by fetching its detail page for better description and hero image
  async function enrichItem(item) {
    if (!item || !item.url) return item;
    try {
      const res = await fetch(item.url, { headers: { 'user-agent': 'Mozilla/5.0' } });
      if (!res.ok) return item;
      const html = await res.text();
      const $d = cheerio.load(html);
      const ogDesc = norm($d('meta[property="og:description"]').attr('content'));
      const metaDesc = norm($d('meta[name="description"]').attr('content'));
      const pageDesc = ogDesc || metaDesc || item.description || '';
      // Prefer og:image; fall back to first content image
      let hero = $d('meta[property="og:image"]').attr('content')
        || $d('img[src*="/media/"]').first().attr('src')
        || $d('img[data-src*="/media/"]').first().attr('data-src');
      if (hero) hero = absUrl(hero);

      // Try to extract start/end dates from JSON-LD first
      let startDate = item.startDate || '';
      let endDate = item.endDate || '';
      try {
        const scripts = $d('script[type="application/ld+json"]').toArray();
        for (const s of scripts) {
          const txt = $d(s).contents().text();
          if (!txt) continue;
          let parsed;
          try { parsed = JSON.parse(txt); } catch { continue; }
          const visit = (node) => {
            if (!node) return;
            if (Array.isArray(node)) { node.forEach(visit); return; }
            if (typeof node === 'object') {
              const t = (node['@type'] || node.type || '').toString().toLowerCase();
              const mayBeEvent = t.includes('event') || t.includes('exhibition');
              const s = node.startDate || node.start_time || node.start;
              const e = node.endDate || node.end_time || node.end;
              if (mayBeEvent || (s || e)) {
                if (s && !startDate) startDate = String(s);
                if (e && !endDate) endDate = String(e);
              }
              if (node['@graph']) visit(node['@graph']);
              if (node.mainEntity) visit(node.mainEntity);
              if (node.itemListElement) visit(node.itemListElement);
            }
          };
          visit(parsed);
          if (startDate || endDate) break;
        }
      } catch {}

      // Fallback: scrape date text from common containers and parse
      if (!startDate && !endDate) {
        const dateCandidates = [
          $d('.exhibition__dates').first().text(),
          $d('.exhibition-dates').first().text(),
          $d('.event__date').first().text(),
          $d('.dates').first().text(),
          $d('.date').first().text(),
          $d('[class*="date"]').first().text(),
        ].map(norm).filter(Boolean);
        const dateTextRaw = dateCandidates[0] || '';
        if (dateTextRaw) {
          const cleaned = dateTextRaw.replace(/\s+to\s+/i, ' - ').replace(/[–—]/g, '-').replace(/\u00a0/g, ' ').trim();
          const parts = cleaned.split(/\s*-\s*/);
          if (parts.length >= 2) {
            startDate = parts[0];
            endDate = parts[1];
          } else {
            // Single date: assign to start
            startDate = cleaned;
          }
        }
      }

      // Only overwrite when we found something meaningful
      if (pageDesc && pageDesc.length > 20) item.description = pageDesc;
      if (hero) item.image = hero;
      if (startDate) item.startDate = startDate;
      if (endDate) item.endDate = endDate;
    } catch {
      // ignore errors; keep existing
    }
    return item;
  }

  const limit = pLimit(5);
  const allLists = [result.special, result.upcoming, result.past];
  await Promise.all(allLists.map(async (list) => {
    const jobs = list.map((it) => limit(() => enrichItem(it)));
    await Promise.all(jobs);
  }));

  const outDir = path.join(process.cwd(), 'public', 'data');
  const outFile = path.join(outDir, 'national-gallery-exhibitions.json');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`Wrote ${outFile}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
