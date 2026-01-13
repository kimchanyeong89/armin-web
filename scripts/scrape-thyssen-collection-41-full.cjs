/**
 * Museo Nacional Thyssen-Bornemisza — Collection 41 (Artwork) Full Scraper
 *
 * Target search:
 *   https://www.museothyssen.org/en/buscador/tipo/obra/coleccion/41
 *
 * Collects (per artwork):
 * - Artwork type (artform / taxonomy best-effort)
 * - Medium, support/surface, dates
 * - Room/location (from dataLayer taxonomy: localizacion → "Sala N")
 * - Images (JSON-LD + og:image + any file links) with sourcePageUrl (original page)
 * - All available metadata (raw JSON-LD VisualArtwork + dataLayer payload + parsed fields)
 *
 * Output:
 * - public/data/museothyssen-collection-41.full.json
 * - downloads/thyssen-collection-41-progress.json (resume)
 * - downloads/thyssen-collection-41-scrape.log
 *
 * Env vars:
 * - START_PAGE=0 END_PAGE=2   (0-based pages for search)
 * - MAX_LIST_PAGES=3          (caps list scraping)
 * - MAX_DETAILS=100           (caps detail fetching)
 * - CONCURRENCY=6             (detail fetching concurrency)
 * - REQUEST_DELAY_MS=150      (delay after each detail fetch)
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const pLimitImport = require('p-limit');
const pLimit = typeof pLimitImport === 'function' ? pLimitImport : pLimitImport?.default;

const BASE_URL = 'https://www.museothyssen.org';
const SEARCH_URL = 'https://www.museothyssen.org/en/buscador/tipo/obra/coleccion/41';

const OUTPUT_FILE = process.env.OUT_FILE
  ? path.resolve(process.env.OUT_FILE)
  : path.join(__dirname, '../public/data/museothyssen-collection-41.full.json');

const PROGRESS_FILE = process.env.PROGRESS_FILE
  ? path.resolve(process.env.PROGRESS_FILE)
  : path.join(__dirname, '../downloads/thyssen-collection-41-progress.json');

const LOG_FILE = process.env.LOG_FILE
  ? path.resolve(process.env.LOG_FILE)
  : path.join(__dirname, '../downloads/thyssen-collection-41-scrape.log');

const START_PAGE = Number(process.env.START_PAGE || 0);
const END_PAGE = process.env.END_PAGE !== undefined ? Number(process.env.END_PAGE) : null;
const MAX_LIST_PAGES = process.env.MAX_LIST_PAGES ? Number(process.env.MAX_LIST_PAGES) : null;

const MAX_DETAILS = process.env.MAX_DETAILS ? Number(process.env.MAX_DETAILS) : null;
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 150);
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 3);

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

const isLikelyImageFile = (url) => {
  const u = String(url || '').split('?')[0].toLowerCase().trim();
  return /\.(jpg|jpeg|png|webp)$/.test(u);
};

const extractAccessionFromUrl = (url) => {
  const u = String(url || '');
  const m = u.match(/\b(\d{4}\.\d{1,4})\b/);
  return m ? m[1] : '';
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
    searchUrl: SEARCH_URL,
    list: {
      lastPage: -1,
      totalPages: null,
      totalResults: null,
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
    'accept-language': 'en-US,en;q=0.9'
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

const getSearchPageUrl = (pageNum) => {
  const u = new URL(SEARCH_URL);
  u.searchParams.set('page', String(pageNum));
  return u.toString();
};

const parseSearchMeta = (html) => {
  const $ = cheerio.load(html);
  const header = $('h1,h2').map((_, el) => normalizeWs($(el).text())).get().find((t) => /result/i.test(t)) || '';
  const match = header.match(/(\d[\d,\.]*)/);
  const totalResults = match ? parseInt(match[1].replace(/[,\.]/g, ''), 10) : null;

  const itemsPerPage = $('.snippet.snippet--sm.card').length || null;

  const pages = $('a[href*="?page="]')
    .map((_, a) => $(a).attr('href'))
    .get()
    .map((h) => {
      try {
        const u = new URL(h, BASE_URL);
        const p = u.searchParams.get('page');
        return p === null ? null : Number(p);
      } catch {
        return null;
      }
    })
    .filter((n) => Number.isFinite(n));

  const maxPage = pages.length ? Math.max(...pages) : null;
  const pagerTotalPages = maxPage !== null ? maxPage + 1 : null; // 0-based

  // Thyssen pager UI often only shows a small window (e.g. pages 0..8).
  // Infer full page count from totalResults / itemsPerPage when possible.
  let totalPages = pagerTotalPages;
  if (totalResults && itemsPerPage) {
    const inferred = Math.ceil(totalResults / itemsPerPage);
    if (!totalPages || inferred > totalPages) totalPages = inferred;
  }

  return { totalResults, totalPages, itemsPerPage };
};

const parseSearchItems = (html, pageNum) => {
  const $ = cheerio.load(html);
  const items = [];

  $('.snippet.snippet--sm.card').each((_, card) => {
    const $card = $(card);

    const link = $card.find('a.snippet__caption, a.snippet__media').first();
    const detailUrl = toAbsUrl(link.attr('href') || '');
    if (!detailUrl.includes('/en/collection/artists/')) return;

    const artist = normalizeWs($card.find('.snippet__title').first().text());
    const title = normalizeWs($card.find('.snippet__subtitle').first().text());
    const dateText = normalizeWs($card.find('.snippet__text').first().text());
    const kicker = normalizeWs($card.find('.snippet__kicker').first().text());

    const img = $card.find('img.snippet__img, img').first();
    const srcset = img.attr('srcset') || '';
    const src = img.attr('src') || '';
    const thumb = parseLargestFromSrcset(srcset) || toAbsUrl(src);

    items.push({
      detailUrl,
      artist,
      title,
      dateText,
      artworkTypePreview: kicker,
      thumbnailUrl: thumb,
      listPage: pageNum
    });
  });

  // Dedup by detailUrl
  const byUrl = new Map();
  for (const it of items) {
    if (!it.detailUrl) continue;
    byUrl.set(it.detailUrl, { ...(byUrl.get(it.detailUrl) || {}), ...it });
  }
  return [...byUrl.values()];
};

const extractJsonObjectAfter = (html, marker) => {
  const i = html.indexOf(marker);
  if (i < 0) return null;
  const start = html.indexOf('{', i);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let pos = start; pos < html.length; pos++) {
    const ch = html[pos];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') depth--;

    if (depth === 0) {
      const raw = html.slice(start, pos + 1);
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
  }

  return null;
};

const parseVisualArtworkJsonLd = ($) => {
  const scripts = $('script[type="application/ld+json"]');
  for (const el of scripts.toArray()) {
    const txt = $(el).text().trim();
    if (!txt) continue;
    try {
      const obj = JSON.parse(txt);
      if (obj && obj['@type'] === 'VisualArtwork') return obj;
    } catch {
      // ignore
    }
  }
  return null;
};

const normalizeThyssenImageUrl = (url) => {
  const u = String(url || '').trim();
  if (!u) return '';
  // Prefer original images over Drupal style derivatives
  // e.g. /sites/default/files/styles/16x9_social_share/public/imagen/obras/X.jpg?h=... -> /sites/default/files/imagen/obras/X.jpg
  const m = u.match(/(https?:\/\/[^\s"']+\/sites\/default\/files\/)(?:styles\/[^/]+\/public\/)?(imagen\/obras\/[^\s"'?]+\.(?:jpg|jpeg|png|webp))/i);
  if (m) return `${m[1]}${m[2]}`;
  return toAbsUrl(u.split('?')[0]);
};

const extractDetail = async (detailUrl) => {
  const html = await fetchText(detailUrl);
  const $ = cheerio.load(html);

  const jsonLd = parseVisualArtworkJsonLd($);
  const dataLayer = extractJsonObjectAfter(html, 'dataLayer.push(');

  const title = normalizeWs($('h1').first().text()) || normalizeWs(jsonLd?.name) || '';
  const description = normalizeWs(jsonLd?.description || '') || normalizeWs($('meta[name="description"]').attr('content') || '');

  // Room/location from dataLayer taxonomy
  const localizacion = dataLayer?.content_taxonomy?.localizacion || [];
  const roomName = localizacion[0]?.name ? String(localizacion[0].name) : '';
  const roomNumberMatch = roomName.match(/\bSala\s*(\d+)\b/i);
  const roomNumber = roomNumberMatch ? Number(roomNumberMatch[1]) : null;

  // Normalize taxonomy to name-only lists
  const taxonomy = {};
  if (dataLayer?.content_taxonomy && typeof dataLayer.content_taxonomy === 'object') {
    for (const [k, v] of Object.entries(dataLayer.content_taxonomy)) {
      if (Array.isArray(v)) taxonomy[k] = v.map((x) => x?.name).filter(Boolean);
    }
  }

  const creator = jsonLd?.creator;
  const artist =
    (typeof creator === 'string' ? creator : creator?.name) ||
    normalizeWs($('meta[property="og:site_name"]').attr('content') || '');

  // Media/type
  const artworkType =
    (typeof jsonLd?.artform === 'string' ? jsonLd.artform : '') ||
    (Array.isArray(taxonomy?.obra_tipo) ? taxonomy.obra_tipo[0] : '') ||
    '';

  const medium = typeof jsonLd?.artMedium === 'string' ? jsonLd.artMedium : '';
  const surface = typeof jsonLd?.artworkSurface === 'string' ? jsonLd.artworkSurface : '';
  const dateCreated = typeof jsonLd?.dateCreated === 'string' ? jsonLd.dateCreated : '';

  // Dimensions (often rendered inline in the header block, not in JSON-LD)
  const dimension = (() => {
    // Prefer the dedicated inline field that contains units
    const unitField = $('.u-font-size-sm .field--string')
      .filter((_, el) => /\b(?:cm|mm)\b/i.test($(el).text()))
      .first();
    const fromField = normalizeWs(unitField.text());
    if (fromField) return fromField;

    // Fallback: search the same header block text for a common dimension pattern
    const headerBlock = normalizeWs($('.u-font-size-sm').first().text());
    const m = headerBlock.match(/\b(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?(?:\s*[x×]\s*\d+(?:\.\d+)?)?\s*(?:cm|mm))\b/i);
    return m ? normalizeWs(m[1]) : '';
  })();

  const id =
    (typeof jsonLd?.identifier === 'string' ? jsonLd.identifier : '') ||
    (typeof dataLayer?.content_id === 'string' ? dataLayer.content_id : '') ||
    '';

  // Images
  const images = [];
  const ogImage = $('meta[property="og:image"]').attr('content') || '';
  const twImage = $('meta[name="twitter:image"]').attr('content') || '';

  const candidates = [];
  if (jsonLd?.image) candidates.push(jsonLd.image);
  if (jsonLd?.thumbnailUrl) candidates.push(jsonLd.thumbnailUrl);
  if (ogImage) candidates.push(ogImage);
  if (twImage) candidates.push(twImage);

  // Also grab any direct file links
  const fileLinks = $('a[href*="/sites/default/files/"]')
    .map((_, a) => $(a).attr('href'))
    .get();
  candidates.push(...fileLinks);

  const imgLinks = $('img')
    .map((_, img) => $(img).attr('srcset') || $(img).attr('src') || '')
    .get();
  candidates.push(...imgLinks);

  const normalized = uniqStrings(
    candidates
      .flatMap((c) => {
        const s = String(c || '');
        if (!s) return [];
        if (s.includes(',')) {
          // srcset list
          return s
            .split(',')
            .map((p) => p.trim().split(/\s+/)[0])
            .filter(Boolean);
        }
        return [s];
      })
      .map(normalizeThyssenImageUrl)
      .filter(Boolean)
      .filter(isLikelyImageFile)
  );

  // Prefer images that clearly belong to this artwork (match accession id)
  const sorted = normalized.sort((a, b) => {
    const score = (u) => {
      const s = String(u || '').toLowerCase();
      let sc = 0;

      // Hard reject obvious non-art assets
      if (s.includes('/themes/') || s.includes('logo') || s.includes('favicon')) sc -= 1000;

      // Prefer original files over derivatives
      if (s.includes('/sites/default/files/imagen/obras/')) sc += 300;
      else if (s.includes('/sites/default/files/imagen/')) sc += 200;
      else if (s.includes('/sites/default/files/')) sc += 100;
      else sc += 10;

      // Strongly prefer images that reference this artwork id
      const thisId = String(id || '').trim();
      if (thisId) {
        const enc = encodeURIComponent(thisId).toLowerCase();
        if (s.includes(thisId.toLowerCase()) || s.includes(`(${thisId.toLowerCase()})`) || s.includes(enc)) sc += 1000;

        // Penalize if the URL clearly contains a different accession number
        const other = extractAccessionFromUrl(s);
        if (other && other !== thisId) sc -= 900;
      }

      return sc;
    };
    return score(b) - score(a);
  });

  sorted.forEach((url, idx) => {
    images.push({
      url,
      role: idx === 0 ? 'primary' : 'additional',
      sourcePageUrl: detailUrl
    });
  });

  const imageUrl = images[0]?.url || '';

  return {
    source: 'Museo Nacional Thyssen-Bornemisza',
    sourceSearchUrl: SEARCH_URL,
    detailUrl,
    sourcePageUrl: detailUrl,
    id,
    title,
    artist: normalizeWs(artist),
    dateCreated,
    artworkType,
    medium,
    surface,
    dimension,
    roomNumber,
    roomName,
    description,
    images,
    imageUrl,
    thumbnailUrl: normalizeThyssenImageUrl(jsonLd?.thumbnailUrl || '') || '',
    metadata: {
      jsonLd,
      dataLayer,
      taxonomy
    },
    scrapedAt: new Date().toISOString()
  };
};

const main = async () => {
  log('🖼️ Thyssen Collection 41 Full Scraper');
  log('=====================================');

  if (typeof pLimit !== 'function') {
    throw new Error('p-limit import failed (expected a function).');
  }

  const progress = loadProgress();

  // Phase 1: list
  if (progress.list.totalPages === null || progress.list.totalResults === null) {
    const firstHtml = await fetchText(getSearchPageUrl(0));
    const meta = parseSearchMeta(firstHtml);
    progress.list.totalPages = meta.totalPages;
    progress.list.totalResults = meta.totalResults;
    progress.list.itemsPerPage = meta.itemsPerPage;
    saveProgress(progress);
    log(`List meta: totalResults=${meta.totalResults}, itemsPerPage=${meta.itemsPerPage}, totalPages=${meta.totalPages}`);
  }

  const totalPages = progress.list.totalPages;
  if (!Number.isFinite(totalPages)) {
    throw new Error('Could not detect totalPages from pagination links.');
  }

  const effectiveEnd = END_PAGE !== null ? Math.min(END_PAGE, totalPages - 1) : totalPages - 1;
  const effectiveStart = Math.max(0, START_PAGE);
  const maxPageByCap = MAX_LIST_PAGES ? Math.min(effectiveStart + MAX_LIST_PAGES - 1, effectiveEnd) : effectiveEnd;

  const itemsByUrl = progress.list.itemsByUrl || {};

  for (let pageNum = Math.max(progress.list.lastPage + 1, effectiveStart); pageNum <= maxPageByCap; pageNum++) {
    const url = getSearchPageUrl(pageNum);
    log(`Fetching list page ${pageNum}/${maxPageByCap}...`);
    const html = await fetchText(url);
    const items = parseSearchItems(html, pageNum);

    let added = 0;
    for (const it of items) {
      if (!itemsByUrl[it.detailUrl]) added++;
      itemsByUrl[it.detailUrl] = { ...(itemsByUrl[it.detailUrl] || {}), ...it };
    }

    progress.list.itemsByUrl = itemsByUrl;
    progress.list.lastPage = pageNum;
    saveProgress(progress);

    log(`✓ Page ${pageNum}: ${items.length} items (${added} new). Total URLs=${Object.keys(itemsByUrl).length}`);
  }

  // Phase 2: details
  const urls = Object.keys(progress.list.itemsByUrl || {});
  log(`Detail phase: total URLs discovered=${urls.length}`);

  let toProcess = urls.filter((u) => !progress.details.processedByUrl?.[u]);
  if (MAX_DETAILS) toProcess = toProcess.slice(0, MAX_DETAILS);

  log(`Detail phase: this run will process ${toProcess.length} (concurrency=${CONCURRENCY})`);

  const limit = pLimit(Math.max(1, CONCURRENCY));

  let done = 0;
  let ok = 0;
  let fail = 0;

  const saveEvery = 25;

  await Promise.all(
    toProcess.map((u) =>
      limit(async () => {
        try {
          const detail = await extractDetail(u);
          const card = progress.list.itemsByUrl[u] || {};

          progress.details.processedByUrl[u] = {
            ...detail,
            // Merge list preview fields
            list: card
          };
          ok++;
        } catch (e) {
          progress.details.errorsByUrl[u] = {
            error: e.message,
            at: new Date().toISOString()
          };
          fail++;
        } finally {
          done++;
          if (done % saveEvery === 0) {
            saveProgress(progress);
            log(`Progress: ${done}/${toProcess.length} ok=${ok} fail=${fail}`);
          }
          await delay(REQUEST_DELAY_MS);
        }
      })
    )
  );

  saveProgress(progress);
  log(`✅ Detail phase complete: ok=${ok}, fail=${fail}`);

  // Write output
  const artworks = Object.values(progress.details.processedByUrl || {});
  ensureDir(OUTPUT_FILE);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
  log(`💾 Wrote ${artworks.length} artworks to ${OUTPUT_FILE}`);

  log('🎯 Notes:');
  log(' - artwork.sourcePageUrl/detailUrl is the original artwork page (use for modal click-through)');
  log(' - artwork.images[].sourcePageUrl is also set to detailUrl');
  log(' - artwork.metadata contains raw JSON-LD + dataLayer taxonomies ("all metadata" best-effort)');
};

main().catch((e) => {
  log(`❌ Fatal: ${e.message}`);
  console.error(e);
  process.exit(1);
});
