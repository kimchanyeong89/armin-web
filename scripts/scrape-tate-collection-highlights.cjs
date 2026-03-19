#!/usr/bin/env node
/* Scrape Tate Collection Highlights artworks from search listing and individual artwork metadata/images.
   Source list: https://www.tate.org.uk/search?gallery=tate-modern&q=Tate+Collection+Highlights&type=artwork
   Output: public/data/tate-collection-highlights-artworks.json
   For each artwork: { id, url, title, artist, dateText, medium, dimensions, credit, accession, image, tags[], scrapedAt }
*/
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
// const pLimit = require('p-limit'); // Loaded dynamically

// Use dynamic import for got because it is ESM only
let got;
let pLimit;

const ROOT = 'https://www.tate.org.uk';
const START_URL = 'https://www.tate.org.uk/search?gallery=tate-modern&q=Tate+Collection+Highlights&type=artwork';

const MAX_LIST_PAGES = 30; // ample for ~300 results (usually 10-20 per page)
const CONCURRENCY = process.env.TATE_ARTWORK_CONCURRENCY ? parseInt(process.env.TATE_ARTWORK_CONCURRENCY, 10) : 5;

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
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'
    },
    timeout: { request: 30000 },
    retry: { limit: 2 }
  });
  return res.body; 
}

async function collectListPage(pageUrl, seen) {
  try {
    const html = await fetchHtml(pageUrl);
    const $ = cheerio.load(html);
    const out = [];
    
    // Tate search results structure can vary, usually .card or .search-result
    // Look for links to /art/artworks/
    $('a[href*="/art/artworks/"]').each((_, a) => {
      const href = $(a).attr('href');
      if (!href) return;
      const abs = absUrl(href.split('?')[0]);
      if (!/\/art\/artworks\/[a-z0-9-]+-([a-z]\d+|[0-9]+)$/i.test(abs)) return; // Valid ID check
      
      const id = path.basename(abs);
      if (seen.has(id)) return;
      seen.add(id);

      // Try to get a title from context
      const container = $(a).closest('.card, .search-result-item, .grid__item');
      let title = norm(container.find('.card__title, .search-result-item__title, h2, h3').first().text()) || norm($(a).text());
      
      // Representative thumb
      const imgEl = container.find('img').first();
      let thumb = imgEl.attr('src') || imgEl.attr('data-src') || '';
      if (thumb) thumb = absUrl(thumb);
      
      out.push({ id, url: abs, title, thumb });
    });
    return out;
  } catch (e) {
    console.error(`Error collecting ${pageUrl}:`, e.message);
    return [];
  }
}

async function collectAllListPages() {
  const seen = new Set();
  const allEntries = [];
  let page = 1;

  // Search usually uses ?page=X
  while (page <= MAX_LIST_PAGES) {
    const pageUrl = `${START_URL}&page=${page}`;
    console.log(`Collecting page ${page}: ${pageUrl}`);
    const entries = await collectListPage(pageUrl, seen);
    if (entries.length === 0) {
        console.log('No more entries found.');
        break;
    }
    allEntries.push(...entries);
    page++;
    await new Promise(r => setTimeout(r, 500)); // Be nice
  }
  return allEntries;
}

// Extract specific fields from `objectData['key'] = 'value';` patterns in the script tag
function extractObjectData(html, key) {
    // Assignment form: objectData['key'] = 'value';
    const regex = new RegExp(`objectData\\['${key}'\\]\\s*=\\s*'([^']*)'`, 'i');
    const match = html.match(regex);
    if (match) return match[1];
    
    // Try double quotes if single fails
    const regex2 = new RegExp(`objectData\\['${key}'\\]\\s*=\\s*"([^"]*)"`, 'i');
    const match2 = html.match(regex2);
    if (match2) return match2[1];

    // Object literal form: 'key': 'value' (inside var objectData = {...})
    const regex3 = new RegExp(`'${key}'\\s*:\\s*'([^']*)'`, 'i');
    const match3 = html.match(regex3);
    if (match3) return match3[1];

    return null;
}

