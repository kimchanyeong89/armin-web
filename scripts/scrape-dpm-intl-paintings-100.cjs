/*
  Scrape The Palace Museum (intl.dpm.org.cn) collection: Paintings only.

  Efficient strategy:
  - Use the site's internal collection search endpoint (HTML fragment via AJAX):
      GET https://intl.dpm.org.cn/searchs/collection (with X-Requested-With)
    Passing category filter as an array param:
      category[]=132   // "Paintings" (from collection_list.html)

  - Discover item detail URLs from the returned fragment.
  - Fetch each detail page and extract all metadata pairs shown (dt/dd rows).

  Output:
    public/data/dpm-intl-paintings-100.json

  Usage:
    node ./scripts/scrape-dpm-intl-paintings-100.cjs

  Env:
    LIMIT=100  (default 100)
*/

const fs = require('node:fs/promises');
const path = require('node:path');

const cheerio = require('cheerio');
const pLimitImport = require('p-limit');
const pLimit = pLimitImport?.default || pLimitImport;

const BASE = 'https://intl.dpm.org.cn';
const REFERER = `${BASE}/collection_list.html?l=en`;
const SEARCH_ENDPOINT = `${BASE}/searchs/collection`;

const CATEGORY_PAINTINGS_ID = 132;
const PAGESIZE = 12;

const LIMIT = Math.max(1, Number(process.env.LIMIT || '100') || 100);
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || '6') || 6);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fetchText = async (url, init = {}) => {
  const res = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; armin-web scraper)',
      'Accept': 'text/html, */*; q=0.01',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
};

const buildSearchUrl = (page) => {
  const u = new URL(SEARCH_ENDPOINT);
  // emulate jQuery's cache-buster: url + '?' + Math.random()
  u.searchParams.set(String(Math.random()), '');

  u.searchParams.set('tpl_file', 'collection_list');
  u.searchParams.set('pagesize', String(PAGESIZE));
  u.searchParams.set('p', String(page));
  u.searchParams.set('l', 'en');

  // Critical: the site builds search['category'] as an array and jQuery serializes it as category[]=132
  u.searchParams.append('category[]', String(CATEGORY_PAINTINGS_ID));

  return u.toString();
};

const parseTotalResult = (html) => {
  const m = html.match(/var\s+total_result\s*=\s*"(\d+)"/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
};

const normalizeSpace = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const parseListFragment = (html) => {
  const $ = cheerio.load(html);
  const out = [];

  // The fragment contains two views: .list (thumbnail) and .list1 (simple list).
  // We read from .list first and dedupe later.
  $('.list .list-item a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const absUrl = href ? new URL(href, BASE).toString() : '';
    const img = $(el).find('img').attr('src') || '';
    const title = normalizeSpace($(el).find('.text .t').text());
    const period = normalizeSpace($(el).find('.text .p').text());
    if (!absUrl) return;
    out.push({ url: absUrl, imageUrl: img, title, period });
  });

  return out;
};

const extractDetailDlMap = ($) => {
  const map = {};
  $('.collection_detail2 .l .dl').each((_, el) => {
    const dt = normalizeSpace($(el).find('.dt').text()).replace(/:$/, '');
    const dd = normalizeSpace($(el).find('.dd').text());
    if (!dt) return;
    if (!dd) return;
    map[dt] = dd;
  });
  return map;
};

