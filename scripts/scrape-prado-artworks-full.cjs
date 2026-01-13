/**
 * Museo del Prado — Full Artworks Scraper (Playwright)
 *
 * Target:
 *   https://www.museodelprado.es/en/the-collection/art-works
 *
 * What this collects (per artwork):
 * - artworkType ("Type of work" / object type when available)
 * - ALL key-value fields available on the page (dt/dd + table-like labels)
 * - JSON-LD (when present)
 * - Images (best-effort: og/twitter/meta + main image src/srcset + unique list)
 * - source artwork page URL (detailUrl) so the modal can link back to the original page
 * - image URLs + where they came from (sourcePageUrl = detailUrl)
 *
 * Output:
 * - public/data/museo-del-prado-artworks.full.json
 * - downloads/prado-full-progress.json (resume)
 * - downloads/prado-full-scrape.log
 *
 * Notes:
 * - Prado uses Cloudflare sometimes. Default is headful so you can solve it once.
 * - Use STORAGE_STATE to reuse a solved session.
 *
 * Usage examples:
 * - npm run scrape:prado:full
 * - HEADLESS=1 STORAGE_STATE=.prado-state.json npm run scrape:prado:full
 * - CONCURRENCY=2 START_PAGE=1 END_PAGE=5 MAX_ARTWORKS=50 npm run scrape:prado:full
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const pLimitImport = require('p-limit');
const pLimit = typeof pLimitImport === 'function' ? pLimitImport : pLimitImport?.default;

const BASE_URL = 'https://www.museodelprado.es';
const COLLECTION_URL = `${BASE_URL}/en/the-collection/art-works`;

const OUTPUT_FILE = process.env.OUT_FILE
  ? path.resolve(process.env.OUT_FILE)
  : path.join(__dirname, '../public/data/museo-del-prado-artworks.full.json');

const PROGRESS_FILE = process.env.PROGRESS_FILE
  ? path.resolve(process.env.PROGRESS_FILE)
  : path.join(__dirname, '../downloads/prado-full-progress.json');

const LOG_FILE = process.env.LOG_FILE
  ? path.resolve(process.env.LOG_FILE)
  : path.join(__dirname, '../downloads/prado-full-scrape.log');

const STORAGE_STATE = process.env.STORAGE_STATE ? path.resolve(process.env.STORAGE_STATE) : '';

const HEADLESS = process.env.HEADLESS === '1' || process.env.HEADLESS === 'true';
const PHASE = (process.env.PHASE || 'all').toLowerCase(); // list | details | all
const PAUSE_FOR_HUMAN = process.env.PAUSE_FOR_HUMAN === '1' || process.env.PAUSE_FOR_HUMAN === 'true';
const CONCURRENCY = Number(process.env.CONCURRENCY || 2);
const LIST_DELAY_MS = Number(process.env.LIST_DELAY_MS || 1200);
const DETAIL_DELAY_MS = Number(process.env.DETAIL_DELAY_MS || 500);
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 3);

const START_PAGE = Number(process.env.START_PAGE || 1);
const END_PAGE = process.env.END_PAGE ? Number(process.env.END_PAGE) : null;

const START_INDEX = Number(process.env.START_INDEX || 0);
const END_INDEX = process.env.END_INDEX ? Number(process.env.END_INDEX) : null;

// Back-compat: MAX_ARTWORKS caps detail processing.
const MAX_ARTWORKS = process.env.MAX_ARTWORKS ? Number(process.env.MAX_ARTWORKS) : null;
const MAX_DETAILS = process.env.MAX_DETAILS ? Number(process.env.MAX_DETAILS) : MAX_ARTWORKS;
const MAX_LIST_URLS = process.env.MAX_LIST_URLS ? Number(process.env.MAX_LIST_URLS) : null;

const ensureDir = (filePath) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

ensureDir(LOG_FILE);

const log = (message) => {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, `${line}\n`);
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const safeJsonParse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const normalizeWs = (s) => (s || '').replace(/\s+/g, ' ').trim();

const toAbsUrl = (maybeUrl) => {
  if (!maybeUrl) return '';
  try {
    const u = new URL(maybeUrl, BASE_URL);
    // Remove tracking/query params when possible
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return '';
  }
};

const uniq = (arr) => {
  const seen = new Set();
  const out = [];
  for (const v of arr || []) {
    const key = typeof v === 'string' ? v : JSON.stringify(v);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
};

const parseLargestFromSrcset = (srcset) => {
  const s = (srcset || '').trim();
  if (!s) return '';
  const candidates = s
    .split(',')
    .map((part) => part.trim())
    .map((part) => {
      const [url, descriptor] = part.split(/\s+/);
      const d = (descriptor || '').trim();
      let score = 0;
      if (d.endsWith('w')) score = Number(d.replace('w', '')) || 0;
      if (d.endsWith('x')) score = (Number(d.replace('x', '')) || 0) * 10000;
      return { url, score };
    })
    .filter((c) => c.url);

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.url ? toAbsUrl(candidates[0].url) : '';
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
    totalPages: null,
    list: {
      lastPage: 0,
      detailUrls: [],
      itemsByUrl: {}
    },
    details: {
      processed: {},
      errors: {}
    }
  };
};

const saveProgress = (progress) => {
  ensureDir(PROGRESS_FILE);
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
};

const isCloudflareChallenge = async (page) => {
  try {
    return await page.evaluate(() => {
      const t = (document.title || '').toLowerCase();
      const body = (document.body?.innerText || '').toLowerCase();
      return (
        t.includes('just a moment') ||
        body.includes('verify you are human') ||
        body.includes('checking your browser')
      );
    });
  } catch {
    return false;
  }
};

const waitForCloudflareClear = async (page, maxWaitMs = 120000) => {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const challenged = await isCloudflareChallenge(page);
    if (!challenged) return true;
    log('   ⏳ Cloudflare verification detected — solve it in the browser if needed...');
    try {
      await page.bringToFront();
    } catch {}
    await delay(5000);
  }
  return false;
};

const getTotalCountAndPages = async (page) => {
  await page.goto(COLLECTION_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const cleared = await waitForCloudflareClear(page);
  if (!cleared) throw new Error('Cloudflare challenge timeout on collection page');
  await delay(1500);

  // Accept cookies
  try {
    const acceptBtn = await page.$('button:has-text("Aceptar")');
    if (acceptBtn) {
      await acceptBtn.click();
      await delay(800);
    }
  } catch {}

  const totalCount = await page.evaluate(() => {
    const pick = (sel) => document.querySelector(sel)?.textContent || '';
    const text =
      pick('.results-count') ||
      pick('[class*="results"]') ||
      pick('h1') ||
      '';
    const match = text.match(/(\d[\d,\.]*)/);
    if (!match) return 9135;
    return parseInt(match[1].replace(/[,\.]/g, ''), 10) || 9135;
  });

  const itemsPerPage = 36;
  const totalPages = Math.ceil(totalCount / itemsPerPage);
  return { totalCount, totalPages };
};

const extractListPage = async (page, pageNum) => {
  return await page.evaluate((pageNumber) => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const abs = (href) => {
      try {
        const u = new URL(href, window.location.origin);
        u.search = '';
        u.hash = '';
        return u.toString();
      } catch {
        return '';
      }
    };

    const items = [];
    const links = document.querySelectorAll('a[href*="/the-collection/art-work/"]');
    const seen = new Set();

    links.forEach((a) => {
      const url = abs(a.getAttribute('href') || a.href || '');
      if (!url || seen.has(url)) return;
      seen.add(url);

      const parent = a.closest('figure') || a.closest('li') || a.closest('article') || a.parentElement;
      const img = parent?.querySelector('img') || a.querySelector('img');
      const titleEl =
        parent?.querySelector('p.titulo a') ||
        parent?.querySelector('h2, h3, .title, [class*="title"]') ||
        a.querySelector('h2, h3');

      const artistEl = parent?.querySelector('.autor a, .author, .author a, [class*="autor"], [class*="author"]');
      const mediumEl = parent?.querySelector('.soporte, .technique, [class*="technique"], [class*="soporte"]');

      const title = norm(titleEl?.textContent || img?.alt || '');
      const artist = norm(artistEl?.textContent || '');
      const medium = norm(mediumEl?.textContent || '');

      const thumb = (img?.getAttribute('data-src') || img?.getAttribute('src') || '').trim();
      const thumbAbs = abs(thumb);

      items.push({
        detailUrl: url,
        title,
        artist,
        medium,
        thumbnailUrl: thumbAbs,
        page: pageNumber
      });
    });

    return items;
  }, pageNum);
};

const fetchListPages = async (page, progress) => {
  log('📋 Phase 1: Collecting all artwork detail URLs via pagination...');

  if (!progress.totalPages) {
    const { totalCount, totalPages } = await getTotalCountAndPages(page);
    progress.totalPages = totalPages;
    progress.totalCount = totalCount;
    saveProgress(progress);
    log(`   Total: ${totalCount} artworks across ~${totalPages} pages`);
  }

  const totalPages = progress.totalPages;
  const effectiveEndPage = END_PAGE ? Math.min(END_PAGE, totalPages) : totalPages;

  const urls = new Set(progress.list.detailUrls || []);
  const itemsByUrl = progress.list.itemsByUrl || {};

  const startPage = Math.max(START_PAGE, (progress.list.lastPage || 0) + 1);
  if (startPage > effectiveEndPage) {
    log(`   List pages already collected up to page ${progress.list.lastPage}.`);
    return;
  }

  for (let pageNum = startPage; pageNum <= effectiveEndPage; pageNum++) {
    const url = pageNum === 1 ? COLLECTION_URL : `${COLLECTION_URL}?page=${pageNum}`;
    log(`   Fetching list page ${pageNum}/${effectiveEndPage}...`);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    const cleared = await waitForCloudflareClear(page);
    if (!cleared) throw new Error(`Cloudflare challenge timeout on list page ${pageNum}`);
    await delay(800);

    try {
      await page.waitForSelector('a[href*="/the-collection/art-work/"]', { timeout: 20000 });
    } catch {
      log(`   ⚠️ No artwork links detected on page ${pageNum}`);
    }

    const items = await extractListPage(page, pageNum);

    let added = 0;
    for (const it of items) {
      if (!it.detailUrl) continue;
      if (!urls.has(it.detailUrl)) {
        urls.add(it.detailUrl);
        added++;
      }
      itemsByUrl[it.detailUrl] = { ...(itemsByUrl[it.detailUrl] || {}), ...it };
    }

    progress.list.detailUrls = [...urls];
    progress.list.itemsByUrl = itemsByUrl;
    progress.list.lastPage = pageNum;

    if (pageNum % 5 === 0) saveProgress(progress);

    log(`   ✓ Page ${pageNum}: ${items.length} items (${added} new) — total URLs: ${urls.size}`);

    if (MAX_LIST_URLS && urls.size >= MAX_LIST_URLS) {
      log(`   ⏹ MAX_LIST_URLS reached (${MAX_LIST_URLS}). Stopping list phase.`);
      break;
    }

    await delay(LIST_DELAY_MS);
  }

  saveProgress(progress);
  log(`✅ List phase complete: ${progress.list.detailUrls.length} unique detail URLs`);
};

const withRetries = async (fn, retries, onError) => {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn(i);
    } catch (e) {
      lastErr = e;
      if (onError) onError(e, i);
      await delay(1000 + i * 1500);
    }
  }
  throw lastErr;
};

const extractDetail = async (page) => {
  return await page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const abs = (u) => {
      try {
        const url = new URL(u, window.location.origin);
        url.search = '';
        url.hash = '';
        return url.toString();
      } catch {
        return '';
      }
    };

    const pickMeta = (names) => {
      for (const n of names) {
        const el =
          document.querySelector(`meta[property="${n}"]`) ||
          document.querySelector(`meta[name="${n}"]`) ||
          document.querySelector(`meta[itemprop="${n}"]`);
        const v = el?.getAttribute('content') || '';
        if (v) return v;
      }
      return '';
    };

    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';

    const title =
      norm(document.querySelector('h1')?.textContent) ||
      norm(pickMeta(['og:title', 'twitter:title'])) ||
      '';

    const description =
      norm(document.querySelector('.description, .text-work, [class*="description"], [class*="text"]')?.textContent) ||
      norm(pickMeta(['og:description', 'description'])) ||
      '';

    const artistEl = document.querySelector('.author a, .autor a, .author, [class*="author"], [class*="autor"]');
    const artist = norm(artistEl?.textContent) || '';
    const artistUrl = artistEl?.closest('a')?.href || (artistEl?.tagName === 'A' ? artistEl.href : '');

    // Collect all dt/dd fields
    const fields = {};
    const dts = Array.from(document.querySelectorAll('dt'));
    for (const dt of dts) {
      const key = norm(dt.textContent).replace(/:$/, '');
      const dd = dt.nextElementSibling;
      if (!key || !dd || dd.tagName !== 'DD') continue;
      const val = norm(dd.textContent);
      if (val) fields[key] = val;
    }

    // Also attempt table-like label/value pairs
    const labelSelectors = ['.field-label', '.field-name', '[class*="label"]', 'th'];
    const labels = Array.from(document.querySelectorAll(labelSelectors.join(',')));
    for (const l of labels) {
      const key = norm(l.textContent).replace(/:$/, '');
      if (!key) continue;
      const valueEl =
        l.nextElementSibling ||
        l.parentElement?.querySelector('[class*="value"], td') ||
        null;
      const val = norm(valueEl?.textContent || '');
      if (val && !fields[key]) fields[key] = val;
    }

    // Guess artwork type
    const typeKeys = [
      'Type of work',
      'Work type',
      'Object type',
      'Type',
      'Tipo de obra',
      'Tipo de trabajo',
      'Tipo',
      'Clasificación'
    ];
    let artworkType = '';
    for (const k of typeKeys) {
      if (fields[k]) {
        artworkType = fields[k];
        break;
      }
    }

    // Collect rich text sections (best-effort)
    const sections = {};
    const main =
      document.querySelector('main') ||
      document.querySelector('[role="main"]') ||
      document.body;

    const headings = Array.from(main.querySelectorAll('h2, h3, h4')).slice(0, 80);
    const isHeading = (el) => el && /H[2-4]/.test(el.tagName);
    for (const h of headings) {
      const key = norm(h.textContent).replace(/:$/, '');
      if (!key) continue;

      const chunks = [];
      let el = h.nextElementSibling;
      let steps = 0;
      while (el && steps < 40 && !isHeading(el)) {
        const txt = norm(el.textContent);
        if (txt && txt.length > 2) chunks.push(txt);
        el = el.nextElementSibling;
        steps++;
      }

      const val = chunks.join('\n');
      if (val && val.length >= 10) {
        // Avoid huge blobs
        sections[key] = val.slice(0, 10000);
      }
    }

    // JSON-LD (often richer)
    const jsonLdRaw = [];
    const jsonLd = [];
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const s of scripts) {
      const txt = (s.textContent || '').trim();
      if (!txt) continue;
      jsonLdRaw.push(txt.slice(0, 200000));
      try {
        jsonLd.push(JSON.parse(txt));
      } catch {
        // ignore
      }
    }

    // Image discovery
    const imageCandidates = [];

    // Meta images
    const ogImage = pickMeta(['og:image', 'twitter:image', 'image']);
    if (ogImage) imageCandidates.push(abs(ogImage));

    // Main image elements
    const imgSelectors = [
      '.work-image img',
      '.gallery-image img',
      '.zoom-image img',
      '.zoom-container img',
      'picture img',
      'img'
    ];

    const imgs = Array.from(document.querySelectorAll(imgSelectors.join(',')));
    for (const img of imgs.slice(0, 20)) {
      const src = img.getAttribute('data-src') || img.getAttribute('src') || '';
      const srcset = img.getAttribute('srcset') || '';
      if (src) imageCandidates.push(abs(src));
      if (srcset) {
        const parts = srcset.split(',').map((p) => p.trim().split(/\s+/)[0]).filter(Boolean);
        parts.forEach((u) => imageCandidates.push(abs(u)));
      }
    }

    // Remove empties and duplicates
    const uniqImages = Array.from(new Set(imageCandidates.filter(Boolean)));

    // Prefer CDN-ish images first
    const sortedImages = uniqImages.sort((a, b) => {
      const score = (u) => {
        const s = u.toLowerCase();
        if (s.includes('cdnprado')) return 3;
        if (s.includes('museodelprado')) return 2;
        return 1;
      };
      return score(b) - score(a);
    });

    const images = sortedImages.map((url, idx) => ({
      url,
      role: idx === 0 ? 'primary' : 'additional',
      sourcePageUrl: window.location.href
    }));

    // Attempt to pick the best single image url
    const bestImageUrl = images[0]?.url || '';

    const pageUrl = window.location.href;

    return {
      pageUrl,
      canonicalUrl: canonical ? abs(canonical) : '',
      title,
      artist,
      artistUrl: artistUrl ? abs(artistUrl) : '',
      description,
      artworkType,
      fields,
      sections,
      jsonLd,
      jsonLdRawCount: jsonLdRaw.length,
      images,
      imageUrl: bestImageUrl
    };
  });
};

const fetchOneArtwork = async (context, detailUrl) => {
  const page = await context.newPage();

  // Speed: block heavy resources (we still can read img src/srcset from HTML)
  await page.route('**/*', (route) => {
    const req = route.request();
    const type = req.resourceType();
    if (type === 'image' || type === 'media' || type === 'font') return route.abort();
    return route.continue();
  });

  try {
    const data = await withRetries(
      async () => {
        await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Cloudflare check
        const cleared = await waitForCloudflareClear(page, 120000);
        if (!cleared) throw new Error('Cloudflare challenge timeout on detail page');

        await delay(500);
        const result = await extractDetail(page);
        return result;
      },
      MAX_RETRIES,
      (e, attempt) => {
        log(`   ⚠️ Retry ${attempt + 1}/${MAX_RETRIES} for ${detailUrl}: ${e.message}`);
      }
    );

    return data;
  } finally {
    await page.close().catch(() => {});
  }
};

