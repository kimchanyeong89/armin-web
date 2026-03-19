/**
 * Castello di Rivoli: Full collection re-scraper and metadata corrector
 * 
 * For each item:
 * 1. Fetch sourceUrl HTML
 * 2. Check if page is 404 → mark for removal
 * 3. Extract artist from meta description: "by ARTIST in the collection"
 * 4. Extract image from og:image
 * 5. Validate image URL (must have actual filename, not just directory)
 * 6. Filter out artist portrait photos (URLs with "Photo-by", "-portrait-", etc.)
 * 7. Save updated collection with only valid items
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '../public/data/castello-di-rivoli-collection.json');
const RESUME_FILE = '/tmp/rivoli-rescrape-resume.json';
const CONCURRENCY = 8;
const DELAY_MS = 200;
const TIMEOUT_MS = 15000;

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function isValidImageUrl(url) {
  if (!url) return false;
  // Must have a file extension after the last /
  const pathPart = url.split('?')[0];
  const lastSegment = pathPart.split('/').pop();
  if (!lastSegment || !/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(lastSegment)) return false;
  // Filter out artist portraits and photographer credits
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('-photo-by-') || lowerUrl.includes('_photo_by_') ||
      lowerUrl.includes('-portrait-') || lowerUrl.includes('_portrait_') ||
      lowerUrl.includes('-foto-di-') || lowerUrl.includes('staff-') ||
      lowerUrl.includes('-headshot') || lowerUrl.includes('profile-')) {
    return false;
  }
  return true;
}

function extractArtist(html) {
  // Method 1: meta description "by ARTIST in the collection"
  const descMatch = html.match(/name=["']description["'].*?content=["']([^"']*by[^"']+in the collection[^"']*)["']/i)
    || html.match(/content=["']([^"']*by[^"']+in the collection[^"']*)["'][^>]*name=["']description["']/i);
  if (descMatch) {
    const desc = descMatch[1];
    // Decode HTML entities first
    const decoded = desc.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const byMatch = decoded.match(/by\s+(.+?)\s+in the collection/i);
    if (byMatch) {
      return byMatch[1].trim();
    }
  }
  return null;
}

function extractOgImage(html) {
  const match = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (match) return match[1];
  return null;
}

function isPageNotFound(html) {
  return html.includes('Pagina non trovata') || html.includes('noindex') && html.includes('og:title" content="Pagina');
}

async function fetchPage(url) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    clearTimeout(timer);
    if (res.status === 404) return { status: 404, html: '' };
    const html = await res.text();
    return { status: res.status, html };
  } catch (err) {
    return { status: 0, html: '', error: err.message };
  }
}

async function processItem(item) {
  if (!item.sourceUrl) return { ...item, _remove: true, _reason: 'no sourceUrl' };

  const { status, html, error } = await fetchPage(item.sourceUrl);

  if (status === 404 || (status === 200 && isPageNotFound(html))) {
    return { ...item, _remove: true, _reason: `404: ${item.sourceUrl}` };
  }
  if (status !== 200) {
    // Keep item as-is if there's a network error (don't remove due to transient issues)
    return { ...item, _fetchError: error || `HTTP ${status}` };
  }

  // Extract artist
  const artist = extractArtist(html);

  // Extract image
  const ogImage = extractOgImage(html);
  const hasValidImage = isValidImageUrl(ogImage);

  if (!hasValidImage) {
    return { ...item, _remove: true, _reason: `no valid image (og:image: ${ogImage})` };
  }

  return {
    ...item,
    artist: artist || item.artist,
    imageUrl: ogImage,
    _remove: false
  };
}

async function main() {
  log('Loading data...');
  const allItems = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  log(`Total items: ${allItems.length}`);

  // Load resume state
  let processed = {};
  if (existsSync(RESUME_FILE)) {
    processed = JSON.parse(readFileSync(RESUME_FILE, 'utf8'));
    log(`Resuming: ${Object.keys(processed).length} already processed`);
  }

  const remaining = allItems.filter(item => !(item.id in processed));
  log(`Remaining to process: ${remaining.length}`);

  // Process in batches
  let done = 0;
  for (let i = 0; i < remaining.length; i += CONCURRENCY) {
    const batch = remaining.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(item => processItem(item)));

    for (let j = 0; j < batch.length; j++) {
      processed[batch[j].id] = results[j];
    }

    done += batch.length;
    if (done % 50 === 0 || done === remaining.length) {
      const removed = Object.values(processed).filter(x => x._remove).length;
      log(`Progress: ${done}/${remaining.length} remaining processed. Removed so far: ${removed}`);
      // Save resume state
      writeFileSync(RESUME_FILE, JSON.stringify(processed, null, 2));
    }

    if (i + CONCURRENCY < remaining.length) {
      await delay(DELAY_MS);
    }
  }

  // Build final collection
  const finalItems = [];
  const removedItems = [];

  for (const item of allItems) {
    const result = processed[item.id];
    if (!result) {
      finalItems.push(item); // Not processed yet (shouldn't happen)
      continue;
    }
    if (result._remove) {
      removedItems.push({ id: result.id, title: result.title, reason: result._reason });
    } else {
      const { _remove, _reason, _fetchError, ...clean } = result;
      finalItems.push(clean);
    }
  }

  log(`Final count: ${finalItems.length} (removed ${removedItems.length})`);
  log('Removed items sample:');
  removedItems.slice(0, 10).forEach(r => log(`  - ${r.title}: ${r.reason}`));

  // Save
  writeFileSync(DATA_FILE, JSON.stringify(finalItems, null, 2), 'utf8');
  log(`Saved ${finalItems.length} items to ${DATA_FILE}`);
  log('DONE.');
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