const parseDetailPage = (html, detailUrl) => {
  const $ = cheerio.load(html);

  const title = normalizeSpace($('.collection_detail2 .tit_box .tit.fft').first().text());

  const dl = extractDetailDlMap($);
  const category = dl['Category'] || '';
  const period = dl['Period'] || '';

  // Best-effort for additional metadata if present
  const artist = dl['Artist'] || dl['Creator'] || '';
  const medium = dl['Material'] || dl['Materials'] || dl['Medium'] || '';
  const dimensions = dl['Dimensions'] || dl['Dimension'] || dl['Size'] || '';
  const description = dl['Description'] || dl['Introduction'] || '';

  const img = (
    $('.collection_detail1 img').first().attr('src') ||
    $('.collection_detail2 .big img').first().attr('src') ||
    ''
  );

  const idMatch = detailUrl.match(/\/(\d+)\.html(?:\?|$)/);
  const idNum = idMatch ? idMatch[1] : '';

  return {
    id: idNum ? `dpm-${idNum}` : `dpm-${Buffer.from(detailUrl).toString('base64').slice(0, 12)}`,
    title: title || 'Untitled',
    artist: artist || 'Unknown',
    date: period || '',
    medium,
    dimensions,
    description,
    category,
    imageUrl: img,
    detailUrl,
    sourceUrl: detailUrl,
    raw: {
      dl,
    },
  };
};

const uniqBy = (arr, keyFn) => {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const k = keyFn(item);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
};

const main = async () => {
  console.log(`[DPM] Paintings: collecting ${LIMIT} items (category[]=${CATEGORY_PAINTINGS_ID})`);

  const discovered = [];
  let totalPaintings = null;

  // Discover enough unique detail URLs by paging the fragment.
  // We intentionally keep this small (LIMIT) rather than crawling the full corpus.
  for (let page = 1; discovered.length < LIMIT && page < 500; page++) {
    const url = buildSearchUrl(page);
    const html = await fetchText(url, {
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': REFERER,
      },
    });

    if (totalPaintings === null) {
      totalPaintings = parseTotalResult(html);
      if (Number.isFinite(totalPaintings)) {
        console.log(`[DPM] Total Paintings reported by backend: ${totalPaintings}`);
      }
    }

    const items = parseListFragment(html);
    const before = discovered.length;
    for (const it of items) {
      if (!it?.url) continue;
      discovered.push(it);
    }

    const deduped = uniqBy(discovered, (x) => x.url);
    discovered.length = 0;
    discovered.push(...deduped);

    console.log(`[DPM] page=${page} -> +${items.length} (unique ${before} -> ${discovered.length})`);

    if (items.length === 0) break;
    await sleep(120);
  }

  const targets = discovered.slice(0, LIMIT);
  if (!targets.length) throw new Error('No items discovered from /searchs/collection');

  console.log(`[DPM] Fetching detail pages (concurrency=${CONCURRENCY})`);
  const limit = pLimit(CONCURRENCY);

  const results = (await Promise.all(
    targets.map((t, idx) =>
      limit(async () => {
        const detailUrl = t.url;
        try {
          const html = await fetchText(detailUrl, { headers: { Referer: REFERER } });
          const row = parseDetailPage(html, detailUrl);

          // Keep list-side hints too
          row.raw.list = {
            title: t.title || '',
            period: t.period || '',
            imageUrl: t.imageUrl || '',
          };

          // Enforce paintings-only, since URL paths aren\'t reliable.
          if (row.category && row.category !== 'Paintings') {
            console.warn(`[DPM] non-painting (skipped) idx=${idx} category=${row.category} url=${detailUrl}`);
            return null;
          }

          if (!row.imageUrl) {
            // fallback to list image if detail missing
            row.imageUrl = t.imageUrl || '';
          }

          return row;
        } catch (err) {
          console.warn(`[DPM] detail failed idx=${idx} url=${detailUrl}:`, err?.message || err);
          return null;
        }
      })
    ),
  )).filter(Boolean);

  // If any were skipped because category mismatch, top-up by paging more.
  // (Keep it simple: just truncate if we still got enough.)
  const finalRows = results.slice(0, LIMIT);

  const outPath = path.join(process.cwd(), 'public', 'data', `dpm-intl-paintings-${LIMIT}.json`);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(finalRows, null, 2) + '\n', 'utf8');

  console.log(`[DPM] Wrote ${finalRows.length} rows -> ${outPath}`);
  if (Number.isFinite(totalPaintings)) {
    console.log(`[DPM] Total Paintings (reported): ${totalPaintings}`);
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
