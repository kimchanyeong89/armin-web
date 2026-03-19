/**
 * Versailles FRESH Scraper
 *
 * Scrapes ALL items from the Grand Palais RMN search for Versailles (CATEGORY 271490).
 * NO merge with existing data — starts completely fresh.
 * Deduplicates by normalized title at the end.
 *
 * Usage: node scripts/scrape-versailles-fresh.cjs
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET_URL = 'https://images.grandpalaisrmn.fr/search-result?SEARCHTXT1=Versailles&SEARCHMODE=NEW&CS_FILTER_ASSETS[]=media&CATEGORY[]=271490&EVENT=WEBSHOP_SEARCH';
const OUTPUT_FILE = path.join(__dirname, '../public/data/versailles-collection.json');
const SESSION_CHUNK = 50; // Refresh session every N pages to avoid token expiry

const delay = ms => new Promise(r => setTimeout(r, ms));
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const log = msg => console.log(`[${timestamp()}] [Versailles] ${msg}`);

// ─────────────────────────────────────────────────────────────
// Extract items from current page
// ─────────────────────────────────────────────────────────────
async function extractPageItems(page) {
  return page.evaluate(() => {
    const results = [];
    const mediaItems = document.querySelectorAll('.media-item.asset-medium');
    mediaItems.forEach((item, index) => {
      try {
        const mediaDiv = item.querySelector('[data-medianumber]');
        const mediaNumber = mediaDiv?.getAttribute('data-medianumber') || '';
        const img = item.querySelector('img.medium');
        const title = img?.alt || `Artwork ${index + 1}`;
        const thumbSrc = img?.src || '';
        const link = item.querySelector('a[href*="/ark:/"]');
        const sourceUrl = link?.href || '';
        if (mediaNumber && title) {
          results.push({ id: mediaNumber, title, image: thumbSrc, sourceUrl });
        }
      } catch (e) {}
    });
    return results;
  });
}

// ─────────────────────────────────────────────────────────────
// Navigate safely with retry
// ─────────────────────────────────────────────────────────────
async function safeGoto(page, url, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      try {
        await page.waitForSelector('.media-item.asset-medium', { timeout: 20000 });
      } catch (e) {}
      await delay(500);
      return true;
    } catch (e) {
      log(`   ${label} attempt ${attempt} failed: ${e.message.split('\n')[0]}`);
      if (attempt < 3) await delay(5000);
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// Establish fresh session: load base URL and return base pagination URL
// ─────────────────────────────────────────────────────────────
async function establishSession(page) {
  log('🔄 Establishing session...');
  const ok = await safeGoto(page, TARGET_URL, 'session-init');
  if (!ok) return null;

  await delay(2000);

  // Accept cookies if prompt appears
  try {
    const btn = await page.$('button:has-text("Accepter"), button:has-text("Accept all"), button:has-text("Accept All")');
    if (btn) { await btn.click(); await delay(1500); log('🍪 Accepted cookies'); }
  } catch (e) {}

  // Get total item count
  try {
    const countText = await page.$eval('.count-search-results', el => el.textContent);
    const cleaned = countText.replace(/[()]/g, '').replace(/[.,\s]/g, '');
    const match = cleaned.match(/\d+/);
    if (match) log(`📊 Total results reported: ${parseInt(match[0]).toLocaleString()}`);
  } catch (e) {}

  // Get session-specific base URL (contains server-side token)
  try {
    const nextHref = await page.$eval('.media-item-paging-next a', el => el.getAttribute('href'));
    if (nextHref && nextHref.includes('PAGING_SCOPE_1')) {
      const basePageUrl = nextHref.replace(/&PAGING_SCOPE_1=\d+$/, '');
      log(`🔑 Session established — base URL: ${basePageUrl.substring(0, 80)}...`);
      return basePageUrl;
    }
  } catch (e) {
    log('⚠️ No pagination token found (maybe single-page results)');
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Normalize title for deduplication
// ─────────────────────────────────────────────────────────────
function normalizeTitle(t) {
  if (!t) return '';
  return t
    .toLowerCase()
    .replace(/^(le|la|les|l'|un|une|des|the|a|an)\s+/i, '')
    .replace(/['\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────────────────────
// Intermediate save (fresh data only — no existing merge)
// ─────────────────────────────────────────────────────────────
function intermediateSave(allArtworks) {
  const items = Array.from(allArtworks.values()).map((item, idx) => ({
    id: `versailles-collection-${idx + 1}`,
    mediaNumber: item.id,
    title: item.title || 'Untitled',
    artist: 'Unknown',
    year: null,
    medium: 'Painting',
    dimensions: '',
    image: item.image || '',
    sourceUrl: item.sourceUrl || '',
    type: '2D',
    museum: 'Palace of Versailles'
  }));
  const output = {
    collection: 'Palace of Versailles',
    museum: 'Palace of Versailles',
    scrapedAt: new Date().toISOString(),
    totalItems: items.length,
    objects: items
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
async function main() {
  log('🚀 Starting Versailles FRESH scrape (no existing data will be merged)');
  log(`📍 Target: ${TARGET_URL}`);

  // Clear existing output to ensure fresh start
  if (fs.existsSync(OUTPUT_FILE)) {
    const bakFile = OUTPUT_FILE.replace('.json', '.bak.json');
    fs.copyFileSync(OUTPUT_FILE, bakFile);
    log(`📂 Backed up existing file to ${path.basename(bakFile)}`);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  // allArtworks: mediaNumber → item (fresh data only, no existing merge)
  const allArtworks = new Map();

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    // Establish initial session
    let sessionBaseUrl = await establishSession(page);
    if (!sessionBaseUrl) {
      log('❌ Could not establish session — aborting');
      await browser.close();
      return;
    }

    // Collect page 1 items (already on page 1 after establishSession)
    log('📄 Page 1: Extracting items...');
    await delay(1000);
    const page1Items = await extractPageItems(page);
    let newCount = 0;
    for (const item of page1Items) {
      if (!allArtworks.has(item.id)) { allArtworks.set(item.id, item); newCount++; }
    }
    log(`   Found ${page1Items.length} items (${newCount} unique). Total: ${allArtworks.size}`);

    let pageNum = 2;
    const maxPages = 300;
    let consecutiveEmpty = 0;
    let consecutiveNoNew = 0;
    let sessionStartPage = 1; // The global page number where current session started

    while (pageNum <= maxPages) {
      // Session refresh: every SESSION_CHUNK pages past session start
      if (pageNum - sessionStartPage >= SESSION_CHUNK) {
        log(`🔄 Session refresh needed at page ${pageNum} (session started at ${sessionStartPage})...`);
        sessionBaseUrl = await establishSession(page);
        if (!sessionBaseUrl) {
          log('❌ Failed to re-establish session — stopping');
          break;
        }
        sessionStartPage = 1; // New session starts fresh at page 1, PAGING_SCOPE_1=pageNum goes to that page directly
        log(`✅ New session established. Will use PAGING_SCOPE_1=${pageNum} to jump to page ${pageNum}`);
      }

      log(`📄 Page ${pageNum}: Extracting items...`);

      // Use PAGING_SCOPE_1=pageNum directly — the server accepts absolute page numbers
      const pageUrl = `https://images.grandpalaisrmn.fr${sessionBaseUrl}&PAGING_SCOPE_1=${pageNum}`;
      const ok = await safeGoto(page, pageUrl, `page-${pageNum}`);
      if (!ok) {
        log(`   ⚠️ Failed to load page ${pageNum} — skipping`);
        consecutiveEmpty++;
        if (consecutiveEmpty >= 5) {
          log('   5 consecutive failures — stopping');
          break;
        }
        pageNum++;
        continue;
      }

      await delay(600);
      const items = await extractPageItems(page);

      if (items.length === 0) {
        consecutiveEmpty++;
        log(`   No items found. Consecutive empty: ${consecutiveEmpty}`);
        if (consecutiveEmpty >= 5) {
          log('   5 consecutive empty pages — done, all pages collected');
          break;
        }
      } else {
        consecutiveEmpty = 0;
        let newItems = 0;
        for (const item of items) {
          if (!allArtworks.has(item.id)) { allArtworks.set(item.id, item); newItems++; }
        }
        log(`   Found ${items.length} items, ${newItems} new. Total: ${allArtworks.size}`);

        if (newItems === 0) {
          consecutiveNoNew++;
          if (consecutiveNoNew >= 8) {
            log('   8 pages with 0 new items — likely reached end of unique items');
            break;
          }
        } else {
          consecutiveNoNew = 0;
        }
      }

      // Intermediate save every 20 pages
      if (pageNum % 20 === 0) {
        log(`   💾 Checkpoint save: ${allArtworks.size} items so far`);
        intermediateSave(allArtworks);
      }

      pageNum++;
    }

    await context.close();
    log(`📦 Scraping complete. Collected ${allArtworks.size} unique items from ${pageNum - 1} pages`);

  } finally {
    await browser.close();
  }

  // ── Final save with deduplication ─────────────────────────
  log(`🔄 Deduplicating by normalized title...`);

  const allItems = Array.from(allArtworks.values());
  log(`   Total items before dedup: ${allItems.length}`);

  const seen = new Set();
  const deduped = allItems.filter(item => {
    const key = normalizeTitle(item.title || '') + '|' + (item.artist || item.author || '').toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  log(`   After dedup: ${deduped.length} (removed ${allItems.length - deduped.length} duplicates)`);

  const objects = deduped.map((item, idx) => ({
    id: `versailles-collection-${idx + 1}`,
    mediaNumber: item.id,
    title: item.title || 'Untitled',
    artist: 'Unknown',
    year: null,
    medium: 'Painting',
    dimensions: '',
    image: item.image || '',
    sourceUrl: item.sourceUrl || '',
    type: '2D',
    museum: 'Palace of Versailles'
  }));

  const output = {
    collection: 'Palace of Versailles',
    museum: 'Palace of Versailles',
    scrapedAt: new Date().toISOString(),
    totalItems: objects.length,
    objects
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  log(`💾 Saved ${objects.length} items to versailles-collection.json`);
  log('🎉 Done!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
