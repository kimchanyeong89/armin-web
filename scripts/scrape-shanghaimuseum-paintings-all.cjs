#!/usr/bin/env node
/* eslint-disable no-console */

/*
  Shanghai Museum (shanghaimuseum.net) — Collection Highlights: PAINTINGS (ALL)

  Source page (English):
    https://www.shanghaimuseum.net/mu/frontend/pg/en/collection/antique?types=CP_HIGH_CLASS_TYPE_EN_7

  APIs used by the site:
  - POST /mu/frontend/pg/collection/search-antique
      Body: { params: {...filters}, page, limit }
      Notes: the site helper (site2/js/ajax.js) replaces "" with null.

  - (Images) GET /mu/frontend/pg/article/aid/{code}
      HTML that contains <figure data-src="{hires}"><img src="{thumb}"></figure>

  Output:
    public/data/shanghaimuseum-paintings-all.json

  Usage:
    node scripts/scrape-shanghaimuseum-paintings-all.cjs

  Env:
    LIMIT=0                // 0 => all (default)
    PAGE_SIZE=20           // default 20 (matches site)
    CONCURRENCY=6          // image-iframe fetch concurrency
    REQUEST_TIMEOUT_MS=30000
    RETRIES=3
*/

const fs = require('node:fs/promises');
const path = require('node:path');

const cheerio = require('cheerio');

const pLimitImport = require('p-limit');
const pLimit = pLimitImport?.default || pLimitImport;

const ORIGIN = 'https://www.shanghaimuseum.net';
const MU_BASE = `${ORIGIN}/mu/`;

const SEARCH_ENDPOINT = `${MU_BASE}frontend/pg/collection/search-antique`;
const ARTICLE_ENDPOINT = `${MU_BASE}frontend/pg/article/id/`;
const ARTICLE_AID_ENDPOINT = `${MU_BASE}frontend/pg/article/aid/`;

const TYPES_PAINTINGS = 'CP_HIGH_CLASS_TYPE_EN_7';

const LIMIT = Math.max(0, Number(process.env.LIMIT || '0') || 0);
const PAGE_SIZE = Math.max(1, Number(process.env.PAGE_SIZE || '20') || 20);
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || '6') || 6);
const REQUEST_TIMEOUT_MS = Math.max(1000, Number(process.env.REQUEST_TIMEOUT_MS || '30000') || 30000);
const RETRIES = Math.max(1, Number(process.env.RETRIES || '3') || 3);

const OUT_DIR = path.join(process.cwd(), 'public', 'data');
const OUT_JSON = path.join(OUT_DIR, 'shanghaimuseum-paintings-all.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cleanText = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const toAbs = (maybePathOrUrl) => {
  const s = String(maybePathOrUrl || '').trim();
  if (!s) return '';
  try {
    return new URL(s, MU_BASE).toString();
  } catch {
    return '';
  }
};

const htmlToText = (html) => {
  const s = String(html || '').trim();
  if (!s) return '';
  const $ = cheerio.load(`<div id="__root">${s}</div>`);
  return cleanText($('#__root').text());
};

const parseCatalogHtml = (catalogHtml) => {
  const s = String(catalogHtml || '').trim();
  if (!s) return {};

  const $ = cheerio.load(`<div id="__root">${s}</div>`);
  const lines = [];
  $('#__root')
    .find('p,li')
    .each((_, el) => {
      const t = cleanText($(el).text());
      if (t) lines.push(t);
    });

  // Typical format:
  //   Artist: Chen Jiru (1558-1639)
  //   Date: Ming (1368-1644)
  //   Dimensions: Height 23.5 cm, Width 15.2 cm
  //   Material: Ink and colour on paper
  const out = {};
  for (const line of lines) {
    const m = line.match(/^([^:]{2,40}):\s*(.+)$/);
    if (!m) continue;
    const k = cleanText(m[1]).toLowerCase();
    const v = cleanText(m[2]);
    if (!v) continue;
    out[k] = v;
  }
  return out;
};

const normalizeDims = (s) => {
  const t = cleanText(s);
  if (!t) return '';
  // Keep as-is; just normalize separators a bit.
  return t
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s*×\s*/g, ' × ')
    .replace(/\s*x\s*/gi, ' × ');
};

const jsonReplacerEmptyToNull = (_key, value) => {
  if (value === '') return null;
  return value;
};

