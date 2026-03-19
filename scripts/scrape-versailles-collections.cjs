/**
 * Versailles Collections Scraper (collections.chateauversailles.fr)
 *
 * Uses the CollectionConnection API from collections.chateauversailles.fr
 * to get stable image URLs. Image URLs via cc/imageproxy.ashx do NOT expire.
 *
 * Strategy:
 *   1. Load the page with Playwright to capture the authToken from a search POST
 *   2. Paginate through all results using the captured authToken
 *   3. Build stable image URLs: https://collections.chateauversailles.fr/cc/imageproxy.ashx?filename=FILENAME&bg=e8e8e8&width=800&height=800
 *
 * Usage: node scripts/scrape-versailles-collections.cjs
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://collections.chateauversailles.fr';
// Search URL for paintings - using the search hash
const SEARCH_PAGE = `${BASE_URL}/#query=searchall=*%26query=sort=Relevance%26showtype=icons`;
const OUTPUT_FILE = path.join(__dirname, '../public/data/versailles-collection.json');
const PAGE_SIZE = 100;

const delay = ms => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const log = msg => console.log(`[${ts()}] ${msg}`);

// Build stable image URL from filename
// Build stable image URL from filename (supports .cci and other formats)
function buildImageUrl(filename) {
  if (!filename) return '';
  // Full URL via imageproxy.aspx
  return `${BASE_URL}/cc/imageproxy.aspx?filename=${encodeURIComponent(filename)}&width=800&height=800&borderwidth=0`;
}

// Build stable detail page URL from record id
function buildDetailUrl(id) {
  if (!id) return '';
  return `${BASE_URL}/#id=${encodeURIComponent(id)}`;
}

async function main() {
  log('🚀 Starting Versailles collections scraper');
  log('📡 Source: collections.chateauversailles.fr');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  // ── Step 1: Capture auth token and first search response via event listeners ──
  let capturedAuthToken = null;
  let capturedSearchSpec = null;
  let capturedResponseData = null;

  page.on('request', req => {
    if (req.url().includes('ccConnector.asmx/search') && capturedAuthToken === null) {
      try {
        const body = req.postDataJSON();
        if (body) {
          capturedAuthToken = body.authToken !== undefined ? body.authToken : null;
          capturedSearchSpec = body.searchSpec || null;
          log(`🔑 Captured authToken from request: "${String(capturedAuthToken).substring(0, 30)}" searchSpec=${!!capturedSearchSpec}`);
        }
      } catch (e) {}
    }
  });

  page.on('response', async resp => {
    if (resp.url().includes('ccConnector.asmx/search') && !capturedResponseData) {
      try {
        capturedResponseData = await resp.json();
        log(`📦 Captured first search response`);
      } catch (e) {}
    }
  });

  log('🌐 Loading collections page...');
  try {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    log(`⚠️ Load warn: ${e.message.split('\n')[0]}`);
  }
  await delay(2000);

  // Trigger the Angular router to make a search
  log('🔎 Triggering search...');
  await page.evaluate(() => {
    window.location.hash = '#query=searchall=*&query=sort=Relevance&showtype=icons';
  });
  await delay(6000);

  if (!capturedResponseData) {
    log('🔄 Trying click on search menu...');
    try {
      await page.click('#articlemenu_recherche', { timeout: 3000 });
      await delay(4000);
    } catch (e) {
      log(`⚠️ Click failed: ${e.message.split('\n')[0]}`);
    }
  }

  if (capturedAuthToken === null) {
    log('🔄 Trying to extract authToken from Angular scope...');
    capturedAuthToken = await page.evaluate(() => {
      try {
        const scopes = document.querySelectorAll('.ng-scope');
        for (const s of scopes) {
          const scope = angular.element(s).scope();
          if (scope && scope.$root && scope.$root.userdata) return scope.$root.userdata.authToken || null;
          if (scope && scope.userdata) return scope.userdata.authToken || null;
        }
        return null;
      } catch (e) { return null; }
    });
    log(`🔑 Angular scope authToken: "${capturedAuthToken}"`);
  }

  // authToken can be empty string for public/guest access on this platform
  const authToken = capturedAuthToken !== null ? capturedAuthToken : '';
  log(`✅ Using authToken: "${String(authToken).substring(0, 30)}"  (responseData: ${!!capturedResponseData})`);
  if (capturedSearchSpec) {
    log(`📋 Captured searchSpec keys: ${Object.keys(capturedSearchSpec).join(', ')}`);
    log(`📋 SearchSpec: ${JSON.stringify(capturedSearchSpec).substring(0, 500)}`);
  }

  // ── Step 2: Parse first search response or probe API ──
  log('📊 Analyzing search results...');
  let searchSpec = capturedSearchSpec || null;
  let totalItems = 0;
  let sampleResult = capturedResponseData;

  // The CC API returns: { resultCount, result: '<html>', refreshedAuthToken, metaTagId, ... }
  // 'result' is an HTML string containing rendered items, NOT a JSON array.
  // We need to parse the HTML to extract image filenames and metadata.

  let currentAuthToken = authToken;

  // Parse CC API response: extract HTML result items
  const parseApiResp = (raw) => {
    if (!raw || raw.error) return null;
    const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
    // Unwrap ASP.NET WebMethod .d wrapper (may be a JSON string)
    const inner = d.d !== undefined ? (typeof d.d === 'string' ? JSON.parse(d.d) : d.d) : d;
    if (inner.Message && inner.ExceptionType) { log(`API error: ${inner.Message}`); return null; }
    // Update auth token if refreshed
    if (inner.refreshedAuthToken) currentAuthToken = inner.refreshedAuthToken;
    return {
      total: inner.resultCount || inner.totalHits || inner.count || 0,
      html: inner.result || '',
      raw: inner
    };
  };

  // Parse items from HTML result using regex
  const parseItemsFromHtml = (html) => {
    if (!html) return [];
    const items = [];
    // Extract imageproxy.ashx filename params
    const imgRegex = /imageproxy\.ashx[^"']*filename=([^&"'\s]+)/g;
    // Extract record IDs from links: #id=XXXX
    const idRegex = /#id=([^"'&\s]+)/g;
    // Extract titles from alt text or data-title
    const titleRegex = /data-title="([^"]+)"|alt="([^"]+)"/g;
    const imgFilenames = [];
    let m;
    while ((m = imgRegex.exec(html)) !== null) imgFilenames.push(decodeURIComponent(m[1]));
    const recordIds = [];
    while ((m = idRegex.exec(html)) !== null) recordIds.push(decodeURIComponent(m[1]));
    const titles = [];
    while ((m = titleRegex.exec(html)) !== null) titles.push(m[1] || m[2] || '');
    // Build items from the collected data
    const count = Math.max(imgFilenames.length, recordIds.length);
    for (let i = 0; i < count; i++) {
      items.push({
        filename: imgFilenames[i] || '',
        id: recordIds[i] || '',
        title: titles[i] || '',
      });
    }
    return items;
  };

  // Make API call from page context (MUST use single arg to page.evaluate)
  // CC platform uses: first (1-based start), numPerPage
  const PER_PAGE = 100;
  const apiSearch = async (firstRecord) => {
    const spec = { ...capturedSearchSpec, first: firstRecord, numPerPage: PER_PAGE };
    const args = { authToken: currentAuthToken, searchSpec: spec, baseUrl: BASE_URL };
    return page.evaluate(async (args) => {
      try {
        const r = await fetch(`${args.baseUrl}/cc/ccConnector.asmx/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authToken: args.authToken, searchSpec: args.searchSpec }),
          credentials: 'include'
        });
        return r.json();
      } catch (e) { return { error: e.message }; }
    }, args);
  };

  // Parse first captured response
  if (sampleResult) {
    log(`🔍 sampleResult type: ${typeof sampleResult}`);
    if (typeof sampleResult === 'object') {
      log(`Keys: ${Object.keys(sampleResult).join(', ')}`);
      log(`resultCount: ${sampleResult.resultCount}, result: ${String(sampleResult.result||'').substring(0,100)}`);
    }
    const p = parseApiResp(sampleResult);
    if (p) {
      totalItems = p.total;
      const htmlItems = parseItemsFromHtml(p.html);
      log(`📊 Total: ${totalItems}, HTML items found: ${htmlItems.length}`);
      if (htmlItems.length > 0) {
        log(`Sample HTML item: ${JSON.stringify(htmlItems[0])}`);
      } else {
        log(`HTML snippet: ${p.html.substring(0, 400)}`);
      }
    }
  }

  // Probe if still no total
  if (totalItems === 0) {
    log('🔄 Probing API for total count...');
    const probe = await apiSearch(0, 3);
    const p = parseApiResp(probe);
    if (p) {
      totalItems = p.total;
      const htmlItems = parseItemsFromHtml(p.html);
      log(`📊 Total (probe): ${totalItems}, items: ${htmlItems.length}`);
      log(`HTML snippet: ${p.html.substring(0, 500)}`);
    } else if (probe?.Message) {
      log(`API says: ${probe.Message}`);
    }
  }

  if (totalItems === 0) {
    log('⚠️ Could not determine total. Aborting.');
    await browser.close();
    process.exit(1);
  }

  log(`📊 Total items: ${totalItems}`);

  // ── Step 3: Paginate and collect raw HTML item data ──
  // We'll parse the HTML on the page using DOMParser to get structured data
  const allItems = [];

  // Helper: parse items from HTML using page context (for proper DOM parsing)
  const extractItemsFromPage = async (html) => {
    return page.evaluate((htmlStr) => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div id="cc-results">${htmlStr}</div>`, 'text/html');
      const container = doc.getElementById('cc-results');
      const results = [];

      // Look for links and images in the results
      const links = container.querySelectorAll('a[href*="#id="], a[data-id]');
      const imgElements = container.querySelectorAll('img[src*="imageproxy"]');

      // Build a map of image src to filename
      const imgMap = [];
      imgElements.forEach(img => {
        const src = img.src || img.getAttribute('src') || '';
        const mFilename = src.match(/filename=([^&"'\s]+)/);
        const filename = mFilename ? decodeURIComponent(mFilename[1]) : '';
        const title = img.alt || img.getAttribute('data-title') || '';
        imgMap.push({ filename, title, src });
      });

      // Get record IDs from links
      const idMap = [];
      links.forEach(link => {
        const href = link.href || link.getAttribute('href') || '';
        const mId = href.match(/#id=([^&"'\s]+)/);
        const id = mId ? decodeURIComponent(mId[1]) : '';
        const title = link.getAttribute('title') || link.textContent?.trim() || '';
        idMap.push({ id, title });
      });

      // Try to combine: pair each image with its nearest record ID
      const count = Math.max(imgMap.length, idMap.length);
      for (let i = 0; i < count; i++) {
        const img = imgMap[i] || {};
        const rec = idMap[i] || {};
        const title = img.title || rec.title || '';
        if (img.filename || rec.id) {
          results.push({ filename: img.filename || '', id: rec.id || '', title });
        }
      }

      return results;
    }, html);
  };

  // Also try a simpler regex-based extraction (faster)
  const extractItemsRegex = (html) => {
    if (!html) return [];
    const items = [];
    // Match imageproxy.aspx filenames — include spaces (MV 1234.cci formats), stop at & or quote
    const imgRegex = /imageproxy\.aspx[^"']*filename=([^&"']+)/g;
    // Match jumpToRecord('N') for record IDs
    const recIdRegex = /jumpToRecord\('?([^'"\)]+)'?\)/g;
    // Match title/alt text in img elements
    const titleRegex = /ng-click="jumpToRecord[^"]*"\s+alt="([^"]*)"/g;
    
    const imgFilenames = [];
    let m;
    while ((m = imgRegex.exec(html)) !== null) {
      const fn = decodeURIComponent(m[1]);
      imgFilenames.push(fn);
    }

    const recordIds = [];
    while ((m = recIdRegex.exec(html)) !== null) recordIds.push(m[1]);

    const titles = [];
    while ((m = titleRegex.exec(html)) !== null) titles.push(m[1] || '');

    log(`  HTML: ${imgFilenames.length} images, ${recordIds.length} record IDs found`);
    if (imgFilenames.length > 0) log(`  Sample filename: ${imgFilenames[0]}`);
    if (recordIds.length > 0) log(`  Sample recordId: ${recordIds[0]}`);
    
    const count = imgFilenames.length; // Only process items that have images
    for (let i = 0; i < count; i++) {
      const fn = imgFilenames[i] || '';
      // Skip "not available" placeholder images
      if (fn.includes('nondisponible') || fn.includes('noimage') || fn.includes('no_image')) continue;
      // Trim whitespace from filename
      const cleanFn = fn.trim();
      // Each image: 3 ng-click events per item in grid
      const recIdIdx = i * 3;
      const recId = recordIds[recIdIdx] || recordIds[i] || '';
      const titleIdx = i * 3;
      const title = titles[titleIdx] || titles[i] || '';
      // Extract inventory number: strip objectimages/ prefix and _NNN.ext suffix
      const inventoryNumber = cleanFn
        .replace(/^objectimages\//, '')
        .replace(/_\d+\.\w+$/, '')                        // strip _008.cci suffix
        .replace(/\.(cci|jpg|jpeg|png|tif|tiff)$/i, '')   // strip bare .cci (no _NNN)
        .trim();
      if (cleanFn) {
        items.push({ filename: cleanFn, id: recId, inventoryNumber, title });
      }
    }
    return { items, rawCount: imgFilenames.length };
  };

  const mapItem = (raw) => {
    const filename = raw.filename || '';
    const recordId = raw.id || '';
    const inventoryNum = raw.inventoryNumber || '';
    const title = raw.title || '';
    // Source URL: use inventory number if available, else record ID
    const sourceId = inventoryNum || recordId;
    const sourceUrl = sourceId ? `${BASE_URL}/#id=${encodeURIComponent(sourceId)}` : BASE_URL;
    return {
      id: `versailles-${allItems.length + 1}`,
      inventoryNumber: inventoryNum,
      title: title || 'Palace of Versailles Artwork',
      artist: '',
      year: 0,
      date: '',
      medium: '',
      department: '',
      image: buildImageUrl(filename),
      sourceUrl,
      museum: 'Palace of Versailles',
      type: '2D',
    };
  };

  const MAX_ITEMS = 5000; // Reasonable limit for this collection
  const totalToFetch = Math.min(totalItems, MAX_ITEMS);
  const totalPages = Math.ceil(totalToFetch / PER_PAGE);
  log(`📄 Fetching up to ${totalToFetch} items in ${totalPages} pages (${PER_PAGE}/page)...`);

  // Pre-load initial captured results (numPerPage=12 from original search)
  const initialNumPerPage = capturedSearchSpec?.numPerPage || 12;
  if (sampleResult) {
    const p = parseApiResp(sampleResult);
    if (p?.html) {
      const { items: htmlItems } = extractItemsRegex(p.html);
      if (htmlItems.length > 0) {
        htmlItems.forEach(item => allItems.push(mapItem(item)));
        log(`  Pre-loaded init: ${allItems.length} items (${htmlItems.length} raw, numPerPage=${initialNumPerPage})`);
        if (allItems.length > 0) log(`  Sample: ${JSON.stringify(allItems[0]).substring(0, 200)}`);
      } else {
        log(`  Init page: no items in HTML`);
      }
    }
  }

  // Paginate: start from where pre-loading left off
  let firstRecord = initialNumPerPage + 1; // Continue after initial page
  let collectedPages = 0;

  while (allItems.length < totalToFetch) {
    const resp = await apiSearch(firstRecord);
    const p = parseApiResp(resp);

    if (!p?.html) {
      log(`  first=${firstRecord}: no response data, stopping`);
      break;
    }

    const { items: htmlItems, rawCount } = extractItemsRegex(p.html);
    if (htmlItems.length === 0 && rawCount === 0) {
      log(`  first=${firstRecord}: empty HTML, stopping`);
      break;
    }

    htmlItems.forEach(item => allItems.push(mapItem(item)));
    collectedPages++;

    if (collectedPages === 1) {
      log(`  first=${firstRecord}: ${htmlItems.length} items (raw=${rawCount}) (sample: ${JSON.stringify(htmlItems[0] || {}).substring(0, 100)})`);
    } else if (collectedPages % 10 === 0) {
      log(`  first=${firstRecord}: total ${allItems.length}/${totalToFetch}`);
    }

    if (rawCount < PER_PAGE) {
      log(`  Last page at first=${firstRecord} (raw=${rawCount}, filtered=${htmlItems.length})`);
      break;
    }
    firstRecord += PER_PAGE;
    await delay(200);
  }

  await browser.close();

  log(`✅ Collected ${allItems.length} items total`);

  if (allItems.length === 0) {
    log('❌ No items collected. HTML may not contain expected patterns.');
    process.exit(1);
  }

  // Filter: only keep items with images
  const withImages = allItems.filter(i => i.image);
  log(`🖼️  Items with images: ${withImages.length}/${allItems.length}`);

  // Dedup by inventoryNumber or image
  const seen = new Map();
  const deduped = withImages.filter(item => {
    const key = item.inventoryNumber || item.image || item.title;
    if (seen.has(key)) return false;
    seen.set(key, true);
    return true;
  });
  log(`🔍 After dedup: ${deduped.length} unique items`);

  // Save
  const output = {
    collection: 'Palace of Versailles',
    museum: 'Palace of Versailles',
    scrapedAt: new Date().toISOString(),
    totalItems: deduped.length,
    objects: deduped
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');
  log(`💾 Saved ${deduped.length} items to ${path.basename(OUTPUT_FILE)}`);
  log('✅ Done!');
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
