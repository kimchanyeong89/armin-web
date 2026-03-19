/*
  National Museum of China (English site) — Collection Highlights

  The English “Collection Highlights” section contains editorial pages for highlighted items.
  Those pages often embed images from www.chnmuseum.cn (e.g. /zp/cptp/...).

  This scraper:
  - Crawls the Collection Highlights landing page to discover category pages.
  - Walks listing pages to collect detail-page URLs.
  - Fetches detail pages and extracts title/year + best available image URL.

  Output:
    public/data/nmc-highlights-100.json

  Usage:
    node ./scripts/scrape-chnmuseum-highlights-100.cjs

  Env:
    LIMIT=100 (default 100)
    CONCURRENCY=6 (default 6)
    MAX_LIST_PAGES_PER_CATEGORY=50 (default 50)
*/

const fs = require('node:fs/promises');
const path = require('node:path');

const cheerio = require('cheerio');
const pLimitImport = require('p-limit');
const pLimit = pLimitImport?.default || pLimitImport;

const BASE = 'https://en.chnmuseum.cn';
const HIGHLIGHTS_ROOT = `${BASE}/collections_577/collection_highlights_608/`;
const LANDING_URL = `${BASE}/collections_577/?name=Highlights`;

const LIMIT = Math.max(1, Number(process.env.LIMIT || '100') || 100);
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || '6') || 6);
const MAX_LIST_PAGES_PER_CATEGORY = Math.max(1, Number(process.env.MAX_LIST_PAGES_PER_CATEGORY || '50') || 50);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ensureHttps = (url) => {
  if (!url) return '';
  return String(url).replace(/^http:\/\//i, 'https://');
};

const normalizeSpace = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const cleanMedium = (s) => normalizeSpace(s).replace(/^[^A-Za-z]*h\d>\s*/i, '');

const extractCategoryFromTitle = (title) => {
  const t = normalizeSpace(title);
  if (!t) return '';
  const m = t.match(
    /^(Oil Painting|Ink and (?:colour|color) on (?:paper|silk)|Gouache on paper|Watercolou?r on paper|Acrylic on canvas|Tempera on paper)\b/i,
  );
  if (!m) return '';

  const v = m[1].toLowerCase();
  if (v === 'oil painting') return 'Oil Painting';
  if (v.startsWith('ink and colour on ')) return `Ink and colour on ${m[1].slice('Ink and colour on '.length)}`;
  if (v.startsWith('ink and color on ')) return `Ink and color on ${m[1].slice('Ink and color on '.length)}`;
  return m[1];
};

const fetchText = async (url) => {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; armin-web scraper)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
};

const toAbs = (href, baseUrl) => {
  if (!href) return '';
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return '';
  }
};

const isHighlightsCategoryUrl = (url) => {
  if (!url) return false;
  const fixed = ensureHttps(String(url));
  if (fixed.includes('#')) return false;

  let u;
  try {
    u = new URL(fixed);
  } catch {
    return false;
  }

  if (u.origin !== BASE) return false;
  const p = u.pathname;
  if (!p.startsWith('/collections_577/collection_highlights_608/')) return false;
  if (p === '/collections_577/collection_highlights_608/' || fixed === HIGHLIGHTS_ROOT) return false;
  if (/\.html$/i.test(p)) return false;
  // category pages are single-segment directories under collection_highlights_608/
  if (!/^\/collections_577\/collection_highlights_608\/[^/]+\/?$/.test(p)) return false;
  return true;

};

const extractCategoryUrls = (html) => {
  const $ = cheerio.load(html);
  const out = new Set();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    let abs = ensureHttps(toAbs(href, BASE));
    if (!abs) return;
    if (isHighlightsCategoryUrl(abs)) {
      if (!abs.endsWith('/')) abs += '/';
      out.add(abs);
    }
  });
  return Array.from(out);
};

const isDetailUrl = (url) => {
  // typical: .../YYYYMM/tYYYYMMDD_123456.html
  return /\/t\d{8}_\d+\.html$/i.test(url);
};

