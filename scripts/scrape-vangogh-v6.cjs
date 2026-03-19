/**
 * Van Gogh Museum Collection Scraper V6
 * - Pure HTTP (no Playwright) - server-side rendered HTML
 * - Collects ALL ~5064 items via JSON search API
 * - Fetches onView status from onView=true API
 * - Scrapes detail pages for full metadata
 * - Concurrent requests with rate limiting
 */

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.vangoghmuseum.nl';
const SEARCH_API = `${BASE_URL}/en/collection/search?q=&from=`;
const ONVIEW_API = `${BASE_URL}/en/collection/search?q=&onView=true&from=`;
const BATCH_SIZE = 24;

const OUTPUT_FILE = path.join(__dirname, '../public/data/vangogh-museum-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/vangogh-v6-progress.json');
const LOG_FILE = path.join(__dirname, '../downloads/vangogh-v6-log.txt');

const CONCURRENCY = 5;          // parallel detail fetches
const DELAY_API = 600;          // ms between API list pages
const DELAY_DETAIL = 300;       // ms between detail fetches per worker
const SAVE_INTERVAL = 100;      // save every N artworks
const MAX_RETRIES = 3;

const DOWNLOADS_DIR = path.dirname(PROGRESS_FILE);
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

// ─── Logging ────────────────────────────────────────────────────────────────

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

