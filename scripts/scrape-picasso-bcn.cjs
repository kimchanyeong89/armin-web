/**
 * Museu Picasso Barcelona Collection Scraper
 * 
 * URL: https://museupicassobcn.cat/en/collection/artworks
 * 
 * Collects (per artwork):
 * - Title, artist, date
 * - Object type, categories, description
 * - Medium, dimensions, location
 * - Highlight/On view tags
 * - All available metadata
 * - Images with source page URL
 * - Detail page links (for lightbox navigation)
 * 
 * Output:
 * - public/data/picasso-bcn-collection.json
 * - downloads/picasso-bcn-progress.json (resume)
 * - downloads/picasso-bcn-scrape.log
 * 
 * Env vars:
 * - TEST_MODE=1               (test with 3 pages)
 * - MAX_PAGES=3               (limit number of pages to scrape, default: 3 for test)
 * - CONCURRENCY=6             (detail fetching concurrency)
 * - REQUEST_DELAY_MS=150      (delay after each detail fetch)
 * - MAX_RETRIES=3             (retry failed requests)
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

const pLimitImport = require('p-limit');
const pLimit = typeof pLimitImport === 'function' ? pLimitImport : pLimitImport?.default;

const BASE_URL = 'https://museupicassobcn.cat';
const COLLECTION_URL = 'https://museupicassobcn.cat/en/collection/artworks';

const TEST_MODE = process.env.TEST_MODE === '1';
const MAX_PAGES = process.env.MAX_PAGES ? Number(process.env.MAX_PAGES) : (TEST_MODE ? 3 : null);
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 150);
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 3);

const OUTPUT_FILE = process.env.OUT_FILE
  ? path.resolve(process.env.OUT_FILE)
  : path.join(__dirname, '../public/data/picasso-bcn-collection.json');

const PROGRESS_FILE = process.env.PROGRESS_FILE
  ? path.resolve(process.env.PROGRESS_FILE)
  : path.join(__dirname, '../downloads/picasso-bcn-progress.json');

const LOG_FILE = process.env.LOG_FILE
  ? path.resolve(process.env.LOG_FILE)
  : path.join(__dirname, '../downloads/picasso-bcn-scrape.log');

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
    'accept-language': 'en-US,en;q=0.9,ca;q=0.8,es;q=0.7',
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
  log('Launching browser to fetch list pages...');
  
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
    
    // Wait for initial content
    await delay(2000);
    
    // Get total number of pages if available
    let totalPages = MAX_PAGES || 999;
    try {
      const lastPageLink = await page.$('a.pager__item--last, .pager a:last-of-type');
      if (lastPageLink) {
        const lastPageText = await page.evaluate(el => el.textContent, lastPageLink);
        const match = lastPageText.match(/(\d+)/);
        if (match) {
          totalPages = Math.min(Number(match[1]), MAX_PAGES || 999);
          log(`Detected ${totalPages} total pages (will scrape ${MAX_PAGES || totalPages})`);
        }
      }
    } catch (e) {
      log('Could not determine total pages, will scrape until no more pages');
    }
    
    const allItems = [];
    let currentPage = 1;
    
    while (currentPage <= totalPages) {
      log(`Fetching page ${currentPage}...`);
      
      // Extract artwork links from current page
      const pageItems = await page.$$eval('a[href*="/en/collection/artwork/"]', links => {
        return links.map(link => ({
          href: link.href,
          text: link.textContent.trim()
        })).filter(item => item.href && !item.href.includes('#'));
      });
      
      log(`Found ${pageItems.length} artwork links on page ${currentPage}`);
      
      for (const item of pageItems) {
        const detailUrl = toAbsUrl(item.href);
        if (detailUrl && !allItems.some(i => i.detailUrl === detailUrl)) {
          allItems.push({ detailUrl });
        }
      }
      
      // Check if we should continue
      if (currentPage >= totalPages) {
        log(`Reached maximum pages (${totalPages}), stopping.`);
        break;
      }
      
      // Find next page URL
      const nextPageUrl = await page.evaluate((pageNum) => {
        const pager = document.querySelector('.pager, nav.pager, [class*="pager"], [class*="pagination"]');
        if (!pager) return null;
        
        const links = Array.from(pager.querySelectorAll('a'));
        
        // Try 1: Look for "Next" link
        const nextLink = links.find(a => {
          const text = (a.textContent || '').toLowerCase().trim();
          const aria = (a.getAttribute('aria-label') || '').toLowerCase();
          return (text.includes('next') || text.includes('siguiente') || aria.includes('next')) &&
                 !a.classList.contains('disabled') &&
                 !a.classList.contains('is-disabled') &&
                 a.getAttribute('aria-disabled') !== 'true';
        });
        
        if (nextLink && nextLink.href) {
          return nextLink.href;
        }
        
        // Try 2: Look for page number link
        const nextPageNum = pageNum + 1;
        const pageLink = links.find(a => {
          const text = (a.textContent || '').trim();
          const href = (a.href || '');
          return text === String(nextPageNum) || 
                 href.includes(`page=${nextPageNum}`) ||
                 href.includes(`?page=${nextPageNum}`);
        });
        
        if (pageLink && pageLink.href) {
          return pageLink.href;
        }
        
        return null;
      }, currentPage);
      
      if (!nextPageUrl) {
        log('No next page found, stopping.');
        break;
      }
      
      log(`Navigating to page ${currentPage + 1}: ${nextPageUrl}`);
      
      // Navigate to next page
      try {
        await page.goto(nextPageUrl, { waitUntil: 'networkidle0', timeout: 30000 });
        await delay(1500);
        currentPage++;
      } catch (err) {
        log(`Error navigating to page ${currentPage + 1}: ${err.message}`);
        break;
      }
    }
    
    await browser.close();
    log(`Total unique artworks found: ${allItems.length}`);
    return allItems;
  } catch (err) {
    await browser.close();
    throw err;
  }
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

const parseDetailPage = (html, detailUrl, listMetadata = {}) => {
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

  // Scope parsing
  const $scope = $('main, [class*="artwork"], [class*="detail"], .node').first();
  if (!$scope.length) $scope = $.root();

  // Title
  const title = normalizeWs($scope.find('h1').first().text()) || normalizeWs($('h1').first().text());

  // Helper to extract field value from node-field__wrapper structure
  const getNodeFieldValue = (labelText) => {
    const lowered = labelText.toLowerCase();
    const wrapper = $scope.find('.node-field__wrapper').filter((_, el) => {
      const labelEl = $(el).find('.node-field__label, [class*="__label"]').first();
      const label = normalizeWs(labelEl.text()).toLowerCase();
      return label === lowered || label.includes(lowered);
    }).first();
    
    if (wrapper.length) {
      const content = wrapper.find('.node-field__content, [class*="__content"]').first();
      return normalizeWs(content.text());
    }
    return '';
  };

  // Artist (default to Pablo Picasso for this museum)
  let artist = getNodeFieldValue('Author') || getNodeFieldValue('Autor') || 'Pablo Picasso';

  // Date - try multiple field names
  let date = getNodeFieldValue('Date') || getNodeFieldValue('Fecha') || getNodeFieldValue('Year') || getNodeFieldValue('Año');
  
  // If date is still empty, try to extract from metadata or other fields
  if (!date) {
    const acquisitionData = getNodeFieldValue('Acquisition data') || getNodeFieldValue('Acquisition') || '';
    const yearMatch = acquisitionData.match(/\b(1[89]\d{2}|20\d{2})\b/);
    if (yearMatch) {
      date = yearMatch[1];
    }
  }

  // Medium (extract first, needed for objectType inference)
  const medium = getNodeFieldValue('Medium') || getNodeFieldValue('Técnica');

  // Object type - use from list page metadata, or try to extract from page
  let objectType = (listMetadata && listMetadata.objectTypeFromList) || getNodeFieldValue('Object type') || getNodeFieldValue('Tipo de objeto') || getNodeFieldValue('Type');
  
  // Category/Collection - use from list page metadata, or try to extract from page
  let category = (listMetadata && listMetadata.categoryFromList) || getNodeFieldValue('Category') || getNodeFieldValue('Categoría') || getNodeFieldValue('Collection');
  
  // Try to find Collections section with chip/tag links (Drawing, Painting, Graphic artwork, etc.)
  // Look for <summary>Collections</summary> followed by <div class="chip"> links
  const collectionsSummary = $scope.find('summary').filter((_, el) => {
    const text = normalizeWs($(el).text()).toLowerCase();
    return text.includes('collection');
  }).first();
  
  if (collectionsSummary.length) {
    const collectionsParent = collectionsSummary.parent();
    collectionsParent.find('.chip a, [class*="chip"] a, a[href*="/taxonomy/term/"]').each((_, el) => {
      const $el = $(el);
      const text = normalizeWs($el.text());
      // Common collection types
      if (text && (text === 'Drawing' || text === 'Painting' || text === 'Graphic artwork' || text === 'Ceramics' || text === 'Sculpture' || text === 'Sketchbooks')) {
        if (!category) category = text;
        if (!objectType) {
          // Map collection names to object types
          const typeMap = {
            'Drawing': 'drawing',
            'Painting': 'oil painting',
            'Graphic artwork': 'engravings (prints)',
            'Ceramics': 'pottery (visual works)',
            'Sculpture': 'sculpture (visual work)',
            'Sketchbooks': 'drawing'
          };
          objectType = typeMap[text] || text.toLowerCase();
        }
      }
    });
  }
  
  // Try to infer from medium if objectType is still empty
  if (!objectType && medium) {
    const mediumLower = medium.toLowerCase();
    if (mediumLower.includes('lithograph')) objectType = 'lithographs';
    else if (mediumLower.includes('etching') || mediumLower.includes('engraving')) objectType = 'engravings (prints)';
    else if (mediumLower.includes('drawing') || mediumLower.includes('crayon') || mediumLower.includes('pencil')) objectType = 'drawing';
    else if (mediumLower.includes('oil') || mediumLower.includes('canvas')) objectType = 'oil painting';
    else if (mediumLower.includes('ceramic') || mediumLower.includes('clay')) objectType = 'pottery (visual works)';
    else if (mediumLower.includes('bronze') || mediumLower.includes('sculpture')) objectType = 'sculpture (visual work)';
  }
  
  // Set category from objectType if category is empty
  if (!category && objectType) {
    category = objectType;
  }

  // Dimensions
  const dimensions = getNodeFieldValue('Dimensions') || getNodeFieldValue('Dimensiones');

  // Description
  const description = getNodeFieldValue('Description') || getNodeFieldValue('Descripción') || normalizeWs($scope.find('.field--name-body, .field-body, [class*="description"]').first().text());

  // Location/Place
  const location = getNodeFieldValue('Execution place') || getNodeFieldValue('Lugar de ejecución') || getNodeFieldValue('Place') || getNodeFieldValue('Location');

  // Categories array - include collection type and highlight if applicable
  const categories = [];
  if (category) {
    categories.push(category);
  }
  const highlight = getNodeFieldValue('Highlight');
  if (highlight && /yes|si|true/i.test(highlight)) {
    categories.push('Highlight');
  }

  // Extract all field labels and values for metadata (using node-field structure)
  const metadata = {};
  $scope.find('.node-field__wrapper').each((_, el) => {
    const $el = $(el);
    const label = normalizeWs($el.find('.node-field__label, [class*="__label"]').first().text());
    const value = normalizeWs($el.find('.node-field__content, [class*="__content"]').first().text());
    if (label && value && !/^\s*$/.test(value)) {
      metadata[label.replace(/:$/, '')] = value;
    }
  });

  // Helper to check if URL is a valid artwork image (not an icon/logo)
  const isValidArtworkImage = (url) => {
    if (!url) return false;
    const lower = url.toLowerCase();
    // Exclude SVG files
    if (lower.endsWith('.svg')) return false;
    // Exclude known icon/logo patterns
    if (/downloadficha|errorficha|icon|logo|placeholder|avatar|cookie|button|badge/i.test(lower)) return false;
    // Exclude very small images (likely icons)
    return true;
  };

  // Images: collect artwork-related images
  const images = [];
  const seenUrls = new Set();

  // Priority 1: og:image
  const ogImage = $('meta[property="og:image"]').attr('content');
  if (ogImage) {
    const url = toAbsUrl(ogImage);
    if (url && !seenUrls.has(url) && isValidArtworkImage(url)) {
      images.push({ url, source: 'og:image', sourcePageUrl: detailUrl, alt: '' });
      seenUrls.add(url);
    }
  }

  // Priority 2: JSON-LD images
  for (const imgUrl of jsonLdImages) {
    const url = toAbsUrl(imgUrl);
    if (url && !seenUrls.has(url) && isValidArtworkImage(url)) {
      images.push({ url, source: 'json-ld', sourcePageUrl: detailUrl, alt: '' });
      seenUrls.add(url);
    }
  }

  // Priority 3: Images in main content
  const $mainContent = $scope.find('main, [class*="artwork"], [class*="content"]').first();
  const $imageScope = $mainContent.length > 0 ? $mainContent : $scope;

  $imageScope.find('img[src]').each((_, img) => {
    const $img = $(img);
    const src = $img.attr('src') || $img.attr('data-src') || '';
    if (!src) return;

    // Filter out navigation, header, footer elements
    if ($img.parents('nav, header, footer, [class*="Nav"], [class*="Header"], [class*="Footer"]').length) return;
    
    // Filter out very small images (likely icons)
    const width = $img.attr('width');
    const height = $img.attr('height');
    if (width && parseInt(width) < 200 && height && parseInt(height) < 200) return;

    const url = toAbsUrl(src);
    if (!url || seenUrls.has(url)) return;

    // Use the same validation function
    if (!isValidArtworkImage(url)) return;

    const alt = normalizeWs($img.attr('alt') || '');

    images.push({
      url,
      source: 'img-tag',
      sourcePageUrl: detailUrl,
      alt
    });
    seenUrls.add(url);
  });

  // Limit to 6 images (already filtered by isValidArtworkImage)
  const finalImages = images.slice(0, 6);
  
  // If no valid images found, return null to signal that this artwork should be excluded
  if (finalImages.length === 0) {
    return null;
  }

  return {
    detailUrl,
    title,
    artist,
    date,
    objectType,
    category,
    medium,
    dimensions,
    description,
    location,
    categories: uniqStrings(categories),
    images: finalImages,
    metadata,
    jsonLd: jsonLdScripts,
    scrapedAt: new Date().toISOString()
  };
};

async function main() {
  log(`Starting scrape. TEST_MODE=${TEST_MODE}, MAX_PAGES=${MAX_PAGES || 'all'}`);

  const progress = loadProgress();

  try {
    // Step 1: Fetch list of artwork URLs
    log('Step 1: Fetching list of artworks...');
    const listItems = await fetchListWithPuppeteer();

    log(`Found ${listItems.length} artworks to process`);

    // Step 2: Fetch details for each artwork
    log('Step 2: Fetching artwork details...');
    const limit = pLimit(CONCURRENCY);
    const artworks = [];
    let processed = 0;
    let errors = 0;

    await Promise.all(
      listItems.map((item) =>
        limit(async () => {
          if (progress.details.processedByUrl[item.detailUrl]) {
            const cached = progress.details.processedByUrl[item.detailUrl];
            artworks.push(cached);
            processed++;
            return;
          }

          if (progress.details.errorsByUrl[item.detailUrl]) {
            errors++;
            return;
          }

          try {
            await delay(REQUEST_DELAY_MS);
            const html = await fetchText(item.detailUrl);
            const artwork = parseDetailPage(html, item.detailUrl, {
              objectTypeFromList: item.objectTypeFromList || '',
              categoryFromList: item.categoryFromList || ''
            });
            // Skip artworks with no valid images (null is returned when no images found)
            if (!artwork || !artwork.images || artwork.images.length === 0) {
              log(`Skipping ${item.detailUrl}: no valid images`);
              processed++;
              return;
            }
            artworks.push(artwork);
            progress.details.processedByUrl[item.detailUrl] = artwork;
            processed++;
            
            if (processed % 10 === 0) {
              log(`Processed ${processed}/${listItems.length} artworks`);
              saveProgress(progress);
            }
          } catch (err) {
            log(`Error processing ${item.detailUrl}: ${err.message}`);
            progress.details.errorsByUrl[item.detailUrl] = err.message;
            errors++;
          }
        })
      )
    );

    log(`Processed ${processed} artworks, ${errors} errors`);

    // Step 3: Save final output
    const output = {
      version: 1,
      scrapedAt: new Date().toISOString(),
      sourceUrl: COLLECTION_URL,
      totalArtworks: artworks.length,
      artworks: artworks.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    };

    ensureDir(OUTPUT_FILE);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    log(`Saved ${artworks.length} artworks to ${OUTPUT_FILE}`);

    saveProgress(progress);
    log('Done.');
  } catch (err) {
    log(`Fatal error: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

main();