const isListPageUrlWithinCategory = (url, categoryUrl) => {
  if (!url || !categoryUrl) return false;
  if (!url.startsWith(categoryUrl)) return false;
  if (url.includes('#')) return false;
  // common pagination patterns: index.html, index_1.html
  if (/\/index(?:_\d+)?\.html$/i.test(url)) return true;
  // some pages might be plain directory listing (categoryUrl itself)
  if (url === categoryUrl) return true;
  return false;
};

const extractLinksFromListPage = (html, baseUrl, categoryUrl) => {
  const $ = cheerio.load(html);
  const detail = new Set();
  const listPages = new Set();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const abs = toAbs(href, baseUrl);
    if (!abs) return;

    if (isDetailUrl(abs) && abs.startsWith(categoryUrl)) {
      detail.add(abs);
      return;
    }

    if (isListPageUrlWithinCategory(abs, categoryUrl)) {
      listPages.add(abs);
    }
  });

  return {
    detailUrls: Array.from(detail),
    listPageUrls: Array.from(listPages),
  };
};

const pickBestImageFromDetailHtml = (html, pageUrl) => {
  // Prefer the museum-hosted cptp images.
  const cptp = Array.from(
    html.matchAll(/https?:\/\/www\.chnmuseum\.cn\/zp\/cptp\/[^"'\s>]+\.(?:jpg|jpeg|png)/gi)
  ).map((m) => ensureHttps(m[0]));

  if (cptp.length) return cptp[0];

  // Fallback: any img src ending in jpg/png.
  const $ = cheerio.load(html);
  const candidates = [];
  $('img[src]').each((_, el) => {
    const src = $(el).attr('src') || '';
    const abs = ensureHttps(toAbs(src, pageUrl));
    if (!abs) return;
    if (!/\.(jpg|jpeg|png)(\?|$)/i.test(abs)) return;
    candidates.push(abs);
  });

  return candidates[0] || '';
};

const extractMediumAndDimensions = (html) => {
  const $ = cheerio.load(html);

  // Prefer matching on visible body text (avoids inline CSS/HTML artifacts).
  const bodyText = normalizeSpace($('body').text());
  const mBody = bodyText.match(/([A-Za-z][A-Za-z\s\-()]{2,80})\s*[,，]\s*([0-9.]+\s*[×x]\s*[0-9.]+\s*(?:cm|mm))\b/i);
  if (mBody) {
    return {
      medium: cleanMedium(mBody[1]),
      dimensions: normalizeSpace(mBody[2]).replace(/\s*[xX]\s*/g, ' × '),
    };
  }

  // Fallback: search common elements for a spec-like line.
  const textBlocks = [];
  $('h3, p, span').each((_, el) => {
    const t = normalizeSpace($(el).text());
    if (!t) return;
    if (/\b(cm|mm)\b/i.test(t) && /[×x]/.test(t)) textBlocks.push(t);
  });

  const cleaned = normalizeSpace(textBlocks[0] || '');
  const m = cleaned.match(/^(.{2,80}?)[,，]\s*([0-9.]+\s*[×x]\s*[0-9.]+\s*(?:cm|mm))\b/i);
  if (m) {
    return { medium: cleanMedium(m[1]), dimensions: normalizeSpace(m[2]).replace(/\s*[xX]\s*/g, ' × ') };
  }

  const m2 = cleaned.match(/([0-9.]+\s*[×x]\s*[0-9.]+\s*(?:cm|mm))\b/i);
  if (m2) {
    return { medium: '', dimensions: normalizeSpace(m2[1]).replace(/\s*[xX]\s*/g, ' × ') };
  }

  return { medium: '', dimensions: '' };
};

const extractSectionLabel = (html) => {
  // e.g. "Modern and contemporary" (this is a section label, not the medium/category like "Oil Painting").
  const $ = cheerio.load(html);

  const h2s = $('h2')
    .map((_, el) => normalizeSpace($(el).text()))
    .get()
    .filter(Boolean);

  const candidates = h2s
    .filter((t) => !/^\d{4}$/.test(t))
    .filter((t) => !/(cm|mm)\b/i.test(t))
    .filter((t) => t.length >= 3 && t.length <= 80);

  return candidates[0] || '';
};

const parseDetailPage = (html, pageUrl) => {
  const $ = cheerio.load(html);

  const h1 = normalizeSpace($('h1').first().text());
  const title = h1 || normalizeSpace($('title').first().text()) || 'Untitled';

  // Many pages show year as an H2 that is just a 4-digit year.
  let yearText = '';
  $('h2').each((_, el) => {
    const t = normalizeSpace($(el).text());
    if (/^\d{4}$/.test(t)) yearText = t;
  });

  // If not found, fallback to the first 4-digit year in the body.
  if (!yearText) {
    const m = html.match(/\b(1\d{3}|20\d{2})\b/);
    if (m) yearText = m[1];
  }

  const section = extractSectionLabel(html);
  const { medium, dimensions } = extractMediumAndDimensions(html);
  // User expectation: category should be the medium label like "Oil Painting".
  // If we couldn't parse a medium, leave category blank (the UI will fallback).
  const category = medium || extractCategoryFromTitle(title) || '';

  const imageUrl = pickBestImageFromDetailHtml(html, pageUrl);

  return {
    title,
    date: yearText,
    category,
    medium: '',
    dimensions,
    imageUrl,
    sourceUrl: pageUrl,
    section,
  };
};

const stableIdFromUrl = (url) => {
  const m = url.match(/\/t(\d{8})_(\d+)\.html$/i);
  if (!m) return `nmc-hi-${Buffer.from(url).toString('base64url').slice(0, 12)}`;
  return `nmc-hi-${m[1]}-${m[2]}`;
};

const main = async () => {
  console.log('[NMC Highlights] Fetching highlights landing page...');
  const rootHtml = await fetchText(LANDING_URL);
  let categories = extractCategoryUrls(rootHtml);

  // Fallback: the landing page sometimes only contains *detail* links (not the category roots).
  // Derive category URLs from any found detail URLs.
  if (!categories.length) {
    const relMatchesAll = Array.from(
      rootHtml.matchAll(/\/collections_577\/collection_highlights_608\/[^"'\s>]+/g)
    ).map((m) => m[0]);
    for (const rel of relMatchesAll) {
      const abs = ensureHttps(toAbs(rel, BASE));
      if (!isDetailUrl(abs)) continue;
      const u = new URL(abs);
      const m = u.pathname.match(/^\/collections_577\/collection_highlights_608\/([^/]+)\//);
      if (m) {
        categories.push(`${BASE}/collections_577/collection_highlights_608/${m[1]}/`);
      }
    }
    categories = Array.from(new Set(categories));
  }

  console.log('[NMC Highlights] Categories:', categories.length);

  // Debug helper: persist what we discovered from the landing page.
  try {
    const stateDir = path.join(process.cwd(), 'scripts', '.state');
    await fs.mkdir(stateDir, { recursive: true });
    const absMatches = Array.from(
      rootHtml.matchAll(/https?:\/\/en\.chnmuseum\.cn\/collections_577\/collection_highlights_608\/[^\"'\s>]+/g)
    ).map((m) => ensureHttps(m[0]));

    const relMatches = Array.from(
      rootHtml.matchAll(/\/collections_577\/collection_highlights_608\/[^\"'\s>]+/g)
    ).map((m) => m[0]);

    const firstHitIdx = rootHtml.indexOf('collection_highlights_608');
    const nearby = firstHitIdx >= 0 ? rootHtml.slice(Math.max(0, firstHitIdx - 400), firstHitIdx + 600) : '';
    await fs.writeFile(
      path.join(stateDir, 'nmc-highlights-landing-discovery.json'),
      JSON.stringify(
        {
          landingUrl: LANDING_URL,
          categories,
          absMatches: absMatches.slice(0, 200),
          relMatches: relMatches.slice(0, 200),
          nearby,
        },
        null,
        2
      ),
      'utf8'
    );
  } catch {
    // ignore
  }

  // Ensure we at least include the known Artworks category if discovery fails.
  if (!categories.length) {
    categories.push(`${HIGHLIGHTS_ROOT}artworks_617/`);
  }

  const detailUrls = new Set();

  for (const categoryUrl of categories) {
    if (detailUrls.size >= LIMIT) break;

    console.log('[NMC Highlights] Crawling category:', categoryUrl);

    const seenListPages = new Set();
    const queue = [categoryUrl];

    while (queue.length && seenListPages.size < MAX_LIST_PAGES_PER_CATEGORY && detailUrls.size < LIMIT) {
      const listUrl = queue.shift();
      if (!listUrl || seenListPages.has(listUrl)) continue;
      seenListPages.add(listUrl);

      let html;
      try {
        html = await fetchText(listUrl);
      } catch (e) {
        console.warn('[NMC Highlights] Failed list page:', listUrl, String(e?.message || e));
        continue;
      }

      const { detailUrls: foundDetails, listPageUrls } = extractLinksFromListPage(html, listUrl, categoryUrl);

      for (const d of foundDetails) {
        detailUrls.add(d);
        if (detailUrls.size >= LIMIT) break;
      }

      for (const p of listPageUrls) {
        if (!seenListPages.has(p)) queue.push(p);
      }

      // Be polite
      await sleep(50);
    }
  }

  const picked = Array.from(detailUrls).slice(0, LIMIT);
  console.log('[NMC Highlights] Detail URLs:', picked.length);

  const limit = pLimit(CONCURRENCY);

  const items = await Promise.all(
    picked.map((url) =>
      limit(async () => {
        try {
          const html = await fetchText(url);
          const parsed = parseDetailPage(html, url);
          return {
            id: stableIdFromUrl(url),
            title: parsed.title,
            date: parsed.date,
            category: parsed.category,
            medium: parsed.medium,
            dimensions: parsed.dimensions,
            imageUrl: parsed.imageUrl,
            sourceUrl: parsed.sourceUrl,
            raw: {
              kind: 'nmc-highlights',
              section: parsed.section,
            },
          };
        } catch (e) {
          console.warn('[NMC Highlights] Failed detail:', url, String(e?.message || e));
          return null;
        }
      })
    )
  );

  const cleaned = items
    .filter(Boolean)
    .filter((it) => it.imageUrl)
    // dedupe by image+source
    .filter((it, idx, arr) => arr.findIndex((x) => x.imageUrl === it.imageUrl && x.sourceUrl === it.sourceUrl) === idx);

  console.log('[NMC Highlights] Parsed:', cleaned.length);

  const outPath = path.join(process.cwd(), 'public', 'data', 'nmc-highlights-100.json');
  await fs.writeFile(outPath, JSON.stringify(cleaned, null, 2), 'utf8');
  console.log('[NMC Highlights] Wrote:', outPath);

  // Optional quick sanity check: print a few samples.
  console.log('[NMC Highlights] Sample:', cleaned.slice(0, 5).map((x) => ({ id: x.id, title: x.title, date: x.date, imageUrl: x.imageUrl })));
};

main().catch(async (e) => {
  try {
    const stateDir = path.join(process.cwd(), 'scripts', '.state');
    await fs.mkdir(stateDir, { recursive: true });
    const out = [
      `[${new Date().toISOString()}] scrape-chnmuseum-highlights-100 failed`,
      '',
      String(e?.stack || e),
      '',
    ].join('\n');
    await fs.writeFile(path.join(stateDir, 'nmc-highlights-last-error.txt'), out, 'utf8');
  } catch {
    // ignore
  }

  console.error(e);
  process.exit(1);
});