const scrapeDetails = async (context, progress) => {
  log('🖼️  Phase 2: Fetching detail pages for full metadata...');

  const detailUrls = progress.list.detailUrls || [];
  if (detailUrls.length === 0) {
    throw new Error('No detail URLs found. Run list phase first.');
  }

  const processed = progress.details.processed || {};
  const errors = progress.details.errors || {};

  const urlsToProcessAll = detailUrls.filter((u) => !processed[u]);
  let urlsToProcess = urlsToProcessAll;

  // Apply index window for partial runs
  const sliceStart = Math.max(0, START_INDEX);
  const sliceEnd = END_INDEX !== null ? Math.min(urlsToProcess.length, END_INDEX) : urlsToProcess.length;
  urlsToProcess = urlsToProcess.slice(sliceStart, sliceEnd);

  if (MAX_DETAILS) urlsToProcess = urlsToProcess.slice(0, MAX_DETAILS);

  log(`   Total URLs: ${detailUrls.length}`);
  log(`   Remaining unprocessed: ${urlsToProcessAll.length}`);
  log(`   This run will process: ${urlsToProcess.length} (concurrency=${CONCURRENCY})`);

  const itemsByUrl = progress.list.itemsByUrl || {};

  if (typeof pLimit !== 'function') {
    throw new Error('p-limit import failed (expected a function). Try reinstalling dependencies.');
  }
  const limit = pLimit(Math.max(1, CONCURRENCY));

  let done = 0;
  let ok = 0;
  let fail = 0;

  const saveEvery = 25;

  const tasks = urlsToProcess.map((url) =>
    limit(async () => {
      try {
        const detail = await fetchOneArtwork(context, url);

        // Merge list card data for convenience
        const card = itemsByUrl[url] || {};

        const artwork = {
          source: 'Museo del Prado',
          sourceCollectionUrl: COLLECTION_URL,
          detailUrl: url,
          sourcePageUrl: url,
          canonicalUrl: detail.canonicalUrl || '',
          title: detail.title || card.title || '',
          artist: detail.artist || card.artist || '',
          artistUrl: detail.artistUrl || '',
          description: detail.description || '',
          artworkType: detail.artworkType || '',
          mediumPreview: card.medium || '',
          fields: detail.fields || {},
          sections: detail.sections || {},
          jsonLd: detail.jsonLd || [],
          images: detail.images || [],
          imageUrl: detail.imageUrl || card.thumbnailUrl || '',
          thumbnailUrl: card.thumbnailUrl || '',
          scrapedAt: new Date().toISOString()
        };

        // If artworkType wasn't found via fields, attempt JSON-LD fallbacks
        if (!artwork.artworkType && Array.isArray(artwork.jsonLd)) {
          const flat = artwork.jsonLd.flatMap((x) => (Array.isArray(x) ? x : [x]));
          const first = flat.find(Boolean) || {};
          const pick = (obj, keys) => {
            for (const k of keys) {
              const v = obj?.[k];
              if (typeof v === 'string' && v.trim()) return v.trim();
              if (Array.isArray(v)) {
                const s = v.map((y) => (typeof y === 'string' ? y : y?.name)).filter(Boolean).join(', ');
                if (s) return s;
              }
              if (v && typeof v === 'object' && v.name) return String(v.name).trim();
            }
            return '';
          };
          const guessed = pick(first, ['artform', 'genre', 'artMedium', '@type']);
          if (guessed && guessed !== 'VisualArtwork') artwork.artworkType = guessed;
        }

        processed[url] = artwork;
        ok++;
      } catch (e) {
        errors[url] = {
          error: e.message,
          at: new Date().toISOString()
        };
        fail++;
      } finally {
        done++;

        if (done % saveEvery === 0) {
          progress.details.processed = processed;
          progress.details.errors = errors;
          saveProgress(progress);
          log(`   Progress: ${done}/${urlsToProcess.length} (ok=${ok}, fail=${fail})`);
        }

        await delay(DETAIL_DELAY_MS);
      }
    })
  );

  await Promise.all(tasks);

  progress.details.processed = processed;
  progress.details.errors = errors;
  saveProgress(progress);

  log(`✅ Detail phase complete: processed ${Object.keys(processed).length}, errors ${Object.keys(errors).length}`);
};

