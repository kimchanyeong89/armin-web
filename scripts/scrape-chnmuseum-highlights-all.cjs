/*
  National Museum of China (English site) — Collection Highlights (ALL)

  Goal:
  - Discover all highlight detail pages across categories.
  - Scrape each detail page for: title, year/date, category, medium, dimensions, imageUrl.
  - Support checkpoint/resume (long-running).

  Output:
    public/data/nmc-highlights-all.jsonl (incremental)
    public/data/nmc-highlights-all.json  (final array)
    scripts/.state/nmc-highlights-all.state.json

  Usage:
    node ./scripts/scrape-chnmuseum-highlights-all.cjs

  Env:
    CONCURRENCY=6 (default 6)
    MAX_LIST_PAGES_PER_CATEGORY=200 (default 200)
    RESUME=1 (default 1)
*/

const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const cheerio = require('cheerio');
const pLimitImport = require('p-limit');
const pLimit = pLimitImport?.default || pLimitImport;

const BASE = 'https://en.chnmuseum.cn';
const LANDING_URL = `${BASE}/collections_577/?name=Highlights`;

const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || '6') || 6);
const MAX_LIST_PAGES_PER_CATEGORY = Math.max(1, Number(process.env.MAX_LIST_PAGES_PER_CATEGORY || '200') || 200);
const RESUME = String(process.env.RESUME || '1') !== '0';

const OUT_DIR = path.join(process.cwd(), 'public', 'data');
const OUT_JSONL = path.join(OUT_DIR, 'nmc-highlights-all.jsonl');
const OUT_JSON = path.join(OUT_DIR, 'nmc-highlights-all.json');

const STATE_DIR = path.join(process.cwd(), 'scripts', '.state');
const STATE_PATH = path.join(STATE_DIR, 'nmc-highlights-all.state.json');

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

const isDetailUrl = (url) => /\/t\d{8}_\d+\.html$/i.test(url);

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
  if (p === '/collections_577/collection_highlights_608/') return false;
  if (/\.html$/i.test(p)) return false;
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