async function enrichArtwork(entry) {
  try {
    const html = await fetchHtml(entry.url);
    const $ = cheerio.load(html);

    // 1. Try extracting from the `objectData` JS object which contains clean metadata
    const jsMedium = extractObjectData(html, 'artworkMedium');
    const jsDate = extractObjectData(html, 'artworkDate');
    const jsArtist = extractObjectData(html, 'artistName');
    // Try both artworkTitle and title keys
    const jsTitle = extractObjectData(html, 'artworkTitle') || extractObjectData(html, 'title');
    const jsDims = extractObjectData(html, 'artworkDimensions'); // Sometimes present?
    const jsCredit = extractObjectData(html, 'creditLine');

    // 1b. Parse Meta Title: "‘Alhaji Takes the Floor‘, Tayo Adenaike, 1980 | Tate"
    // Note: Tate often uses same quote char for start/end or mixed curly quotes.
    // Example: ‘Untitled (Drop)‘, Maria Bartuszová, 1963–4
    let parsedTitle = '', parsedArtist = '', parsedYear = '';
    const metaTitle = $('meta[property="og:title"]').attr('content') || $('title').text();

    if (metaTitle) {
        let clean = metaTitle.split('|')[0].trim();
        // Relaxed regex: handle straight and curly quote styles
        // Captures: 1=Title (inside quotes), 2=Artist, 3=Year
        const match = clean.match(/^[\u2018\u2019''"](.+?)[\u2018\u2019''"\s]*,\s*(.+?)\s*,\s*(\d{4}|[c\d\s\u2013-]+)$/);
        
        if (match) {
            parsedTitle = match[1];
            parsedArtist = match[2];
            parsedYear = match[3];
        } else {
             // Fallback: split by last comma for year, then second last for artist
             const parts = clean.split(',').map(s => s.trim());
             if (parts.length >= 3) {
                 parsedYear = parts[parts.length - 1]; 
                 parsedArtist = parts[parts.length - 2]; 
                 // Join remaining parts as title and strip surrounding quotes (straight and curly)
                 parsedTitle = parts.slice(0, parts.length - 2).join(', ').replace(/^[\u2018\u2019''"]+|[\u2018\u2019''"]+$/g, '');
             }
        }
    }

    // 2. DOM Fallbacks
    const domTitle = norm($('h1.artwork-title').first().text()) || norm($('h1').first().text());
    const domArtist = norm($('.artist-name a').text() || $('.artist-name').text()); 
    const domDate = norm($('.date-display-single').text());
    
    // "Medium" is often in a specific definition list or paragraph
    // <dt>Medium</dt><dd>...</dd>
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

    // 3. Merge Logic
    // Priority: JS Variable (most reliable) > DOM (specific element) > Parsed Meta (regex heuristic) > Listing Title
    const title = jsTitle || domTitle || parsedTitle || entry.title;
    const artist = jsArtist || domArtist || parsedArtist || 'Unknown';
    const dateText = jsDate || domDate || parsedYear || '';
    const medium = jsMedium || domMedium || '';
    const dimensions = jsDims || domDims || '';
    const credit = jsCredit || '';

    // 4. Image Extraction
    // Provide a high-res image if possible. Tate usually puts it in `meta og:image`
    let image = $('meta[property="og:image"]').attr('content');
    if (!image) {
        // Fallback to scraping img tags
        const img = $('.artwork-image img').first();
        if (img.length) {
            image = img.attr('src');
            if (image) image = absUrl(image);
        }
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
    return null; // Partial failure acceptable
  }
}

async function main() {
  pLimit = (await import('p-limit')).default;
  console.log('Starting Tate Metadata Extraction...');
  const artworkEntries = await collectAllListPages();
  console.log(`Found ${artworkEntries.length} artwork links.`);

  const limit = pLimit(CONCURRENCY);
  const tasks = artworkEntries.map(entry => limit(() => enrichArtwork(entry)));
  
  const results = await Promise.all(tasks);
  const valid = results.filter(r => r && r.title);
  
  console.log(`Successfully enriched ${valid.length} artworks.`);

  const outPath = path.join(__dirname, '..', 'public', 'data', 'tate-collection-highlights-artworks.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(valid, null, 2)); // Array root
  console.log(`Output written to ${outPath}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