const writeOutput = async (progress) => {
  const processed = progress.details.processed || {};
  const artworks = Object.values(processed);

  // Basic sanity filtering
  const cleaned = artworks
    .filter((a) => a && a.detailUrl)
    .map((a) => {
      // Dedup images, keep sourcePageUrl so modal can link out
      const images = uniq((a.images || []).filter((im) => im?.url).map((im) => ({
        url: im.url,
        role: im.role || '',
        sourcePageUrl: a.detailUrl
      })));

      return {
        ...a,
        images
      };
    });

  ensureDir(OUTPUT_FILE);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(cleaned, null, 2));

  log(`💾 Wrote ${cleaned.length} artworks to ${OUTPUT_FILE}`);
};

const ensureStorageStateSaved = async (context) => {
  if (!STORAGE_STATE) return;
  try {
    ensureDir(STORAGE_STATE);
    await context.storageState({ path: STORAGE_STATE });
    log(`   💾 Saved storage state to ${STORAGE_STATE}`);
  } catch (e) {
    log(`   ⚠️ Failed saving storage state: ${e.message}`);
  }
};

const maybePauseForHuman = async (page, label) => {
  if (!PAUSE_FOR_HUMAN) return;
  log(`🧑‍💻 PAUSE_FOR_HUMAN enabled (${label}). Close the page tab or press Ctrl+C to continue/stop.`);
  try {
    await page.pause();
  } catch {
    // If pause isn't available (rare), just wait.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await delay(60_000);
    }
  }
};