const postJson = async (url, data, attempt = 1) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; armin-web scraper)',
        'Accept': 'application/json, text/plain, */*',
      },
      body: JSON.stringify(data, jsonReplacerEmptyToNull),
      signal: controller.signal,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText} :: ${txt.slice(0, 200)}`);
    }

    const j = await res.json();
    if (j?.code !== 0) throw new Error(`API code ${j?.code}: ${j?.msg || 'unknown error'}`);
    return j;
  } catch (err) {
    if (attempt < RETRIES) {
      const backoff = 250 * Math.pow(2, attempt - 1);
      await sleep(backoff);
      return postJson(url, data, attempt + 1);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
};

const fetchText = async (url, attempt = 1) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; armin-web scraper)',
        'Accept': 'text/html, */*',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText} :: ${txt.slice(0, 200)}`);
    }
    return await res.text();
  } catch (err) {
    if (attempt < RETRIES) {
      const backoff = 250 * Math.pow(2, attempt - 1);
      await sleep(backoff);
      return fetchText(url, attempt + 1);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
};

const fetchListPage = async (page) => {
  const body = {
    params: {
      langCode: 'ENGLISH',
      antiqueSourceCode: 'ANTIQUE_SOURCE_1',
      esFlag: true,
      // paintings only
      types: TYPES_PAINTINGS,
      // remaining filters default to null
      ai0: null,
      ai1: null,
      keywords: null,
      ages: null,
      year: null,
      place: null,
      author: null,
      matter: null,
      shape: null,
      style: null,
      subject: null,
      subtype: null,
      tech: null,
      objectFlag: null,
      videoFlag: null,
      stampFlag: null,
      prefaceFlag: null,
      donateFlag: null,
      unearthFlag: null,
    },
    page,
    limit: PAGE_SIZE,
  };

  return postJson(SEARCH_ENDPOINT, body);
};

const parseAidImages = (aidHtml) => {
  const $ = cheerio.load(aidHtml);
  const hires = [];
  const thumbs = [];

  $('figure[data-src]').each((_, el) => {
    const src = $(el).attr('data-src') || '';
    const img = $(el).find('img[src]').attr('src') || '';
    if (src) hires.push(toAbs(src));
    if (img) thumbs.push(toAbs(img));
  });

  return {
    hires: hires.filter(Boolean),
    thumbs: thumbs.filter(Boolean),
  };
};

const transformItem = (it, aid) => {
  const code = String(it?.code || '').trim();
  if (!code) return null;

  const catalogMap = parseCatalogHtml(it?.catalog);

  const title = htmlToText(it?.name) || 'Untitled';
  const description = htmlToText(it?.description);

  const artist = catalogMap.artist || '';
  const date = catalogMap.date || it?.age?.entryItemName || '';
  const medium = catalogMap.material || '';
  const dimensions = normalizeDims(catalogMap.dimensions || '');

  const images = [
    toAbs(it?.thumbnailPath),
    ...(aid?.thumbs || []),
    toAbs(it?.picPath),
    toAbs(it?.picPath2),
  ].filter(Boolean);

  const waterImages = (aid?.hires || []).filter(Boolean);

  return {
    id: `shanghaimuseum-${code}`,
    source: 'Shanghai Museum',
    title,
    artist,
    date,
    medium,
    dimensions,
    category: it?.antiqueType1?.entryItemName || 'PAINTINGS',
    description,
    descriptionHtml: typeof it?.description === 'string' ? String(it.description) : '',
    image: images[0] || waterImages[0] || '',
    images,
    waterImages,
    url: `${ARTICLE_ENDPOINT}${encodeURIComponent(code)}`,
    raw: {
      code,
      api: it,
      catalogMap,
      descriptionHtml: String(it?.description || ''),
      catalogHtml: String(it?.catalog || ''),
      aid: {
        url: `${ARTICLE_AID_ENDPOINT}${encodeURIComponent(code)}`,
        hires: aid?.hires || [],
        thumbs: aid?.thumbs || [],
      },
    },
  };
};

async function main() {
  console.log('[shanghaimuseum] Scraping paintings via search-antique');
  console.log(`[shanghaimuseum] pageSize=${PAGE_SIZE} concurrency=${CONCURRENCY} limit=${LIMIT || 'ALL'}`);

  const first = await fetchListPage(1);
  const total = Number(first?.count || 0);
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error(`Unexpected count: ${first?.count}`);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const pagesToFetch = LIMIT > 0 ? Math.min(totalPages, Math.ceil(LIMIT / PAGE_SIZE)) : totalPages;

  console.log(`[shanghaimuseum] total=${total} pages=${totalPages} fetching=${pagesToFetch}`);

  const rows = [];
  const pushPage = (j, pageNum) => {
    const list = Array.isArray(j?.data) ? j.data : [];
    if (!list.length) console.warn(`[shanghaimuseum] page ${pageNum}: empty list`);
    for (const it of list) rows.push(it);
  };

  pushPage(first, 1);

  for (let page = 2; page <= pagesToFetch; page++) {
    if (page % 2 === 0) console.log(`[shanghaimuseum] fetching page ${page}/${pagesToFetch}`);
    const j = await fetchListPage(page);
    pushPage(j, page);
    await sleep(120);
  }

  const uniqueByCode = new Map();
  for (const it of rows) {
    const code = String(it?.code || '').trim();
    if (!code) continue;
    if (!uniqueByCode.has(code)) uniqueByCode.set(code, it);
  }

  const uniques = Array.from(uniqueByCode.values());
  const capped = LIMIT > 0 ? uniques.slice(0, LIMIT) : uniques;

  console.log(`[shanghaimuseum] list items raw=${rows.length} unique=${uniques.length} using=${capped.length}`);

  const limit = pLimit(CONCURRENCY);
  const withAid = await Promise.all(
    capped.map((it, idx) =>
      limit(async () => {
        const code = String(it?.code || '').trim();
        if (!code) return { it, aid: null };
        if ((idx + 1) % 50 === 0) console.log(`[shanghaimuseum] aid ${idx + 1}/${capped.length}`);
        try {
          const html = await fetchText(`${ARTICLE_AID_ENDPOINT}${encodeURIComponent(code)}`);
          return { it, aid: parseAidImages(html) };
        } catch (err) {
          return { it, aid: { hires: [], thumbs: [], error: String(err?.message || err) } };
        }
      }),
    ),
  );

  const items = withAid
    .map(({ it, aid }) => transformItem(it, aid))
    .filter(Boolean)
    // defensive: require at least one image candidate
    .filter((x) => !!x.image);

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_JSON, JSON.stringify(items, null, 2), 'utf8');

  console.log(`[shanghaimuseum] wrote ${OUT_JSON} items=${items.length}`);
}

main().catch((err) => {
  console.error('[shanghaimuseum] FAILED:', err);
  process.exit(1);
});