function httpGet(url, retries = MAX_RETRIES) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      }, (res) => {
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

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Phase 1: Collect all artwork IDs from search API ────────────────────────

async function collectAllLinks() {
  log('Phase 1: Collecting artwork links from search API...');
  const allIds = new Set();

  let from = 0;
  let hasMore = true;
  let pageCount = 0;

  while (hasMore) {
    try {
      const url = `${SEARCH_API}${from}`;
      const raw = await httpGet(url);
      const json = JSON.parse(raw);

      hasMore = json.hasMoreResults === true;

      // Extract IDs from resultsHtml: href="/en/collection/XXXXX"
      const matches = json.resultsHtml.match(/href="\/en\/collection\/([^"?]+)"/g) || [];
      matches.forEach(m => {
        const id = m.match(/\/en\/collection\/([^"?]+)/)?.[1];
        if (id && /^[a-zA-Z0-9]+$/.test(id)) allIds.add(id);
      });

      pageCount++;
      if (pageCount % 10 === 0) {
        log(`  Page ${pageCount} (from=${from}): ${allIds.size} unique IDs so far`);
      }

      from += BATCH_SIZE;
      await sleep(DELAY_API);
    } catch (err) {
      log(`  Error at from=${from}: ${err.message}, retrying...`);
      await sleep(3000);
    }
  }

  log(`Phase 1 complete: ${allIds.size} artwork IDs collected`);
  return Array.from(allIds);
}

// ─── Phase 2: Collect on-view IDs ────────────────────────────────────────────

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

      const matches = json.resultsHtml.match(/href="\/en\/collection\/([^"?]+)"/g) || [];
      matches.forEach(m => {
        const id = m.match(/\/en\/collection\/([^"?]+)/)?.[1];
        if (id) onViewIds.add(id);
      });

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

// ─── Phase 3: Scrape detail page ─────────────────────────────────────────────

function extractText(html, pattern) {
  const m = html.match(pattern);
  return m ? m[1].trim() : '';
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&#x2018;/g, '\u2018')
    .replace(/&#x2019;/g, '\u2019')
    .replace(/&#x2013;/g, '\u2013')
    .replace(/&#x2014;/g, '\u2014')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // strip markdown links
    .replace(/<br>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function scrapeDetail(id) {
  const url = `${BASE_URL}/en/collection/${id}`;
  try {
    const html = await httpGet(url);

    // Title from og:title: "Vincent van Gogh - The Potato Eaters"
    const ogTitle = extractText(html, /<meta property="og:title" content="([^"]+)"/);
    const title = ogTitle.includes(' - ') ? ogTitle.split(' - ').slice(1).join(' - ').trim() : ogTitle;

    // Artist from og:image:alt: "Vincent van Gogh, The Potato Eaters, 1885"
    const imgAlt = extractText(html, /<meta property="og:image:alt" content="([^"]+)"/);
    const artist = imgAlt.split(',')[0].trim() || 'Vincent van Gogh';

    // Year from imgAlt last token, or from creator info
    let year = null;
    const yearM = imgAlt.match(/,\s*(\d{4})$/) || imgAlt.match(/(\d{4})(?:[-–]\d{4})?$/);
    if (yearM) year = parseInt(yearM[1], 10);
    if (!year) {
      const creatorM = html.match(/art-object-page-content-creator[^>]*>[\s\S]*?(\d{4})/);
      if (creatorM) year = parseInt(creatorM[1], 10);
      // Check for date range like "April-May 1885" in creator info
      const dateM = html.match(/art-object-page-content-creator-info[^>]*>[\s\S]*?(\d{4})\s*<\/p>/);
      if (dateM) {
        const y = parseInt(dateM[1], 10);
        if (y > 1800 && y < 2000) year = y;
      }
    }

    // Date string (e.g. "Nuenen, April-May 1885") from creator-info paragraph
    let date = year ? String(year) : '';
    const creatorInfoM = html.match(/class="art-object-page-content-creator-info">\s*([\s\S]*?)\s*<\/p>/);
    if (creatorInfoM) {
      const raw = creatorInfoM[1].replace(/<[^>]+>/g, '').trim();
      if (raw && raw.length < 80) date = raw;
    }

    // Medium & dimensions from art-object-page-content-details
    let medium = '';
    let dimensions = '';
    const detailsM = html.match(/class="art-object-page-content-details">\s*([\s\S]*?)\s*<\/p>/);
    if (detailsM) {
      const raw = detailsM[1].replace(/<[^>]+>/g, '').trim();
      // "oil on canvas, 82 cm x 114 cm" → split at last cm pattern
      const dimMatch = raw.match(/^(.*?),?\s*(\d[\d\s\.]*\s*[×x]\s*[\d\s\.]+\s*cm.*?)$/i);
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

    // Description from meta description
    const descRaw = extractText(html, /<meta name="description" content="([^"]+)"/);
    const description = decodeHtmlEntities(descRaw).substring(0, 600);

    // Image URL from og:image (prefer large)
    const imageUrl = extractText(html, /<meta property="og:image" content="([^"]+)"/) ||
                     extractText(html, /data-src="(https:\/\/iiif\.micr\.io[^"]+)"/) || '';
    // Swap to 600px wide for consistent size
    const normalizedImageUrl = imageUrl.replace(/\/full\/\d+,\//, '/full/600,/');

    // Category/type from data-attribute in object header or from structured content
    // Look for: <span class="art-object-page-content-category">..painting..</span>
    const catM = html.match(/art-object-page-content-category[^>]*>\s*([\s\S]*?)\s*<\//) ||
                 html.match(/collection-art-object-category[^>]*>\s*([\s\S]*?)\s*<\//);
    let category = catM ? catM[1].replace(/<[^>]+>/g, '').trim().toLowerCase() : '';
    let artworkType = category;

    // Fallback: infer from medium
    if (!category) {
      const medL = medium.toLowerCase();
      if (medL.includes('oil') || medL.includes('paint')) { category = 'painting'; artworkType = 'painting'; }
      else if (medL.includes('pencil') || medL.includes('chalk') || medL.includes('ink') || medL.includes('paper')) { category = 'drawing'; artworkType = 'drawing'; }
      else if (medL.includes('print') || medL.includes('etching') || medL.includes('lithograph')) { category = 'print'; artworkType = 'print'; }
    }

    return {
      id,
      title: title || id,
      artist,
      year,
      date,
      medium,
      dimensions,
      description,
      imageUrl: normalizedImageUrl,
      category,
      artworkType,
      url,
    };
  } catch (err) {
    log(`  Error scraping ${id}: ${err.message}`);
    return null;
  }
}

// ─── Concurrent worker pool ───────────────────────────────────────────────────

async function processWithConcurrency(ids, processedSet, results, onViewIds) {
  log(`Phase 3: Scraping ${ids.length} detail pages (${CONCURRENCY} concurrent)...`);

  const queue = ids.filter(id => !processedSet.has(id));
  log(`  ${queue.length} remaining (${ids.length - queue.length} already done)`);

  let idx = 0;
  let done = 0;
  const total = queue.length;

  async function worker(workerId) {
    while (true) {
      const myIdx = idx++;
      if (myIdx >= total) break;

      const id = queue[myIdx];
      await sleep(DELAY_DETAIL * workerId); // stagger workers a bit initially

      const artwork = await scrapeDetail(id);
      if (artwork && artwork.title) {
        artwork.onView = onViewIds.has(id);
        results.push(artwork);
        processedSet.add(id);
      } else {
        processedSet.add(id); // mark as processed even if failed
      }

      done++;
      if (done % 50 === 0 || done % SAVE_INTERVAL === 0) {
        log(`  Progress: ${done}/${total} (${results.length} artworks collected)`);
        saveIntermediate(results);
      }

      await sleep(DELAY_DETAIL);
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i));
  await Promise.all(workers);

  log(`Phase 3 complete: ${results.length} artworks scraped`);
}

// ─── Save helpers ─────────────────────────────────────────────────────────────

function saveIntermediate(results) {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
}

function saveProgress(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
    allIds: data.allIds,
    onViewIds: Array.from(data.onViewIds),
    processedIds: Array.from(data.processedIds),
    count: data.results.length,
  }, null, 2));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log('═══════════════════════════════════════════════════════════════');
  log('  Van Gogh Museum Collection Scraper V6 (Pure HTTP)');
  log('═══════════════════════════════════════════════════════════════');

  // Load existing progress
  let allIds = [];
  let onViewIds = new Set();
  let processedIds = new Set();
  let results = [];

  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      const p = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      if (p.allIds?.length > 4000) {
        allIds = p.allIds;
        log(`Loaded ${allIds.length} IDs from progress`);
      }
      if (p.onViewIds) onViewIds = new Set(p.onViewIds);
      if (p.processedIds) processedIds = new Set(p.processedIds);
    } catch (e) { log('Progress file parse error: ' + e.message); }
  }

  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      const arr = Array.isArray(existing) ? existing : existing.items || existing.artworks || [];
      results = arr;
      arr.forEach(a => { if (a.id) processedIds.add(a.id); });
      log(`Loaded ${results.length} existing results`);
    } catch (e) { log('Output file parse error: ' + e.message); }
  }

  // Phase 1: Collect all IDs
  if (allIds.length < 4000) {
    allIds = await collectAllLinks();
    saveProgress({ allIds, onViewIds, processedIds, results });
  } else {
    log(`Skipping Phase 1: using ${allIds.length} cached IDs`);
  }

  // Phase 2: On-view IDs
  if (onViewIds.size === 0) {
    onViewIds = await collectOnViewIds();
    saveProgress({ allIds, onViewIds, processedIds, results });
  } else {
    log(`Skipping Phase 2: using ${onViewIds.size} cached on-view IDs`);
  }

  // Phase 3: Scrape detail pages
  await processWithConcurrency(allIds, processedIds, results, onViewIds);

  // Final save
  saveIntermediate(results);
  saveProgress({ allIds, onViewIds, processedIds, results });

  log('═══════════════════════════════════════════════════════════════');
  log(`DONE: ${results.length} artworks saved to ${OUTPUT_FILE}`);
  log(`On-view: ${results.filter(a => a.onView).length} items`);
  log('═══════════════════════════════════════════════════════════════');
}

main().catch(err => {
  log('Fatal error: ' + err.message);
  process.exit(1);
});
