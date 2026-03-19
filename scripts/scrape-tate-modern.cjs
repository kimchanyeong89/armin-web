#!/usr/bin/env node
/* Scrape Tate Modern permanent collection artworks.
   Source: https://www.tate.org.uk/collection?classification=10&classification=2&classification=4&classification=5&classification=6&location=218&tab=collection&page=1
   (classification: 10=paintings,2=drawings,4=prints,5=photos,6=sculptures; location=218=Tate Modern)
   Output: public/data/tate-modern-collection.json
*/
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

let got;
let pLimit;

const ROOT = 'https://www.tate.org.uk';
const BASE_URL = 'https://www.tate.org.uk/collection?classification=10&classification=2&classification=4&classification=5&classification=6&location=218&tab=collection&page=';
const MAX_LIST_PAGES = 40;
const CONCURRENCY = process.env.TATE_CONCURRENCY ? parseInt(process.env.TATE_CONCURRENCY, 10) : 5;

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
  if (!got) {
    got = (await import('got')).default;
  }
  const res = await got(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
    },
    timeout: { request: 30000 },
    retry: { limit: 2 }
  });
  return res.body;
}

async function collectListPage(page, seen) {
  const pageUrl = BASE_URL + page;
  try {
    const html = await fetchHtml(pageUrl);
    const $ = cheerio.load(html);
    const out = [];

    $('a[href*="/art/artworks/"]').each((_, a) => {
      const href = $(a).attr('href');
      if (!href) return;
      const abs = absUrl(href.split('?')[0]);
      if (!/\/art\/artworks\/[a-z0-9-]+-[a-z0-9]+$/i.test(abs)) return;
      const id = path.basename(abs);
      if (seen.has(id)) return;
      seen.add(id);

      const container = $(a).closest('.card, .grid__item, article');
      const title = norm(container.find('.card__title, h2, h3').first().text()) || norm($(a).text());
      const imgEl = container.find('img').first();
      let thumb = imgEl.attr('src') || imgEl.attr('data-src') || '';
      if (thumb) thumb = absUrl(thumb);

      out.push({ id, url: abs, title, thumb });
    });
    return out;
  } catch (e) {
    console.error(`Error collecting page ${page}:`, e.message);
    return [];
  }
}

async function collectAllListPages() {
  const seen = new Set();
  const allEntries = [];
  let page = 1;

  while (page <= MAX_LIST_PAGES) {
    console.log(`Collecting page ${page}...`);
    const entries = await collectListPage(page, seen);
    if (entries.length === 0) {
      console.log('No more entries found.');
      break;
    }
    allEntries.push(...entries);
    console.log(`  → ${entries.length} entries (total: ${allEntries.length})`);
    page++;
    await new Promise(r => setTimeout(r, 400));
  }
  return allEntries;
}

function extractObjectData(html, key) {
  const rex1 = new RegExp(`objectData\\['${key}'\\]\\s*=\\s*'([^']*)'`, 'i');
  const m1 = html.match(rex1);
  if (m1) return m1[1];
  const rex2 = new RegExp(`objectData\\['${key}'\\]\\s*=\\s*"([^"]*)"`, 'i');
  const m2 = html.match(rex2);
  if (m2) return m2[1];
  const rex3 = new RegExp(`'${key}'\\s*:\\s*'([^']*)'`, 'i');
  const m3 = html.match(rex3);
  if (m3) return m3[1];
  return null;
}

async function enrichArtwork(entry) {
  try {
    const html = await fetchHtml(entry.url);
    const $ = cheerio.load(html);

    const jsMedium = extractObjectData(html, 'artworkMedium');
    const jsDate = extractObjectData(html, 'artworkDate');
    const jsArtist = extractObjectData(html, 'artistName');
    const jsTitle = extractObjectData(html, 'artworkTitle') || extractObjectData(html, 'title');
    const jsDims = extractObjectData(html, 'artworkDimensions');
    const jsCredit = extractObjectData(html, 'creditLine');

    // Parse from page title: "'Title', Artist, Year | Tate"
    let parsedTitle = '', parsedArtist = '', parsedYear = '';
    const metaTitle = $('meta[property="og:title"]').attr('content') || $('title').text();
    if (metaTitle) {
      let clean = metaTitle.split('|')[0].trim();
      const match = clean.match(/^[\u2018\u2019''"](.+?)[\u2018\u2019''"\s]*,\s*(.+?)\s*,\s*(\d{4}|[c\d\s\u2013-]+)$/);
      if (match) {
        parsedTitle = match[1];
        parsedArtist = match[2];
        parsedYear = match[3];
      } else {
        const parts = clean.split(',').map(s => s.trim());
        if (parts.length >= 3) {
          parsedYear = parts[parts.length - 1];
          parsedArtist = parts[parts.length - 2];
          parsedTitle = parts.slice(0, parts.length - 2).join(', ').replace(/^[\u2018\u2019''"]+|[\u2018\u2019''"]+$/g, '');
        }
      }
    }

    const domTitle = norm($('h1.artwork-title').first().text()) || norm($('h1').first().text());
    const domArtist = norm($('.artist-name a').text() || $('.artist-name').text());
    const domDate = norm($('.date-display-single').text());

    let domMedium = '';
    $('dt').each((_, dt) => {
      if ($(dt).text().trim().match(/^Medium$/i)) {
        domMedium = norm($(dt).next('dd').text());
      }
    });
    let domDims = '';
    $('dt').each((_, dt) => {
      if ($(dt).text().trim().match(/^Dimensions$/i)) {
        domDims = norm($(dt).next('dd').text());
      }
    });

    const title = jsTitle || domTitle || parsedTitle || entry.title;
    const artist = jsArtist || domArtist || parsedArtist || 'Unknown';
    const dateText = jsDate || domDate || parsedYear || '';
    const medium = jsMedium || domMedium || '';
    const dimensions = jsDims || domDims || '';
    const credit = jsCredit || '';

    let image = $('meta[property="og:image"]').attr('content');
    if (!image) {
      const img = $('.artwork-image img').first();
      if (img.length) image = absUrl(img.attr('src'));
    }
    if (!image) image = entry.thumb;

    return {
      id: entry.id,
      url: entry.url,
      title,
      artist,
      dateText,
      medium,
      dimensions,
      credit,
      image,
      scrapedAt: new Date().toISOString()
    };
  } catch (e) {
    console.error(`Error enriching ${entry.url}:`, e.message);
    return null;
  }
}

async function main() {
  pLimit = (await import('p-limit')).default;
  console.log('Starting Tate Modern collection scrape...');

  const entries = await collectAllListPages();
  console.log(`\nFound ${entries.length} artwork links. Fetching detail pages...`);

  const limit = pLimit(CONCURRENCY);
  let done = 0;
  const tasks = entries.map(entry => limit(async () => {
    const r = await enrichArtwork(entry);
    done++;
    if (done % 50 === 0) console.log(`  Enriched ${done}/${entries.length}...`);
    await new Promise(r => setTimeout(r, 200));
    return r;
  }));

  const results = await Promise.all(tasks);
  const valid = results.filter(r => r && r.title);

  console.log(`\nSuccessfully enriched ${valid.length} artworks.`);

  const outPath = path.join(__dirname, '..', 'public', 'data', 'tate-modern-collection.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(valid, null, 2));
  console.log(`Output written to ${outPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
