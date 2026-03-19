/**
 * Versailles Full Scraper - Fixed Version
 *
 * BUG FIX: Session refresh previously set sessionPageOffset = pageNum - 1,
 * causing PAGING_SCOPE_1 to be calculated as 1 (going to page 1 again) after refresh.
 * 
 * FIX: sessionPageOffset = 0 after each refresh, since PAGING_SCOPE_1 is absolute.
 * The fast-forward loop is removed entirely - we can jump directly to any PAGING_SCOPE_1.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET_URL = 'https://images.grandpalaisrmn.fr/search-result?SEARCHTXT1=Versailles&SEARCHMODE=NEW&CS_FILTER_ASSETS[]=media&CATEGORY[]=271490&EVENT=WEBSHOP_SEARCH';
const OUTPUT_FILE = path.join(__dirname, '../public/data/versailles-collection.json');
const SESSION_CHUNK = 40; // Re-establish session every N pages to avoid token expiry

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
          results.push({ id: mediaNumber, title, imageUrl: thumbSrc, sourceUrl });
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
// Establish fresh session: load base URL and get pagination token
// ─────────────────────────────────────────────────────────────
async function establishSession(page) {
  log('🔄 Establishing fresh session...');
  const ok = await safeGoto(page, TARGET_URL, 'session-init');
  if (!ok) return null;

  await delay(3000);

  // Accept cookies
  try {
    const btn = await page.$('button:has-text("Accepter"), button:has-text("Accept all")');
    if (btn) { await btn.click(); await delay(1500); log('🍪 Accepted cookies'); }
  } catch (e) {}

  // Get total count
  try {
    const countText = await page.$eval('.count-search-results', el => el.textContent);
    const cleaned = countText.replace(/[()]/g, '').replace(/[.,\s]/g, '');
    const match = cleaned.match(/\d+/);
    if (match) log(`📊 Total results: ${parseInt(match[0])}`);
  } catch (e) {}

  // Get session token
  try {
    const nextHref = await page.$eval('.media-item-paging-next a', el => el.getAttribute('href'));
    if (nextHref && nextHref.includes('PAGING_SCOPE_1')) {
      const basePageUrl = nextHref.replace(/&PAGING_SCOPE_1=\d+$/, '');
      log(`🔑 Session token acquired`);
      return basePageUrl;
    }
  } catch (e) {
    log('⚠️ No pagination token found (maybe only 1 page of results)');
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Detail page scraper
// ─────────────────────────────────────────────────────────────
async function scrapeDetailPage(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(400);

    const details = await page.evaluate(() => {
      let title = null, artist = null, date = null, dimensions = null, medium = null;
      const highResImage = document.querySelector('meta[property="og:image"]')?.content || null;

      const isCopyrightInfo = (val) => {
        if (!val) return true;
        const lower = val.toLowerCase();
        return (
          val.includes('©') ||
          lower.includes('all rights reserved') ||
          lower.includes('adagp') || lower.includes('sabam') ||
          lower.includes('vegap') || lower.includes('dacs') ||
          lower.includes('siae') || lower.includes('vg bild-kunst') ||
          lower.includes('rights') || lower.includes('droits') ||
          lower.includes('copyright')
        );
      };

      const previewMetas = document.querySelectorAll('.previewmeta');
      previewMetas.forEach(meta => {
        const legend = meta.querySelector('.previewmeta-legend')?.textContent?.trim()?.toLowerCase() || '';
        const contentEl = meta.querySelector('.previewmeta-content .metadata-value');
        const value = contentEl?.textContent?.trim() || '';
        if (!value) return;
        if (legend.includes('credit') || legend.includes('crédit') ||
            legend.includes('copyright') || legend.includes('droit')) return;
        if ((legend.includes('author') || legend.includes('auteur') || legend.includes('artist')) &&
            !isCopyrightInfo(value)) {
          artist = value;
        }
        if (legend.includes('period') || legend.includes('période') ||
            legend.includes('date') || legend.includes('dating')) {
          date = value;
        }
        if (legend.includes('technique') || legend.includes('medium') ||
            legend.includes('material')) {
          medium = value;
        }
        if (legend.includes('dimension') && !legend.includes('image')) {
          dimensions = value;
        }
      });

      title = document.querySelector('h1')?.textContent?.trim() ||
              document.querySelector('.preview-title')?.textContent?.trim() || null;

      return { title, artist, date, dimensions, medium, highResImage };
    });

    return details;
  } catch (e) {
    return { title: null, artist: null, date: null, dimensions: null, medium: null, highResImage: null };
  }
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
// Main
// ─────────────────────────────────────────────────────────────
async function main() {
  log('🚀 Starting Versailles full scrape (FIXED session refresh)');
  log(`📍 URL: ${TARGET_URL}`);

  // Load existing data (mediaNumber → item map for enrichment merge)
  const existingByMediaNumber = new Map();
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      const items = Array.isArray(existing.objects) ? existing.objects :
                    (Array.isArray(existing) ? existing : []);
      for (const item of items) {
        if (item.mediaNumber) existingByMediaNumber.set(String(item.mediaNumber), item);
      }
      log(`📂 Loaded ${existingByMediaNumber.size} existing items from disk`);
    } catch (e) {
      log(`⚠️ Could not parse existing file: ${e.message}`);
    }
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const allArtworks = new Map();

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    let basePageUrl = await establishSession(page);
    if (!basePageUrl) {
      log('❌ Could not establish session — aborting');
      await browser.close();
      return;
    }

    // Extract page 1 items (already on page 1 after establishSession)
    log('📄 Page 1: Extracting items...');
    await delay(1000);
    const page1Items = await extractPageItems(page);
    let newCount = 0;
    for (const item of page1Items) {
      if (!allArtworks.has(item.id)) { allArtworks.set(item.id, item); newCount++; }
    }
    log(`   Found ${page1Items.length} items, ${newCount} new. Total: ${allArtworks.size}`);

    let pageNum = 2;
    const maxPages = 300;
    let consecutiveNoNew = 0;
    let sessionBaseUrl = basePageUrl;
    // ✅ FIX: sessionPageOffset is always 0 because PAGING_SCOPE_1 is absolute.
    // Each new session token works with the same PAGING_SCOPE_1 values as before.
    // No fast-forward loop needed.

    while (pageNum <= maxPages) {
      // Re-establish session every SESSION_CHUNK pages to prevent token expiry
      if ((pageNum - 1) > 0 && (pageNum - 1) % SESSION_CHUNK === 0) {
        log(`🔄 Session refresh at page ${pageNum} (every ${SESSION_CHUNK} pages)...`);
        const newSessionUrl = await establishSession(page);
        if (!newSessionUrl) {
          log('❌ Failed to re-establish session — stopping');
          break;
        }
        sessionBaseUrl = newSessionUrl;
        // ✅ FIX: No offset adjustment needed. PAGING_SCOPE_1=pageNum works directly.
        log(`   Session refreshed. Next page: PAGING_SCOPE_1=${pageNum}`);
      }

      log(`📄 Page ${pageNum}: Extracting items...`);

      // ✅ FIX: scopeNum = pageNum (absolute, no offset subtraction)
      const absoluteUrl = `https://images.grandpalaisrmn.fr${sessionBaseUrl}&PAGING_SCOPE_1=${pageNum}`;
      const ok = await safeGoto(page, absoluteUrl, `page-${pageNum}`);
      if (!ok) {
        log(`   Failed to load page ${pageNum} — stopping`);
        break;
      }

      await delay(800);
      const items = await extractPageItems(page);
      let newItems = 0;
      for (const item of items) {
        if (!allArtworks.has(item.id)) { allArtworks.set(item.id, item); newItems++; }
      }
      log(`   Found ${items.length} items, ${newItems} new. Total: ${allArtworks.size}`);

      if (items.length === 0) {
        consecutiveNoNew++;
        if (consecutiveNoNew >= 3) {
          log('   3 consecutive empty pages — done');
          break;
        }
      } else if (newItems === 0) {
        consecutiveNoNew++;
        if (consecutiveNoNew >= 5) {
          log('   5 consecutive pages with no new items — done');
          break;
        }
      } else {
        consecutiveNoNew = 0;
      }

      if (pageNum % 20 === 0) {
        log(`   Progress: ${allArtworks.size} items collected`);
        // Intermediate save merged with existing
        intermediateSave(allArtworks, existingByMediaNumber);
      }

      pageNum++;
    }

    log(`📦 Collected ${allArtworks.size} unique new artworks from list pages`);

    // ── Detail enrichment ──────────────────────────────────────
    // Only enrich items not already in existing data with full metadata
    const allArtworksList = Array.from(allArtworks.values());
    const toEnrich = allArtworksList.filter(item => {
      const existing = existingByMediaNumber.get(String(item.id));
      return !(existing && existing.artist && existing.artist !== 'Unknown' && existing.year);
    });

    log(`🔍 Enriching ${toEnrich.length} new items with detail pages (10 parallel)...`);
    const PARALLEL = 10;
    const detailPages = await Promise.all(
      Array.from({ length: PARALLEL }, () => context.newPage())
    );

    let enriched = 0;
    for (let i = 0; i < toEnrich.length; i += PARALLEL) {
      const batch = toEnrich.slice(i, i + PARALLEL);
      await Promise.all(batch.map(async (artwork, idx) => {
        if (artwork.sourceUrl) {
          try {
            const dp = detailPages[idx % PARALLEL];
            const details = await scrapeDetailPage(dp, artwork.sourceUrl);
            if (details.title && /^\d+$/.test(artwork.title)) artwork.title = details.title;
            if (details.artist) artwork.artist = details.artist;
            if (details.date) artwork.date = details.date;
            if (details.dimensions) artwork.dimensions = details.dimensions;
            if (details.medium) artwork.medium = details.medium;
            if (details.highResImage) artwork.imageUrl = details.highResImage;
            enriched++;
          } catch (e) {}
        }
      }));

      const processed = Math.min(i + PARALLEL, toEnrich.length);
      if (processed % 200 < PARALLEL || processed === toEnrich.length) {
        log(`   Enriched ${processed}/${toEnrich.length} (${enriched} successful)`);
        intermediateSave(allArtworks, existingByMediaNumber);
      }
      await delay(100);
    }

    await Promise.all(detailPages.map(p => p.close()));
    log(`✅ Detail enrichment complete: ${enriched}/${toEnrich.length}`);

    await context.close();
  } finally {
    await browser.close();
  }

  // ── Final save with deduplication ─────────────────────────
  log(`🔄 Deduplicating and saving final output...`);

  // Build final merged map
  const finalMerged = new Map(existingByMediaNumber);
  for (const [id, item] of allArtworks) {
    const existing = finalMerged.get(String(id));
    finalMerged.set(String(id), {
      mediaNumber: id,
      title: item.title || existing?.title || 'Untitled',
      image: item.imageUrl || existing?.image || '',
      sourceUrl: item.sourceUrl || existing?.sourceUrl || '',
      artist: (item.artist && item.artist !== 'Unknown') ? item.artist : (existing?.artist || 'Unknown'),
      year: item.date || existing?.year || null,
      medium: item.medium || existing?.medium || 'Painting',
      dimensions: item.dimensions || existing?.dimensions || '',
      type: '2D',
      museum: 'Palace of Versailles'
    });
  }

  const allItems = Array.from(finalMerged.values());
  log(`   Total before dedup: ${allItems.length}`);

  const seen = new Set();
  const deduped = allItems.filter(item => {
    const key = normalizeTitle(item.title || '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  log(`   After dedup: ${deduped.length} (removed ${allItems.length - deduped.length})`);

  const objects = deduped.map((item, idx) => ({
    id: `versailles-collection-${idx + 1}`,
    mediaNumber: item.mediaNumber,
    title: item.title || 'Untitled',
    artist: item.artist || 'Unknown',
    year: item.year || null,
    medium: item.medium || 'Painting',
    dimensions: item.dimensions || '',
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
  log(`💾 Final save: ${objects.length} items in versailles-collection.json`);
}

function intermediateSave(allArtworks, existingByMediaNumber) {
  const merged = new Map(existingByMediaNumber);
  for (const [id, item] of allArtworks) {
    const existing = merged.get(String(id));
    merged.set(String(id), {
      ...(existing || { type: '2D', museum: 'Palace of Versailles' }),
      mediaNumber: id,
      title: item.title || existing?.title || 'Untitled',
      image: item.imageUrl || existing?.image || '',
      sourceUrl: item.sourceUrl || existing?.sourceUrl || '',
      artist: (item.artist && item.artist !== 'Unknown') ? item.artist : (existing?.artist || 'Unknown'),
      year: item.date || existing?.year || null,
      medium: item.medium || existing?.medium || 'Painting',
      dimensions: item.dimensions || existing?.dimensions || '',
    });
  }
  const objects = Array.from(merged.values()).map((item, idx) => ({
    id: `versailles-collection-${idx + 1}`,
    mediaNumber: item.mediaNumber,
    title: item.title || 'Untitled',
    artist: item.artist || 'Unknown',
    year: item.year || null,
    medium: item.medium || 'Painting',
    dimensions: item.dimensions || '',
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
  const OUTPUT_FILE = require('path').join(__dirname, '../public/data/versailles-collection.json');
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
