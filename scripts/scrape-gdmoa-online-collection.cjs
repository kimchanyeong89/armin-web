/*
  Scrape Guangdong Museum of Art (GDMOA) Online Collection.

  Source (efficient):
    https://www.gdmoa.org/Collection/Online_Collection/index_1.json
    ... index_2.json, ... until the last existing page.

  Each page is a JSON array with fields like:
    { type, title, author, date, href, photo: [{ src }] }

  Output:
    public/data/gdmoa-online-collection-all.json  (array)

  Usage:
    node ./scripts/scrape-gdmoa-online-collection.cjs

  Env:
    LIMIT=0        // 0 means ALL (default)
    MAX_PAGES=0    // 0 means auto-detect last page (default)
*/

const fs = require('node:fs/promises');
const path = require('node:path');
const cheerio = require('cheerio');
const pLimit = require('p-limit').default || require('p-limit');

const BASE = 'https://www.gdmoa.org';
const LIST_PREFIX = `${BASE}/Collection/Online_Collection/index_`;

const LIMIT = Math.max(0, Number(process.env.LIMIT || '0') || 0);
const MAX_PAGES = Math.max(0, Number(process.env.MAX_PAGES || '0') || 0);
const ENRICH_DETAILS = String(process.env.ENRICH_DETAILS || '1') !== '0';
const DETAIL_CONCURRENCY = Math.max(1, Math.min(12, Number(process.env.DETAIL_CONCURRENCY || '6') || 6));
const INCLUDE_ENGLISH_HIGHLIGHTS = String(process.env.INCLUDE_ENGLISH_HIGHLIGHTS || '1') !== '0';

const OUT_DIR = path.join(process.cwd(), 'public', 'data');
const OUT_JSON = path.join(OUT_DIR, 'gdmoa-online-collection-all.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ensureHttps = (u) => {
  const s = String(u || '').trim();
  if (!s) return '';
  return s.replace(/^http:\/\//i, 'https://');
};

const fetchJson = async (url) => {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; armin-web scraper)',
      Accept: 'application/json, text/plain, */*',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
};

const fetchText = async (url) => {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; armin-web scraper)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
};

const tryFetchPage = async (page) => {
  const url = `${LIST_PREFIX}${page}.json`;
  try {
    const data = await fetchJson(url);
    if (!Array.isArray(data)) return null;
    return data;
  } catch (err) {
    return null;
  }
};

const detectLastPage = async () => {
  // The dataset is small; a simple forward scan is fine.
  // Stop at the first missing page.
  let page = 1;
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const data = await tryFetchPage(page);
    if (!data) return page - 1;
    page += 1;

    // safety cap
    if (page > 5000) return 5000;

    // be polite to their origin/CDN
    // eslint-disable-next-line no-await-in-loop
    await sleep(60);
  }
};

const toIdFromHref = (href) => {
  try {
    const u = new URL(href);
    const file = u.pathname.split('/').pop() || '';
    const m = file.match(/t(\d{8})_(\d+)\.(?:shtml|html)/i);
    if (m) return `gdmoa-${m[2]}`;
    if (file) return `gdmoa-${file.replace(/\W+/g, '-').replace(/^-+|-+$/g, '')}`;
  } catch {
    // ignore
  }
  return null;
};

const pickFirstPhoto = (photo) => {
  if (!Array.isArray(photo)) return '';
  const src = photo.map((p) => ensureHttps(p?.src)).find((s) => !!s);
  return src || '';
};

const fetchEnglishHighlightDetailUrls = async () => {
  const url = `${BASE}/english/Collection/Online_Collection/index.shtml`;
  try {
    const html = await fetchText(url);
    const $ = cheerio.load(html);
    const urls = new Set();
    $('a[href]').each((_, el) => {
      const href = String($(el).attr('href') || '').trim();
      if (!href) return;
      if (!/t\d{8}_\d+\.shtml/i.test(href)) return;
      try {
        const abs = ensureHttps(new URL(href, url).toString());
        urls.add(abs);
      } catch {
        // ignore
      }
    });
    return Array.from(urls);
  } catch {
    return [];
  }
};

const normalizeDimensions = (s) => {
  const t = String(s || '').trim();
  if (!t) return '';
  // Normalize various x/× variants and remove surrounding whitespace
  return t
    .replace(/\s*[xX×]\s*/g, '×')
    .replace(/\s+/g, ' ')
    .trim();
};