const extractCategoryFromDetailUrl = (detailUrl) => {
  try {
    const u = new URL(detailUrl);
    const m = u.pathname.match(/^\/collections_577\/collection_highlights_608\/([^/]+)\//);
    return m ? m[1] : '';
  } catch {
    return '';
  }
};

const deriveCategoriesFromLanding = (html) => {
  const relMatchesAll = Array.from(
    html.matchAll(/\/collections_577\/collection_highlights_608\/[^"'\s>]+/g)
  ).map((m) => m[0]);

  const out = new Set();
  for (const rel of relMatchesAll) {
    const abs = ensureHttps(toAbs(rel, BASE));
    if (!isDetailUrl(abs)) continue;
    const cat = extractCategoryFromDetailUrl(abs);
    if (!cat) continue;
    out.add(`${BASE}/collections_577/collection_highlights_608/${cat}/`);
  }
  return Array.from(out);
};

const isListPageUrlWithinCategory = (url, categoryUrl) => {
  if (!url || !categoryUrl) return false;
  if (!url.startsWith(categoryUrl)) return false;
  if (url.includes('#')) return false;
  if (/\/index(?:_\d+)?\.html$/i.test(url)) return true;
  if (url === categoryUrl) return true;
  return false;
};

const extractLinksFromListPage = (html, baseUrl, categoryUrl) => {
  const $ = cheerio.load(html);
  const detail = new Set();
  const listPages = new Set();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const abs = ensureHttps(toAbs(href, baseUrl));
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

const pickBestImageFromDetailHtml = (html) => {
  const cptp = Array.from(
    html.matchAll(/https?:\/\/www\.chnmuseum\.cn\/zp\/cptp\/[^"'\s>]+\.(?:jpg|jpeg|png)/gi)
  ).map((m) => ensureHttps(m[0]));
  if (cptp.length) return cptp[0];

  const $ = cheerio.load(html);
  const candidates = [];
  $('img[src]').each((_, el) => {
    const src = $(el).attr('src') || '';
    const abs = ensureHttps(toAbs(src, BASE));
    if (!abs) return;
    if (!/\.(jpg|jpeg|png)(\?|$)/i.test(abs)) return;
    candidates.push(abs);
  });

  return candidates[0] || '';
};

const extractMediumAndDimensions = (html) => {
  const $ = cheerio.load(html);

  const bodyText = normalizeSpace($('body').text());
  const mBody = bodyText.match(/([A-Za-z][A-Za-z\s\-()]{2,80})\s*[,，]\s*([0-9.]+\s*[×x]\s*[0-9.]+\s*(?:cm|mm))\b/i);
  if (mBody) {
    return {
      medium: cleanMedium(mBody[1]),
      dimensions: normalizeSpace(mBody[2]).replace(/\s*[xX]\s*/g, ' × '),
    };
  }

  const textBlocks = [];
  // Many pages have the spec line inside an h3, near "规格".
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
  const $ = cheerio.load(html);

  const h2s = $('h2')
    .map((_, el) => normalizeSpace($(el).text()))
    .get()
    .filter(Boolean);

  const candidates = h2s
    .filter((t) => !/^\d{4}$/.test(t))
    .filter((t) => !/(cm|mm)\b/i.test(t))
    .filter((t) => t.length >= 3 && t.length <= 80);

  // Typically the category appears right under the title (e.g., "Modern and contemporary").
  if (candidates.length) return candidates[0];

  // Fallback: try first meaningful strong tag.
  const strong = $('strong')
    .map((_, el) => normalizeSpace($(el).text()))
    .get()
    .filter(Boolean)
    .filter((t) => t.length >= 3 && t.length <= 80);

  return strong[0] || '';
};

const parseDetailPage = (html, pageUrl) => {
  const $ = cheerio.load(html);

  const title = normalizeSpace($('h1').first().text()) || normalizeSpace($('title').first().text()) || 'Untitled';

  let yearText = '';
  $('h2').each((_, el) => {
    const t = normalizeSpace($(el).text());
    if (/^\d{4}$/.test(t)) yearText = t;
  });

  if (!yearText) {
    const m = html.match(/\b(1\d{3}|20\d{2})\b/);
    if (m) yearText = m[1];
  }

  const section = extractSectionLabel(html);
  const { medium, dimensions } = extractMediumAndDimensions(html);
  // User expectation: category should be the medium label like "Oil Painting".
  const category = medium || extractCategoryFromTitle(title) || '';

  const imageUrl = pickBestImageFromDetailHtml(html);

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

const readJsonlDoneSet = async (jsonlPath) => {
  const done = new Set();
  if (!RESUME) return done;
  if (!fsSync.existsSync(jsonlPath)) return done;

  const rl = readline.createInterface({ input: fsSync.createReadStream(jsonlPath), crlfDelay: Infinity });
  for await (const line of rl) {
    const t = String(line || '').trim();
    if (!t) continue;
    try {
      const obj = JSON.parse(t);
      if (obj?.sourceUrl) done.add(obj.sourceUrl);
    } catch {
      // ignore
    }
  }
  return done;
};

const loadState = async () => {
  if (!RESUME) return null;
  try {
    const raw = await fs.readFile(STATE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const saveState = async (state) => {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
};

const buildDetailUrlIndex = async () => {
  const landingHtml = await fetchText(LANDING_URL);
  let categories = extractCategoryUrls(landingHtml);
  if (!categories.length) categories = deriveCategoriesFromLanding(landingHtml);

  const allDetail = new Set();

  for (const categoryUrl of categories) {
    const seenListPages = new Set();
    const queue = [categoryUrl];

    while (queue.length && seenListPages.size < MAX_LIST_PAGES_PER_CATEGORY) {
      const listUrl = queue.shift();
      if (!listUrl || seenListPages.has(listUrl)) continue;
      seenListPages.add(listUrl);

      let html;
      try {
        html = await fetchText(listUrl);
      } catch {
        continue;
      }

      const { detailUrls, listPageUrls } = extractLinksFromListPage(html, listUrl, categoryUrl);
      for (const d of detailUrls) allDetail.add(d);
      for (const p of listPageUrls) if (!seenListPages.has(p)) queue.push(p);

      await sleep(30);
    }
  }

  return { categories, detailUrls: Array.from(allDetail) };
};

const rebuildFinalJson = async () => {
  if (!fsSync.existsSync(OUT_JSONL)) return;

  const items = [];
  const seen = new Set();

  const rl = readline.createInterface({ input: fsSync.createReadStream(OUT_JSONL), crlfDelay: Infinity });
  for await (const line of rl) {
    const t = String(line || '').trim();
    if (!t) continue;
    try {
      const obj = JSON.parse(t);
      const key = obj?.id || obj?.sourceUrl;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      items.push(obj);
    } catch {
      // ignore
    }
  }

  await fs.writeFile(OUT_JSON, JSON.stringify(items, null, 2), 'utf8');
  return items.length;
};

const main = async () => {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(STATE_DIR, { recursive: true });

  if (!RESUME && fsSync.existsSync(OUT_JSONL)) {
    await fs.unlink(OUT_JSONL);
  }

  const prevState = await loadState();
  const prevDone = await readJsonlDoneSet(OUT_JSONL);

  console.log('[NMC Highlights ALL] Building index...');
  const { categories, detailUrls } = await buildDetailUrlIndex();
  console.log('[NMC Highlights ALL] Categories:', categories.length);
  console.log('[NMC Highlights ALL] Total detail pages discovered:', detailUrls.length);

  const state = {
    updatedAt: new Date().toISOString(),
    categories,
    totalDiscovered: detailUrls.length,
    detailUrls,
    doneCount: prevDone.size,
    doneCountFromState: prevState?.doneCount || 0,
  };
  await saveState(state);

  const done = prevDone;

  const remaining = detailUrls.filter((u) => !done.has(u));
  console.log('[NMC Highlights ALL] Remaining to fetch:', remaining.length);

  const limit = pLimit(CONCURRENCY);
  let wrote = 0;

  const tasks = remaining.map((url) =>
    limit(async () => {
      const html = await fetchText(url);
      const parsed = parseDetailPage(html, url);
      const item = {
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

      await fs.appendFile(OUT_JSONL, JSON.stringify(item) + '\n', 'utf8');
      done.add(url);
      wrote++;

      if (wrote % 50 === 0) {
        await saveState({ ...state, updatedAt: new Date().toISOString(), doneCount: done.size });
        console.log('[NMC Highlights ALL] Progress', done.size, '/', detailUrls.length);
      }
    })
  );

  await Promise.all(tasks);

  await saveState({ ...state, updatedAt: new Date().toISOString(), doneCount: done.size });
  const finalCount = await rebuildFinalJson();
  console.log('[NMC Highlights ALL] Wrote JSON:', OUT_JSON);
  console.log('[NMC Highlights ALL] Final count:', finalCount);
};

main().catch(async (e) => {
  try {
    await fs.mkdir(STATE_DIR, { recursive: true });
    await fs.writeFile(path.join(STATE_DIR, 'nmc-highlights-all.last-error.txt'), String(e?.stack || e), 'utf8');
  } catch {
    // ignore
  }
  console.error(e);
  process.exit(1);
});
