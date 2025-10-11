#!/usr/bin/env node
/* Scrape Tate artworks search listing and individual artwork metadata/images.
   Source list: htt    //     // Try to extract artist from og:title meta tag first (format: 'Title', Artist, Year | Tate)
    const ogTitle = $('meta[property="og:title"]').attr('content');
    if (ogTitle) {
      const titleMatch = ogTitle.match(/^[''""](.+?)[''""],\s*(.+?),\s*\d{4}/);
      if (titleMatch && titleMatch[2]) {
        artist = cleanField(titleMatch[2]);
      }
    }tist from og:title meta tag first (format: 'Title', Artist, Year | Tate)
    const ogTitle = $('meta[property="og:title"]').attr('content');
    if (ogTitle) {
      const titleMatch = ogTitle.match(/^[''""](.+?)[''""],\s*(.+?),\s*\d{4}/);
      if (titleMatch && titleMatch[2]) {
        artist = cleanField(titleMatch[2]);
      }
    }.uk/search?gallery=all_tate_galleries&ka=1&q=&type=artwork
   Output: public/data/tate-artworks.json
   For each artwork: { id, url, title, artist, dateText, medium, dimensions, credit, accession, image, tags[], scrapedAt }
   Also writes image URLs unchanged (separate mirroring step can be added if needed).
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pLimit from 'p-limit';
import { load as cheerioLoad } from 'cheerio';
import got from 'got';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = 'https://www.tate.org.uk';
const START_URL = 'https://www.tate.org.uk/search?gallery=all_tate_galleries&ka=1&q=&type=artwork';

const MAX_LIST_PAGES = 70; // increased to get all pages
const CONCURRENCY = parseInt(process.env.TATE_ARTWORK_CONCURRENCY || '4', 10);

function norm(s) {
  if (!s) return '';
  return String(s).replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
}
function absUrl(href) {
  if (!href) return '';
  if (/^https?:/i.test(href)) return href;
  return ROOT + (href.startsWith('/') ? href : `/${href}`);
}

async function fetchHtml(url) {
  const res = await got(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    },
    timeout: { request: 30000 },
    retry: { limit: 2 }
  });
  return res.body;
}

async function collectListPage(pageUrl, seen) {
  try {
    const html = await fetchHtml(pageUrl);
    const $ = cheerioLoad(html);
    const out = [];
    // Artwork links look like /art/artworks/<slug-or-code>
    $('a[href*="/art/artworks/"]').each((_, a) => {
      const href = $(a).attr('href');
      if (!href) return;
      const abs = absUrl(href.split('?')[0]);
      if (!/\/art\/artworks\//i.test(abs)) return;
      // avoid variant anchors with trailing fragments
      const id = abs.toLowerCase();
      if (seen.has(id)) return;
      seen.add(id);
      // Try to get a title from nearest heading or image alt
      const container = $(a).closest('article, li, div');
      let title = norm(container.find('h3, h2').first().text()) || norm($(a).text());
      if (!title) {
        const alt = container.find('img').attr('alt');
        if (alt) title = norm(alt);
      }
      // Representative thumb
      const imgEl = container.find('img').first();
      let thumb = imgEl.attr('src') || imgEl.attr('data-src') || '';
      if (thumb) thumb = absUrl(thumb);
      out.push({ id, url: abs, title, thumb });
    });
    return out;
  } catch (e) {
    console.warn('List page failed', pageUrl, e.message);
    return [];
  }
}

function parseKeyValueBlock($, sel) {
  const data = {};
  $(sel).find('dt, .label').each((_, el) => {
    const key = norm($(el).text()).replace(/:$/, '').toLowerCase();
    if (!key) return;
    const dd = $(el).next('dd');
    if (dd.length) {
      data[key] = norm(dd.text());
    }
  });
  return data;
}

function cleanField(val) {
  if (!val) return '';
  let s = String(val).trim();
  // Remove navigation / boilerplate markers
  const cutMarks = ['Skip navigation', 'Main menu', 'Join inTwitter', '© The Board of Trustees'];
  for (const mark of cutMarks) {
    const idx = s.indexOf(mark);
    if (idx > 120 && s.length - idx > 50) { // ensure we're not cutting legitimate short strings
      s = s.slice(0, idx).trim();
    }
  }
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  // Truncate pathological long values
  if (s.length > 500) s = s.slice(0, 500).trim();
  return s;
}

async function enrichArtwork(entry) {
  try {
    const html = await fetchHtml(entry.url);
    const $ = cheerioLoad(html);
    // Primary title override
    const title = cleanField($('h1').first().text()) || entry.title;
    // Artist (may be multiple links)
    let artist = '';
    // Try to extract artist from og:title meta tag first (format: 'Title', Artist, Year | Tate)
    const ogTitle = $('meta[property="og:title"]').attr('content');
    if (ogTitle) {
      const titleMatch = ogTitle.match(/^[\u2018\u2019"](.+?)[\u2018\u2019"],\s*(.+?),\s*\d{4}/);
      if (titleMatch && titleMatch[2]) {
        artist = cleanField(titleMatch[2]);
      }
    }
    // Fallback to page content if og:title didn't work
    if (!artist) {
      artist = cleanField(
        $('[class*="artist" i], .artist').first().text()
        || $('a[href*="/art/artists/"]').first().text()
      );
    }
    // Date text: try multiple sources
    let dateText = '';
    // Try og:title meta tag first (often contains year)
    if (ogTitle) {
      const yearMatch = ogTitle.match(/, (\d{4}(?:, remade \d{4})?)/);
      if (yearMatch) dateText = yearMatch[1];
    }
    // Try specific date span
    if (!dateText) {
      dateText = $('.card__when--artwork-date').first().text().trim();
    }
    // Try JSON-LD dateCreated
    if (!dateText) {
      $('script[type="application/ld+json"]').each((_, script) => {
        try {
          const json = JSON.parse($(script).html());
          const item = Array.isArray(json) ? json[0] : json;
          if (item['@type'] === 'CreativeWork' || item['@type'] === 'Painting' || item['@type'] === 'Artwork') {
            if (item.dateCreated) dateText = item.dateCreated;
          }
        } catch {}
      });
    }
    // Initialize variables
    let medium = '';
    let dimensions = '';
    let credit = '';
    let accession = '';
    // Dedicated labelled fields
    const kvSelectors = ['.artwork__facts', '.facts', '.artwork-facts'];
    for (const sel of kvSelectors) {
      if ($(sel).length) {
        const block = parseKeyValueBlock($, sel);
        medium = medium || block.medium || block['medium'] || '';
        dimensions = dimensions || block.dimensions || block['dimensions'] || '';
        credit = credit || block.credit || block['credit line'] || '';
        accession = accession || block.accession || block['accession number'] || '';
      }
    }
    // Fallback heuristics
    // Fallback: attempt label-value pattern scanning (restrict search space)
    const labelSelectors = ['Medium', 'Dimensions', 'Credit', 'Credit line', 'Accession'];
    $('body *').each((_, el) => {
      const txt = norm($(el).text());
      if (!txt || txt.length > 60) return; // ignore large blocks
      const lower = txt.toLowerCase();
      if (!medium && /medium/.test(lower)) {
        const v = norm($(el).next().text());
        if (v) medium = v;
      }
      if (!dimensions && /dimensions/.test(lower)) {
        const v = norm($(el).next().text());
        if (v) dimensions = v;
      }
      if (!credit && /credit/.test(lower)) {
        const v = norm($(el).next().text());
        if (v) credit = v;
      }
      if (!accession && /accession/.test(lower)) {
        const v = norm($(el).next().text());
        if (v) accession = v;
      }
    });

    // Try JSON-LD for structured data (only if og:title didn't provide artist)
    if (!artist) {
      $('script[type="application/ld+json"]').each((_, script) => {
        try {
          const json = JSON.parse($(script).html());
          const item = Array.isArray(json) ? json[0] : json;
          if (item['@type'] === 'CreativeWork' || item['@type'] === 'Painting' || item['@type'] === 'Artwork') {
            artist = artist || item.creator?.name || item.author?.name || '';
            dateText = dateText || item.dateCreated || item.datePublished || '';
            medium = medium || item.material || item.medium || '';
            dimensions = dimensions || item.dimensions || '';
            credit = credit || item.creditText || '';
            accession = accession || item.identifier || '';
          }
        } catch {}
      });
    }

    // Main image: og:image or first prominent <img>
    let image = $('meta[property="og:image"]').attr('content')
      || $('figure img').first().attr('src')
      || $('img[data-src]').first().attr('data-src')
      || entry.thumb;
    if (image) image = absUrl(image);

    // Tags: look for keyword/tag list
    const tags = [];
    $('[class*="tag" i] a, .tags a').each((_, a) => {
      const t = norm($(a).text());
      if (t && !tags.includes(t)) tags.push(t);
    });

    return {
      ...entry,
      title: cleanField(title),
      artist: cleanField(artist),
      dateText: cleanField(dateText),
      medium: cleanField(medium),
      dimensions: cleanField(dimensions),
      credit: cleanField(credit),
      accession: cleanField(accession),
      image,
      tags
    };
  } catch (e) {
    console.warn('Detail failed', entry.url, e.message);
    return { ...entry, error: e.message };
  }
}

async function main() {
  console.log('Scraping Tate artworks...');
  const seen = new Set();
  const listEntries = [];
  for (let page = 1; page <= MAX_LIST_PAGES; page++) {
    const url = page === 1 ? START_URL : `${START_URL}&page=${page}`;
    const pageItems = await collectListPage(url, seen);
    if (!pageItems.length) {
      if (page === 1) continue; // maybe dynamic load; attempt next
      break; // stop early if a later page empty
    }
    listEntries.push(...pageItems);
    console.log(`Page ${page}: +${pageItems.length} (total ${listEntries.length})`);
    // Only break if no items found at all (not just fewer than 5)
    if (pageItems.length === 0) {
      if (page === 1) continue; // maybe dynamic load; attempt next
      break; // stop early if a later page empty
    }
  }

  // Enrich
  const limit = pLimit(CONCURRENCY);
  const enriched = await Promise.all(listEntries.map(e => limit(() => enrichArtwork(e))));

  const out = {
    scrapedAt: new Date().toISOString(),
    source: START_URL,
    total: enriched.length,
    items: enriched
  };

  const outDir = path.join(process.cwd(), 'public', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'tate-artworks.json');
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(`Wrote ${out.items.length} artworks -> ${path.relative(process.cwd(), outFile)}`);
}

main().catch(err => { console.error(err); process.exit(1); });