const parseDetailPage = (html, detailUrl) => {
  const $ = cheerio.load(html);

  const title = $('h1').first().text().trim();
  const artist = $('.work-info-author-name').first().text().trim();
  const age = $('.work-info-age').first().text().trim();
  // Example: "1959/水彩画/33×50"
  const parts = age.split('/').map((x) => x.trim()).filter(Boolean);
  const date = parts[0] || '';
  const category = parts[1] || '';
  const dimensions = normalizeDimensions(parts[2] || '');

  const imgSrc = $('.collection-img').first().attr('src') || '';
  let image = '';
  if (imgSrc) {
    try {
      image = ensureHttps(new URL(imgSrc, detailUrl).toString());
    } catch {
      image = ensureHttps(imgSrc);
    }
  }

  return {
    title,
    artist,
    date,
    category,
    dimensions,
    image,
  };
};

const main = async () => {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const lastPage = MAX_PAGES > 0 ? MAX_PAGES : await detectLastPage();
  if (!lastPage || lastPage < 1) throw new Error('Could not detect any index_N.json pages');

  console.log(`[GDMOA] Fetching pages 1..${lastPage}`);

  const merged = [];
  for (let page = 1; page <= lastPage; page++) {
    // eslint-disable-next-line no-await-in-loop
    const data = await fetchJson(`${LIST_PREFIX}${page}.json`);
    if (!Array.isArray(data)) continue;

    for (const row of data) merged.push({ ...row, _page: page });

    if (page === 1 || page % 5 === 0) {
      console.log(`[GDMOA] page=${page}/${lastPage} itemsSoFar=${merged.length}`);
    }

    // eslint-disable-next-line no-await-in-loop
    await sleep(80);
  }

  const seenHref = new Set();
  const items = [];

  for (const raw of merged) {
    const href = ensureHttps(raw?.href);
    if (!href) continue;
    if (seenHref.has(href)) continue;
    seenHref.add(href);

    const id = toIdFromHref(href) || `gdmoa-${items.length + 1}`;

    const image = pickFirstPhoto(raw?.photo);

    items.push({
      id,
      title: String(raw?.title || '').trim() || 'Untitled',
      artist: String(raw?.author || '').trim() || 'Unknown',
      date: String(raw?.date || '').trim(),
      // For GDMOA list JSON, `type` is effectively the category/genre (e.g. 水彩画/书法/版画 ...)
      category: String(raw?.type || '').trim(),
      medium: '',
      dimensions: '',
      image,
      images: image ? [image] : [],
      detailUrl: href,
      sourceUrl: href,
      raw,
    });

    if (LIMIT > 0 && items.length >= LIMIT) break;
  }

  if (INCLUDE_ENGLISH_HIGHLIGHTS) {
    const englishUrls = await fetchEnglishHighlightDetailUrls();
    if (englishUrls.length) {
      console.log(`[GDMOA] Found ${englishUrls.length} English highlight items (will merge)`);
      for (const u of englishUrls) {
        if (seenHref.has(u)) continue;
        seenHref.add(u);
        const id = toIdFromHref(u) || `gdmoa-${items.length + 1}`;
        items.push({
          id,
          title: 'Untitled',
          artist: 'Unknown',
          date: '',
          category: '',
          medium: '',
          dimensions: '',
          image: '',
          images: [],
          detailUrl: u,
          sourceUrl: u,
          raw: { _source: 'english-index' },
        });
        if (LIMIT > 0 && items.length >= LIMIT) break;
      }
    }
  }

  console.log(`[GDMOA] deduped=${items.length}`);

  if (ENRICH_DETAILS) {
    console.log(`[GDMOA] Enriching details (concurrency=${DETAIL_CONCURRENCY})`);
    const limit = pLimit(DETAIL_CONCURRENCY);

    let done = 0;
    await Promise.all(
      items.map((it) =>
        limit(async () => {
          try {
            const html = await fetchText(it.detailUrl);
            const d = parseDetailPage(html, it.detailUrl);

            // Prefer detail page values when present.
            if (d.title) it.title = d.title;
            if (d.artist) it.artist = d.artist;
            if (d.date) it.date = d.date;
            if (d.category) it.category = d.category;
            if (d.dimensions) it.dimensions = d.dimensions;
            if (d.image && !it.image) {
              it.image = d.image;
              it.images = [d.image];
            }
          } catch (err) {
            // Non-fatal: keep list JSON data.
            it._detailError = String(err?.message || err);
          } finally {
            done += 1;
            if (done === 1 || done % 25 === 0 || done === items.length) {
              console.log(`[GDMOA] detail ${done}/${items.length}`);
            }
            // Polite pacing to origin/CDN
            await sleep(40);
          }
        })
      )
    );
  }

  const withImages = items.filter((it) => !!it.image);
  console.log(`[GDMOA] withImages=${withImages.length}`);

  await fs.writeFile(OUT_JSON, JSON.stringify(withImages, null, 2) + '\n', 'utf8');
  console.log(`[GDMOA] Wrote ${withImages.length} items -> ${OUT_JSON}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
