/**
 * Guggenheim Bilbao — Collection Works Scraper
 *
 * Target URL:
 *   https://www.guggenheim-bilbao.eus/en/the-collection/works
 *
 * Collects (per artwork):
 * - Title, artist, date
 * - Artwork type, categories, description
 * - Medium, dimensions, location
 * - All available metadata
 * - Images with source page URL
 * - Detail page links (for lightbox navigation)
 *
 * Output:
 * - public/data/guggenheim-bilbao-collection.json
 * - downloads/guggenheim-bilbao-progress.json (resume)
 * - downloads/guggenheim-bilbao-scrape.log
 *
 * Env vars:
 * - TEST_MODE=1               (test with first 10 items)
 * - MAX_ITEMS=100             (limit number of items to scrape)
 * - CONCURRENCY=6             (detail fetching concurrency)
 * - REQUEST_DELAY_MS=150      (delay after each detail fetch)
 * - MAX_RETRIES=3             (retry failed requests)
 * - MAX_SEE_MORE_CLICKS=50    (max times to click "see more")
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

const pLimitImport = require('p-limit');
const pLimit = typeof pLimitImport === 'function' ? pLimitImport : pLimitImport?.default;

const BASE_URL = 'https://www.guggenheim-bilbao.eus';
const COLLECTION_URL = 'https://www.guggenheim-bilbao.eus/en/the-collection/works';

const TEST_MODE = process.env.TEST_MODE === '1';
const MAX_ITEMS = process.env.MAX_ITEMS ? Number(process.env.MAX_ITEMS) : null;
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 150);
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 3);
const MAX_SEE_MORE_CLICKS = Number(process.env.MAX_SEE_MORE_CLICKS || 200);

const OUTPUT_FILE = process.env.OUT_FILE
  ? path.resolve(process.env.OUT_FILE)
  : path.join(__dirname, '../public/data/guggenheim-bilbao-collection.json');

const PROGRESS_FILE = process.env.PROGRESS_FILE
  ? path.resolve(process.env.PROGRESS_FILE)
  : path.join(__dirname, '../downloads/guggenheim-bilbao-progress.json');

const LOG_FILE = process.env.LOG_FILE
  ? path.resolve(process.env.LOG_FILE)
  : path.join(__dirname, '../downloads/guggenheim-bilbao-scrape.log');

const ensureDir = (filePath) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

ensureDir(LOG_FILE);

const log = (message) => {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, `${line}\n`);
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const normalizeWs = (s) => (s || '').replace(/\s+/g, ' ').trim();

const toAbsUrl = (href) => {
  if (!href) return '';
  try {
    return new URL(href, BASE_URL).toString();
  } catch {
    return '';
  }
};

const uniqStrings = (arr) => {
  const out = [];
  const seen = new Set();
  for (const v of arr || []) {
    const s = String(v || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
};

const loadProgress = () => {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch {}
  return {
    version: 1,
    startedAt: new Date().toISOString(),
    collectionUrl: COLLECTION_URL,
    list: {
      itemsByUrl: {}
    },
    details: {
      processedByUrl: {},
      errorsByUrl: {}
    }
  };
};

const saveProgress = (progress) => {
  ensureDir(PROGRESS_FILE);
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
};

const fetchText = async (url) => {
  const headers = {
    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    'accept-language': 'en-US,en;q=0.9',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
  };

  let lastErr;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      await delay(500 + attempt * 1000);
    }
  }
  throw lastErr;
};

const fetchListWithPuppeteer = async () => {
  log('Launching browser to click "See More" button...');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36');
    
    log(`Navigating to: ${COLLECTION_URL}`);
    await page.goto(COLLECTION_URL, { 
      waitUntil: 'networkidle0',
      timeout: 60000 
    });
    
    // Wait for initial content to load
    await page.waitForSelector('a[href*="/the-collection/works/"]', { timeout: 10000 });
    
    let clicks = 0;
    let previousCount = 0;
    let noChangeCount = 0;
    const MAX_NO_CHANGE = 3; // 연속 3번 작품 수가 안 바뀌면 중단
    
    while (clicks < MAX_SEE_MORE_CLICKS) {
      // Scroll to bottom first to ensure button is visible
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(1000);
      
      // Count current artworks
      const currentCount = await page.$$eval('a[href*="/the-collection/works/"]', links => links.length);
      
      log(`Current artworks loaded: ${currentCount} (click #${clicks})`);
      
      // Check if count increased
      if (currentCount > previousCount) {
        noChangeCount = 0; // Reset counter if count increased
      } else if (clicks > 0) {
        noChangeCount++;
        if (noChangeCount >= MAX_NO_CHANGE) {
          log(`No new artworks loaded for ${MAX_NO_CHANGE} attempts, stopping.`);
          break;
        }
      }
      
      previousCount = currentCount;
      
      // Look for "See More" button - try multiple selectors
      const seeMoreButton = await page.evaluate(() => {
        // Try various text patterns
        const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
        const seeMoreBtn = buttons.find(btn => {
          const text = btn.textContent.toLowerCase().trim();
          return text.includes('see more') || 
                 text.includes('load more') || 
                 text.includes('show more') ||
                 text.includes('ver más') ||
                 text.includes('más obras');
        });
        
        if (seeMoreBtn) {
          return {
            found: true,
            text: seeMoreBtn.textContent.trim(),
            visible: seeMoreBtn.offsetParent !== null,
            disabled: seeMoreBtn.disabled || seeMoreBtn.getAttribute('aria-disabled') === 'true'
          };
        }
        
        return { found: false };
      });
      
      if (!seeMoreButton.found) {
        log('No "See More" button found, all artworks loaded.');
        break;
      }
      
      if (seeMoreButton.disabled) {
        log('See More button is disabled, all artworks loaded.');
        break;
      }
      
      log(`Clicking "See More" button: "${seeMoreButton.text}"`);
      
      // Scroll to button and click it
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
        const seeMoreBtn = buttons.find(btn => {
          const text = btn.textContent.toLowerCase().trim();
          return text.includes('see more') || 
                 text.includes('load more') || 
                 text.includes('show more') ||
                 text.includes('ver más') ||
                 text.includes('más obras');
        });
        
        if (seeMoreBtn) {
          // Scroll into view
          seeMoreBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          seeMoreBtn.click();
        }
      });
      
      // Wait for new content to load
      await delay(2500);
      
      // Wait for network to be idle
      try {
        await page.waitForNetworkIdle({ timeout: 8000 });
      } catch {
        // Continue even if timeout
      }
      
      // Additional wait to ensure content is loaded
      await delay(1000);
      
      clicks++;
    }
    
    // Get final HTML
    const html = await page.content();
    await browser.close();
    
    return html;
  } catch (err) {
    await browser.close();
    throw err;
  }
};

const parseListItems = (html) => {
  const $ = cheerio.load(html);
  const items = [];

  // Look for artwork links in the grid
  $('a[href*="/the-collection/works/"]').each((_, link) => {
    const $link = $(link);
    const detailUrl = toAbsUrl($link.attr('href') || '');
    
    if (!detailUrl || items.some(i => i.detailUrl === detailUrl)) return;
    
    items.push({
      detailUrl
    });
  });

  log(`Found ${items.length} unique artworks on list page`);
  return items;
};

const extractJsonLd = (html) => {
  const $ = cheerio.load(html);
  const scripts = [];
  
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || '{}');
      scripts.push(data);
    } catch {}
  });
  
  return scripts;
};

const pickDateText = (raw) => {
  const s = normalizeWs(raw);
  if (!s) return '';
  // Prefer ranges like 1952–53, 1952-1953
  const range = s.match(/\b\d{4}\s*[–-]\s*\d{2,4}\b/);
  if (range) return normalizeWs(range[0].replace(/\s+/g, ' '));
  const year = s.match(/\b\d{4}\b/);
  if (year) return year[0];
  return s;
};

const readLinkLabel = ($el) => {
  const txt = normalizeWs($el.text());
  if (txt) return txt;
  const title = normalizeWs($el.attr('title'));
  if (title) return title;
  const aria = normalizeWs($el.attr('aria-label'));
  if (aria) return aria;
  return '';
};

const parseDetailPage = (html, detailUrl) => {
  const $ = cheerio.load(html);

  // Extract JSON-LD structured data
  const jsonLdScripts = extractJsonLd(html);
  
  // Extract images from JSON-LD
  const jsonLdImages = [];
  for (const item of jsonLdScripts) {
    const arr = Array.isArray(item) ? item : [item];
    for (const obj of arr) {
      if (obj.image) {
        if (typeof obj.image === 'string') {
          jsonLdImages.push(obj.image);
        } else if (Array.isArray(obj.image)) {
          jsonLdImages.push(...obj.image.map(img => typeof img === 'string' ? img : img.url || img['@id'] || ''));
        } else if (obj.image.url) {
          jsonLdImages.push(obj.image.url);
        }
      }
    }
  }

  // Scope parsing to the work details container when present (avoid global i18n/filter text)
  const $workRoot = $('[class*="WorkDetails"], [class*="WorkDetail"], main').first();
  const $scope = $workRoot.length ? $workRoot : $.root();

  // Helpers to read labeled fields that appear as label/value blocks
  const labelSelectors = ['strong', 'b', 'h6', 'p', 'span', 'dt'];
  const findLabeledValue = (label) => {
    const lowered = label.toLowerCase();
    const el = $scope
      .find(labelSelectors.join(','))
      .filter((_, node) => normalizeWs($(node).text()).toLowerCase() === lowered)
      .first();
    if (!el.length) return '';

    // Prefer sibling text (next element) or next text node
    const sibling = el.next();
    if (sibling.length) {
      const val = normalizeWs(sibling.text());
      if (val) return val;
    }

    const parentNext = el.parent().next();
    if (parentNext.length) {
      const val = normalizeWs(parentNext.text());
      if (val) return val;
    }

    // Fallback to text directly after the element
    const raw = normalizeWs(el.parent().text().replace(el.text(), ''));
    return raw;
  };

  // Extract artist and title
  let artist = '';
  let title = '';

  // Artist is in a link to /the-collection/artists/ (often has title attr but no text)
  $scope.find('a[href*="/the-collection/artists/"]').each((_, el) => {
    if (artist) return;
    const $el = $(el);
    const label = readLinkLabel($el);
    if (!label) return;
    if (/^(artworks|collection|artists|home|back|previous|next)$/i.test(label)) return;
    if (label.length > 1 && label.length < 120) artist = label;
  });
  if (!artist) {
    $scope.find('a[href*="/artists/"]').each((_, el) => {
      if (artist) return;
      const $el = $(el);
      const label = readLinkLabel($el);
      if (!label) return;
      if (/^(artworks|collection|artists|home|back|previous|next)$/i.test(label)) return;
      if (label.length > 1 && label.length < 120) artist = label;
    });
  }

  title = normalizeWs($scope.find('h1').first().text()) || normalizeWs($('h1').first().text());

  // Try to extract from meta tags
  const ogTitle = $('meta[property="og:title"]').attr('content') || '';
  const ogDescription = $('meta[property="og:description"]').attr('content') || '';
  const ogImage = $('meta[property="og:image"]').attr('content') || '';

  // Fallback title/artist from og:title pattern: "Title | Artist | Guggenheim Bilbao Museoa"
  if ((!title || !artist) && ogTitle.includes('|')) {
    const parts = ogTitle.split('|').map((p) => normalizeWs(p));
    if (!title && parts[0]) title = parts[0];
    // Artist is typically the second part, but skip if it contains "Guggenheim"
    if (!artist && parts[1] && !/guggenheim/i.test(parts[1])) {
      artist = parts[1];
    }
  }

  // Skip invalid artist values (these are on-view status, not artist names)
  if (artist && /currently|on view|gallery \d+/i.test(artist)) {
    artist = '';
  }

  // Labeled fields
  const originalTitle = findLabeledValue('Original title');
  const dateLabel = findLabeledValue('Date');
  const medium = findLabeledValue('Medium/Materials') || findLabeledValue('Medium');
  const dimensions = findLabeledValue('Dimensions');
  const creditLine = findLabeledValue('Credit line');

  // Preserve full date range (e.g. 1952–53)
  const date = pickDateText(dateLabel);

  // Location / gallery info
  const location = (() => {
    const m1 = $('body').text().match(/Currently on view \(([^)]+)\)/i);
    if (m1) return normalizeWs(m1[1]);
    const m2 = $('body').text().match(/Gallery (\d+)/i);
    if (m2) return `Gallery ${m2[1]}`;
    return '';
  })();

  // Description: take first substantial paragraphs in the work content (avoid menus)
  const paragraphs = [];
  $scope.find('p').each((_, p) => {
    const text = normalizeWs($(p).text());
    if (text.length > 120 && !/cookies|©/i.test(text)) paragraphs.push(text);
  });
  const description = paragraphs.slice(0, 3).join('\n\n') || ogDescription;

  // Images: collect only artwork-related images
  const images = [];
  const seenUrls = new Set();

  // Priority 1: og:image (most reliable)
  if (ogImage) {
    const url = toAbsUrl(ogImage);
    if (url && !seenUrls.has(url)) {
      images.push({ url, source: 'og:image', sourcePageUrl: detailUrl, alt: '' });
      seenUrls.add(url);
    }
  }
  
  // Priority 1.5: Images from JSON-LD (also reliable)
  for (const imgUrl of jsonLdImages) {
    const url = toAbsUrl(imgUrl);
    if (url && !seenUrls.has(url) && url.includes('cms.guggenheim-bilbao.eus')) {
      images.push({ url, source: 'json-ld', sourcePageUrl: detailUrl, alt: '' });
      seenUrls.add(url);
    }
  }

  // Priority 2: Images in main artwork content area
  // Look for images in specific containers that contain the artwork
  const $mainContent = $scope.find('article, [class*="WorkDetail"], [class*="WorkContent"], [class*="Content"], main article, main [class*="detail"]').first();
  const $imageScope = $mainContent.length > 0 ? $mainContent : $scope;
  
  // Find images in the artwork content area, excluding navigation/related items
  $imageScope.find('img[src*="cms.guggenheim-bilbao.eus"]').each((_, img) => {
    const $img = $(img);
    const src = $img.attr('src') || $img.attr('data-src') || '';
    if (!src) return;
    
    // Skip logos, icons, placeholders
    if (/logo|icon|placeholder|avatar/i.test(src)) return;
    
    // Skip artist portraits / artist cards
    if ($img.parents('a[href*="/the-collection/artists/"]').length) return;
    
    // Skip images in navigation, footer, header areas
    if ($img.parents('nav, header, footer, [class*="Nav"], [class*="Header"], [class*="Footer"]').length) return;
    
    // Skip very small images (likely icons)
    const width = $img.attr('width');
    const height = $img.attr('height');
    if (width && parseInt(width) < 200 && height && parseInt(height) < 200) return;
    
    const url = toAbsUrl(src);
    if (!url || seenUrls.has(url)) return;
    
    const alt = normalizeWs($img.attr('alt') || '');
    
    images.push({
      url,
      source: 'cms-image',
      sourcePageUrl: detailUrl,
      alt
    });
    seenUrls.add(url);
  });

  // Filter images: prioritize og:image and JSON-LD images, then filter by alt text matching
  const titleLower = (title || '').toLowerCase();
  const artistLower = (artist || '').toLowerCase();
  
  // Separate images by source priority
  const priorityImages = images.filter(img => img.source === 'og:image' || img.source === 'json-ld');
  const otherImages = images.filter(img => img.source !== 'og:image' && img.source !== 'json-ld');
  
  // For other images, filter by alt text matching the artwork title/artist
  const matchingImages = otherImages.filter((img) => {
    if (!img.alt || !titleLower) return false;
    const altLower = img.alt.toLowerCase();
    
    // If alt contains "|", format is likely "Title | Artist | Museum"
    if (altLower.includes('|')) {
      const altParts = altLower.split('|').map(p => p.trim());
      const altTitle = altParts[0] || '';
      // Check if the first part (title) matches our title
      if (altTitle && titleLower && altTitle.includes(titleLower)) {
        return true;
      }
    } else {
      // No pipe format, check if alt contains the title
      if (altLower.includes(titleLower)) {
        return true;
      }
    }
    return false;
  });
  
  // Combine: priority images first, then matching images, limit to 6 total
  const finalImages = [...priorityImages, ...matchingImages].slice(0, 6);

  // Categories/tags: read from the per-work toolbar buttons (avoid global filters/i18n blobs)
  const categories = [];
  const $toolbar = $scope.find('div[class*="ContentToolbar_contentToolbarFilter"]').first();
  $toolbar.find('button[data-filter-type="filters"], a[data-filter-type="filters"]').each((_, el) => {
    const $el = $(el);
    const label = normalizeWs($el.attr('title')) || normalizeWs($el.attr('aria-label')) || normalizeWs($el.text());
    if (!label) return;
    // Filter out any non-tag UI text
    if (/^filters$/i.test(label)) return;
    // Drop i18n/translation keys that sometimes appear in SSR markup
    if (/^filters\./i.test(label)) return;
    if (label.includes('.') && !label.includes(' ')) return;
    categories.push(label);
  });

  // Artwork type inference
  let artworkType = '';
  const mediumForType = medium || ogDescription;
  if (mediumForType) {
    if (/painting|oil|acrylic|canvas/i.test(mediumForType)) artworkType = 'Painting';
    else if (/sculpture|bronze|steel|metal/i.test(mediumForType)) artworkType = 'Sculpture';
    else if (/installation/i.test(mediumForType)) artworkType = 'Installation';
    else if (/video|film/i.test(mediumForType)) artworkType = 'Video';
    else if (/photograph|photo|print/i.test(mediumForType)) artworkType = 'Photography';
    else artworkType = mediumForType.split(/[,;]/)[0];
  }

  const metadata = {};
  if (originalTitle) metadata['Original title'] = originalTitle;
  if (date) metadata.Date = date;
  if (medium) metadata['Medium/Materials'] = medium;
  if (dimensions) metadata.Dimensions = dimensions;
  if (creditLine) metadata['Credit line'] = creditLine;
  if (location) metadata.Location = location;

  return {
    detailUrl,
    title: title || ogTitle,
    artist,
    date,
    medium,
    dimensions,
    artworkType,
    description,
    location,
    categories: uniqStrings(categories),
    images: finalImages.filter((img) => img.url),
    metadata,
    jsonLd: jsonLdScripts,
    scrapedAt: new Date().toISOString()
  };
};

async function main() {
  log('='.repeat(80));
  log(`Guggenheim Bilbao Collection Scraper ${TEST_MODE ? '(TEST MODE)' : ''}`);
  log(`Collection URL: ${COLLECTION_URL}`);
  log(`Concurrency: ${CONCURRENCY}, Delay: ${REQUEST_DELAY_MS}ms`);
  log('='.repeat(80));

  const progress = loadProgress();
  
  // Step 1: Fetch list page with Puppeteer (clicking "See More")
  log('Fetching collection list page with Puppeteer...');
  const listHtml = await fetchListWithPuppeteer();
  const listItems = parseListItems(listHtml);
  
  log(`Found ${listItems.length} artworks in collection`);
  
  // Update progress with list items
  for (const item of listItems) {
    if (!progress.list.itemsByUrl[item.detailUrl]) {
      progress.list.itemsByUrl[item.detailUrl] = item;
    }
  }
  
  saveProgress(progress);
  
  // Prepare items to fetch details for
  const allUrls = Object.keys(progress.list.itemsByUrl);
  const toFetch = allUrls.filter(url => !progress.details.processedByUrl[url]);
  
  let limitedToFetch = toFetch;
  
  if (TEST_MODE) {
    limitedToFetch = toFetch.slice(0, 10);
    log(`TEST MODE: Processing first ${limitedToFetch.length} items`);
  } else if (MAX_ITEMS) {
    limitedToFetch = toFetch.slice(0, MAX_ITEMS);
    log(`MAX_ITEMS set: Processing ${limitedToFetch.length} items`);
  }
  
  log(`Will fetch details for ${limitedToFetch.length} artworks (${toFetch.length - limitedToFetch.length} already processed)`);
  
  // Step 2: Fetch detail pages
  const limit = pLimit(CONCURRENCY);
  let processed = 0;
  let errors = 0;
  
  const tasks = limitedToFetch.map((url, idx) =>
    limit(async () => {
      try {
        log(`[${idx + 1}/${limitedToFetch.length}] Fetching: ${url}`);
        const html = await fetchText(url);
        const detail = parseDetailPage(html, url);
        
        progress.details.processedByUrl[url] = detail;
        processed++;
        
        // Save progress periodically
        if (processed % 10 === 0) {
          saveProgress(progress);
          log(`Progress saved: ${processed}/${limitedToFetch.length} processed`);
        }
        
        await delay(REQUEST_DELAY_MS);
      } catch (err) {
        errors++;
        log(`ERROR fetching ${url}: ${err.message}`);
        progress.details.errorsByUrl[url] = {
          error: err.message,
          timestamp: new Date().toISOString()
        };
      }
    })
  );
  
  await Promise.all(tasks);
  
  saveProgress(progress);
  
  // Step 3: Compile final output
  const artworks = Object.values(progress.details.processedByUrl);
  
  const output = {
    museum: 'Guggenheim Museum Bilbao',
    museumUrl: 'https://www.guggenheim-bilbao.eus/',
    collectionUrl: COLLECTION_URL,
    scrapedAt: new Date().toISOString(),
    totalArtworks: artworks.length,
    artworks
  };
  
  ensureDir(OUTPUT_FILE);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  
  log('='.repeat(80));
  log(`✓ Scraping complete!`);
  log(`  Total artworks: ${artworks.length}`);
  log(`  Errors: ${errors}`);
  log(`  Output: ${OUTPUT_FILE}`);
  log(`  Progress: ${PROGRESS_FILE}`);
  log('='.repeat(80));
}

module.exports = {
  fetchText,
  fetchListWithPuppeteer,
  parseListItems,
  parseDetailPage
};

if (require.main === module) {
  main().catch((err) => {
    log(`FATAL ERROR: ${err.message}`);
    console.error(err);
    process.exit(1);
  });
}
