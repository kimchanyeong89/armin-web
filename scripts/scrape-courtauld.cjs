#!/usr/bin/env node
/* Scrape Courtauld Gallery Collection - THES100018 category (paintings/drawings/prints/sculpture)
   Source: https://gallerycollections.courtauld.ac.uk/collections/THES100018
   Output: public/data/courtauld-gallery-collection.json
   Includes full metadata from detail pages: medium, dimensions, accession, category
*/
const fs = require('fs');
const path = require('path');

let got;
let pLimit;
let cheerio;

const BASE = 'https://gallerycollections.courtauld.ac.uk';
const CATEGORY = 'THES100018';
const OUT = path.join(__dirname, '../public/data/courtauld-gallery-collection.json');
const PER_PAGE = 50;
const MAX_PAGES = 20;
const CONCURRENCY = 4;

async function fetchHtml(url, opts = {}) {
  if (!got) got = (await import('got')).default;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': BASE + '/',
    ...opts.headers
  };
  const res = await got(url, {
    headers,
    followRedirect: true,
    timeout: { request: 30000 },
    retry: { limit: 3 },
  });
  return res.body;
}

function norm(s) {
  if (!s) return '';
  return s.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
}

function getSession(html) {
  const m = html.match(/name="col_session"\s+value="([^"]+)"/);
  return m ? m[1] : null;
}

function inferCategory(url) {
  const seg = url.replace(BASE, '').toLowerCase();
  if (seg.startsWith('/object-p-')) return 'Paintings';
  if (seg.startsWith('/object-d-')) return 'Drawings';
  if (seg.startsWith('/object-s-')) return 'Sculpture';
  if (seg.startsWith('/object-g-') || seg.startsWith('/object-pr-')) return 'Prints';
  return '';
}

function inferCategoryFromAccession(accession) {
  if (!accession) return '';
  const upper = accession.toUpperCase();
  if (upper.startsWith('P.')) return 'Paintings';
  if (upper.startsWith('D.')) return 'Drawings';
  if (upper.startsWith('S.')) return 'Sculpture';
  if (upper.startsWith('G.') || upper.startsWith('PR.')) return 'Prints';
  return '';
}

function parseItems(html) {
  const items = [];
  const cardRe = /<section[^>]*class="card summary-box"[^>]*>([\s\S]*?)<\/section>/g;
  let m;
  while ((m = cardRe.exec(html)) !== null) {
    const card = m[1];
    const urlM = card.match(/href="(\/object-[^"]+)"/);
    const imgM = card.match(/src="(https:\/\/gallerycollections[^"]+)"/);
    const artistM = card.match(/<h2[^>]*>([^<]+)<\/h2>/);
    const titleM = card.match(/class="card-summary-text"[^>]+title="([^"]+)"/);
    const dateM = card.match(/<span\s+title="(\d{4}[^"]*)">\d/);

    if (!urlM) continue;

    const rawImg = imgM ? imgM[1] : '';
    const image = rawImg.replace(/v0_webgrid\.jpg/, 'v0_web.jpg').replace(/\?_m=\d+/, '');
    const itemUrl = BASE + urlM[1];

    items.push({
      id: urlM[1].replace(/^\//, '').replace(/[^a-zA-Z0-9-_]/g, '-'),
      url: itemUrl,
      title: titleM ? titleM[1].trim() : '',
      artist: artistM ? artistM[1].trim() : '',
      date: dateM ? dateM[1].trim() : '',
      image,
      medium: '',
      dimensions: '',
      accession: '',
      category: inferCategory(itemUrl),
    });
  }
  return items;
}

async function fetchDetailMetadata(item) {
  try {
    const html = await fetchHtml(item.url);
    if (!cheerio) cheerio = require('cheerio');
    const $ = cheerio.load(html);

    const fields = {};
    $('h2.full_record_data_caption').each((_, h2) => {
      const label = norm($(h2).text()).toLowerCase();
      const valueEl = $(h2).next('div.full_record_data_value');
      valueEl.find('br').replaceWith(' ');
      const value = norm(valueEl.text());
      fields[label] = value;
    });

    const medium = fields['medium'] || '';
    const dimensions = fields['dimensions'] || '';
    const accession = fields['accession number'] || '';
    let category = item.category;
    if (!category && accession) {
      category = inferCategoryFromAccession(accession);
    }

    return { ...item, medium, dimensions, accession, category };
  } catch (e) {
    console.error(`  Error fetching detail ${item.url}:`, e.message);
    return item;
  }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  cheerio = require('cheerio');
  pLimit = (await import('p-limit')).default;

  console.log('Fetching session from', BASE + '/collections/' + CATEGORY);
  const homePage = await fetchHtml(BASE + '/collections/' + CATEGORY);
  const session = getSession(homePage);
  console.log('Session:', session);

  // Step 1: Collect all list pages
  let allItems = [];
  let page = 1;
  while (page <= MAX_PAGES) {
    const url = `${BASE}/results?col_session=${session}&search=1&page=${page}&per_page=${PER_PAGE}&parent=${CATEGORY}&mi_search_type=collection&sort=1`;
    console.log(`  List page ${page}...`);
    const html = await fetchHtml(url);
    const items = parseItems(html);
    console.log(`  → ${items.length} items`);
    if (items.length === 0) break;
    allItems = allItems.concat(items);
    page++;
    if (items.length < PER_PAGE) break;
    await sleep(300);
  }

  console.log(`\nTotal items from list pages: ${allItems.length}`);
  console.log('Fetching detail pages for metadata...');

  // Step 2: Enrich each item with detail page metadata
  const limit = pLimit(CONCURRENCY);
  let done = 0;
  const tasks = allItems.map(item => limit(async () => {
    const enriched = await fetchDetailMetadata(item);
    done++;
    if (done % 50 === 0) console.log(`  Detail pages: ${done}/${allItems.length}`);
    await sleep(150);
    return enriched;
  }));

  const enriched = await Promise.all(tasks);

  const withMedium = enriched.filter(x => x.medium).length;
  const withAccession = enriched.filter(x => x.accession).length;
  console.log(`\nEnriched: ${enriched.length} | with medium: ${withMedium} | with accession: ${withAccession}`);

  fs.writeFileSync(OUT, JSON.stringify(enriched, null, 2));
  console.log('Written to', OUT);
}

main().catch(e => { console.error(e); process.exit(1); });

