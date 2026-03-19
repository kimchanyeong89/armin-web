/**
 * Van Gogh Museum Collection Scraper V7
 * - Fixed: captures ALL item types (paintings + prints + letters + sheet music etc.)
 *   V6 only captured /en/collection/ID, missing /en/prints/collection/ID etc.
 * - Now extracts full href paths and uses them for detail page fetching
 * - Pure HTTP (no Playwright)
 * - Resume support via progress file
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const BASE_URL   = 'https://www.vangoghmuseum.nl';
const SEARCH_API = `${BASE_URL}/en/collection/search?q=&from=`;
const ONVIEW_API = `${BASE_URL}/en/collection/search?q=&onView=true&from=`;
const BATCH_SIZE = 24;

const OUTPUT_FILE   = path.join(__dirname, '../public/data/vangogh-museum-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/vangogh-v7-progress.json');
const LOG_FILE      = path.join(__dirname, '../downloads/vangogh-v7-log.txt');

const CONCURRENCY   = 5;
const DELAY_API     = 600;     // ms between search API pages
const DELAY_DETAIL  = 300;     // ms between detail fetches per worker
const SAVE_INTERVAL = 100;
const MAX_RETRIES   = 3;

const DOWNLOADS_DIR = path.dirname(PROGRESS_FILE);
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

function httpGet(url, retries = MAX_RETRIES) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      }, (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(httpGet(res.headers.location, retries));
          return;
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', (err) => {
        if (n > 0) setTimeout(() => attempt(n - 1), 2000);
        else reject(err);
      });
    };
    attempt(retries);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Phase 1: Collect all artwork paths from search API ───────────────────────
//
// V7 FIX vs V6:
//   V6 regex: /href="\/en\/collection\/([^"?]+)"/g
//   → only matched /en/collection/ID paths (paintings/drawings)
//
//   V7 regex: /href="(\/en\/(?:[^\/]+\/)?collection\/[^"?\s]+)"/g
//   → matches ALL item paths:
//     /en/collection/s0005V1962
//     /en/prints/collection/p0438V1982
//     /en/letters/collection/l0100V1989
//     /en/[type]/collection/ID  (any type prefix)

function extractPathsFromHtml(html) {
  const re = /href="(\/en\/(?:[^\/]+\/)?collection\/[^"?\s]+)"/g;
  const found = new Map(); // id → fullPath (dedup by ID)
  let m;
  while ((m = re.exec(html)) !== null) {
    const fullPath = m[1];
    const id = fullPath.split('/').pop();
    // Only accept IDs that look like museum object IDs (alphanumeric)
    if (id && /^[a-zA-Z0-9]+$/.test(id)) {
      if (!found.has(id)) found.set(id, fullPath);
    }
  }
  return found;
}

async function collectAllLinks() {
  log('Phase 1: Collecting artwork paths from search API...');
  const allPaths = new Map(); // id → fullPath

  let from     = 0;
  let hasMore  = true;
  let pageCount = 0;

  while (hasMore) {
    try {
      const url = `${SEARCH_API}${from}`;
      const raw = await httpGet(url);
      const json = JSON.parse(raw);

      hasMore = json.hasMoreResults === true;

      const found = extractPathsFromHtml(json.resultsHtml || '');
      found.forEach((fp, id) => { if (!allPaths.has(id)) allPaths.set(id, fp); });

      pageCount++;
      if (pageCount % 10 === 0) {
        log(`  Page ${pageCount} (from=${from}): ${allPaths.size} unique IDs so far`);
      }

      from += BATCH_SIZE;
      await sleep(DELAY_API);
    } catch (err) {
      log(`  Error at from=${from}: ${err.message}, retrying...`);
      await sleep(3000);
    }
  }

  log(`Phase 1 complete: ${allPaths.size} artwork IDs collected`);
  return allPaths;
}

// ─── Phase 2: Collect on-view IDs ─────────────────────────────────────────────

async function collectOnViewIds() {
  log('Phase 2: Collecting on-view IDs...');
  const onViewIds = new Set();
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    try {
      const url = `${ONVIEW_API}${from}`;
      const raw = await httpGet(url);
      const json = JSON.parse(raw);
      hasMore = json.hasMoreResults === true;

      const found = extractPathsFromHtml(json.resultsHtml || '');
      found.forEach((_, id) => onViewIds.add(id));

      from += BATCH_SIZE;
      await sleep(DELAY_API);
    } catch (err) {
      log(`  On-view fetch error at from=${from}: ${err.message}`);
      await sleep(2000);
    }
  }

  log(`Phase 2 complete: ${onViewIds.size} on-view IDs`);
  return onViewIds;
}

// ─── Phase 3: Scrape detail page ──────────────────────────────────────────────

function extractText(html, pattern) {
  const m = html.match(pattern);
  return m ? m[1].trim() : '';
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&#x2018;/g, '\u2018').replace(/&#x2019;/g, '\u2019')
    .replace(/&#x2013;/g, '\u2013').replace(/&#x2014;/g, '\u2014')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<br>/gi, ' ').replace(/\s+/g, ' ').trim();
}

async function scrapeDetail(id, itemPath) {
  // V7: construct URL from full path, not just /en/collection/ID
  const url = `${BASE_URL}${itemPath}`;
  try {
    const html = await httpGet(url);

    // Title from og:title: "Vincent van Gogh - The Potato Eaters"
    const ogTitle = extractText(html, /<meta property="og:title" content="([^"]+)"/);
    const title = ogTitle.includes(' - ') ? ogTitle.split(' - ').slice(1).join(' - ').trim() : ogTitle;

    // Artist from og:image:alt: "Vincent van Gogh, The Potato Eaters, 1885"
    const imgAlt = extractText(html, /<meta property="og:image:alt" content="([^"]+)"/);
    const artist = imgAlt.split(',')[0].trim() || 'Vincent van Gogh';

    // Year from imgAlt last token
    let year = null;
    const yearM = imgAlt.match(/,\s*(\d{4})$/) || imgAlt.match(/(\d{4})(?:[-\u2013]\d{4})?$/);
    if (yearM) year = parseInt(yearM[1], 10);
    if (!year) {
      const creatorM = html.match(/art-object-page-content-creator[^>]*>[\s\S]*?(\d{4})/);
      if (creatorM) year = parseInt(creatorM[1], 10);
      const dateM = html.match(/art-object-page-content-creator-info[^>]*>[\s\S]*?(\d{4})\s*<\/p>/);
      if (dateM) { const y = parseInt(dateM[1], 10); if (y > 1800 && y < 2000) year = y; }
    }

    // Date string
    let date = year ? String(year) : '';
    const creatorInfoM = html.match(/class="art-object-page-content-creator-info">\s*([\s\S]*?)\s*<\/p>/);
    if (creatorInfoM) {
      const raw = creatorInfoM[1].replace(/<[^>]+>/g, '').trim();
      if (raw && raw.length < 80) date = raw;
    }

    // Medium & dimensions
    let medium = '', dimensions = '';
    const detailsM = html.match(/class="art-object-page-content-details">\s*([\s\S]*?)\s*<\/p>/);
    if (detailsM) {
      const raw = detailsM[1].replace(/<[^>]+>/g, '').trim();
      const dimMatch = raw.match(/^(.*?),?\s*(\d[\d\s.]*\s*[×x]\s*[\d\s.]+\s*cm.*?)$/i);
      if (dimMatch) {
        medium = dimMatch[1].trim().replace(/,$/, '');
        dimensions = dimMatch[2].trim();
      } else if (raw.includes(' cm')) {
        const parts = raw.split(',');
        const dimIdx = parts.findIndex(p => /\d.*cm/i.test(p));
        if (dimIdx > 0) {
          medium = parts.slice(0, dimIdx).join(',').trim();
          dimensions = parts.slice(dimIdx).join(',').trim();
        } else {
          medium = raw;
        }
      } else {
        medium = raw;
      }
    }

    // Description
    const descRaw = extractText(html, /<meta name="description" content="([^"]+)"/);
    const description = decodeHtmlEntities(descRaw).substring(0, 600);

    // Image URL
    const imageUrl = extractText(html, /<meta property="og:image" content="([^"]+)"/) ||
                     extractText(html, /data-src="(https:\/\/iiif\.micr\.io[^"]+)"/) || '';
    const normalizedImageUrl = imageUrl.replace(/\/full\/\d+,\//, '/full/600,/');

    // Category/type
    const catM = html.match(/art-object-page-content-category[^>]*>\s*([\s\S]*?)\s*<\//) ||
                 html.match(/collection-art-object-category[^>]*>\s*([\s\S]*?)\s*<\//);
    let category = catM ? catM[1].replace(/<[^>]+>/g, '').trim().toLowerCase() : '';

    // Infer type prefix from URL path if category is missing
    // e.g. /en/prints/collection/ → 'print', /en/letters/collection/ → 'letter'
    if (!category) {
      const pathTypeMatch = itemPath.match(/^\/en\/([^\/]+)\/collection\//);
      if (pathTypeMatch && pathTypeMatch[1] !== 'collection') {
        category = pathTypeMatch[1].replace(/-/g, ' ').replace(/s$/, ''); // 'prints' → 'print'
      }
    }

    // Fallback: infer from medium
    if (!category) {
      const medL = medium.toLowerCase();
      if (medL.includes('oil') || medL.includes('paint'))                             category = 'painting';
      else if (medL.includes('pencil') || medL.includes('chalk') ||
               medL.includes('ink') || medL.includes('paper'))                        category = 'drawing';
      else if (medL.includes('print') || medL.includes('etching') ||
               medL.includes('lithograph'))                                            category = 'print';
    }

    return { id, title: title || id, artist, year, date, medium, dimensions,
             description, imageUrl: normalizedImageUrl, category, artworkType: category, url };
  } catch (err) {
    log(`  Error scraping ${id} (${url}): ${err.message}`);
    return null;
  }
}

// ─── Concurrent worker pool ────────────────────────────────────────────────────

async function processWithConcurrency(allPaths, processedIds, results, onViewIds) {
  const items = Array.from(allPaths.entries())
    .filter(([id]) => !processedIds.has(id))
    .map(([id, fp]) => ({ id, fp }));

  log(`Phase 3: Scraping ${items.length} detail pages (${CONCURRENCY} concurrent)...`);
  log(`  (${allPaths.size - items.length} already done)`);

  let idx = 0, done = 0;
  const total = items.length;

  async function worker(workerId) {
    while (true) {
      const myIdx = idx++;
      if (myIdx >= total) break;
      const { id, fp } = items[myIdx];
      await sleep(DELAY_DETAIL * workerId);

      const artwork = await scrapeDetail(id, fp);
      if (artwork && artwork.title) {
        artwork.onView = onViewIds.has(id);
        results.push(artwork);
        processedIds.add(id);
      } else {
        processedIds.add(id);
      }
      done++;
      if (done % 50 === 0) {
        log(`  Progress: ${done}/${total} (${results.length} artworks, ${processedIds.size} processed)`);
        saveIntermediate(results);
      }
      await sleep(DELAY_DETAIL);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));
  log(`Phase 3 complete: ${results.length} artworks scraped`);
}

// ─── Save helpers ──────────────────────────────────────────────────────────────

function saveIntermediate(results) {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
}

function saveProgress({ allPaths, onViewIds, processedIds, results }) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
    allPaths:     Object.fromEntries(allPaths),
    onViewIds:    Array.from(onViewIds),
    processedIds: Array.from(processedIds),
    count: results.length,
  }, null, 2));
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log('═══════════════════════════════════════════════════════════════');
  log('  Van Gogh Museum Collection Scraper V7');
  log('  FIX: captures ALL URL path types (/en/prints/collection/ID etc.)');
  log('═══════════════════════════════════════════════════════════════');

  let allPaths    = new Map(); // id → fullPath
  let onViewIds   = new Set();
  let processedIds = new Set();
  let results     = [];

  // Load progress
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      const p = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      if (p.allPaths && Object.keys(p.allPaths).length > 4000) {
        allPaths = new Map(Object.entries(p.allPaths));
        log(`Loaded ${allPaths.size} paths from progress`);
      }
      if (p.onViewIds)    onViewIds   = new Set(p.onViewIds);
      if (p.processedIds) processedIds = new Set(p.processedIds);
    } catch (e) { log('Progress parse error: ' + e.message); }
  }

  // Load existing results
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      const arr = Array.isArray(existing) ? existing : (existing.items || existing.artworks || []);
      results = arr;
      arr.forEach(a => { if (a.id) processedIds.add(a.id); });
      log(`Loaded ${results.length} existing results`);
    } catch (e) { log('Output parse error: ' + e.message); }
  }

  // Phase 1: Collect all paths
  if (allPaths.size < 4000) {
    allPaths = await collectAllLinks();
    saveProgress({ allPaths, onViewIds, processedIds, results });
  } else {
    log(`Skipping Phase 1: using ${allPaths.size} cached paths`);
  }

  // Phase 2: On-view IDs
  if (onViewIds.size === 0) {
    onViewIds = await collectOnViewIds();
    saveProgress({ allPaths, onViewIds, processedIds, results });
  } else {
    log(`Skipping Phase 2: using ${onViewIds.size} cached on-view IDs`);
  }

  // Phase 3: Scrape detail pages
  await processWithConcurrency(allPaths, processedIds, results, onViewIds);

  // Final save
  saveIntermediate(results);
  saveProgress({ allPaths, onViewIds, processedIds, results });

  log('═══════════════════════════════════════════════════════════════');
  log(`DONE: ${results.length} artworks saved to ${OUTPUT_FILE}`);
  log(`On-view: ${results.filter(a => a.onView).length} items`);
  log('═══════════════════════════════════════════════════════════════');
}

main().catch(err => {
  log('Fatal error: ' + err.message);
  process.exit(1);
});