const main = async () => {
  log('🏛️ Museo del Prado — Full Artworks Scraper');
  log('================================================');
  log(`Config: PHASE=${PHASE}, HEADLESS=${HEADLESS ? '1' : '0'}, CONCURRENCY=${CONCURRENCY}`);
  if (!HEADLESS) log('Note: Headful mode is recommended for Cloudflare.');

  const progress = loadProgress();

  const browser = await chromium.launch({
    headless: HEADLESS,
    slowMo: HEADLESS ? 0 : 50,
    args: ['--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1400, height: 900 },
    locale: 'en-US',
    ...(STORAGE_STATE && fs.existsSync(STORAGE_STATE) ? { storageState: STORAGE_STATE } : {})
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const page = await context.newPage();

  try {
    if (PHASE === 'list' || PHASE === 'all') {
      await fetchListPages(page, progress);
      await ensureStorageStateSaved(context);
      await maybePauseForHuman(page, 'after-list');
    }

    if (PHASE === 'details' || PHASE === 'all') {
      // If user wants to start with a manual solve first, they can run PHASE=list once,
      // then run PHASE=details headless/headful with STORAGE_STATE.
      await scrapeDetails(context, progress);
      await writeOutput(progress);
    }

    log('🎯 Data model notes:');
    log('   - artwork.detailUrl is the original Prado page URL (use for modal click-through)');
    log('   - artwork.images[].url are direct image URLs; images[].sourcePageUrl points to detailUrl');
    log('   - artwork.fields contains all discovered label/value metadata');

  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    log('🚪 Browser closed');
  }
};

main().catch((e) => {
  log(`❌ Fatal: ${e.message}`);
  console.error(e);
  process.exit(1);
});
