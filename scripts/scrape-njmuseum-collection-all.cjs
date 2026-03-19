#!/usr/bin/env node
/* eslint-disable no-console */

// Scrape Nanjing Museum (南京博物院) collection list from the site's own JSON API.
// Source page: https://www.njmuseum.org.cn/en/collectionList
// API: POST https://www.njmuseum.org.cn/api/collection/select (x-www-form-urlencoded)
//
// Default scope: ONLY category=9 (书画 / Paintings and Calligraphy) and category=11 (织绣 / Embroidery)
// You can override with env var CATEGORIES, e.g.:
//   CATEGORIES=9,11 node scripts/scrape-njmuseum-collection-all.cjs
//   CATEGORIES= node scripts/scrape-njmuseum-collection-all.cjs   # (blank) fetches all categories
//
// Output: public/data/njmuseum-collection-all.json (array)

const fs = require('fs');
const path = require('path');

const BASE = 'https://www.njmuseum.org.cn';
const OUT_FILE = path.join(__dirname, '..', 'public', 'data', 'njmuseum-collection-all.json');

const PAGE_SIZE = Number(process.env.PAGE_SIZE || 1000);
const MAX_PAGES = Number(process.env.MAX_PAGES || 0); // 0 = no cap
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 30000);
const RETRIES = Number(process.env.RETRIES || 3);

// Default to the two categories requested by the user.
// The API expects numeric string values under the parameter name `category`.
const DEFAULT_CATEGORIES = '9,11';
const CATEGORIES_RAW = process.env.CATEGORIES ?? DEFAULT_CATEGORIES;

const CATEGORY_LABEL_EN = {
  '9': 'Paintings and Calligraphy',
  '11': 'Embroidery',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const normalizePath = (p) => {
  if (!p) return '';
  return String(p).trim().replace(/\\+/g, '/');
};

const toAbsoluteUrl = (maybePathOrUrl) => {
  const s = normalizePath(maybePathOrUrl);
  if (!s) return '';
  try {
    if (/^https?:\/\//i.test(s)) {
      // Normalize + encode any spaces/unicode safely.
      return new URL(s).toString();
    }
    return new URL(s, BASE).toString();
  } catch {
    return '';
  }
};

const mapWithConcurrency = async (arr, concurrency, fn) => {
  const inputs = Array.isArray(arr) ? arr : [];
  const limit = Math.max(1, Number(concurrency || 1));
  const results = new Array(inputs.length);
  let nextIndex = 0;

  const workers = new Array(Math.min(limit, inputs.length)).fill(0).map(async () => {
    while (true) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= inputs.length) return;
      results[i] = await fn(inputs[i], i);
    }
  });

  await Promise.all(workers);
  return results;
};

const postForm = async (url, body, attempt = 1) => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: controller.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText} :: ${txt.slice(0, 200)}`);
    }
    return await res.json();
  } catch (err) {
    if (attempt < RETRIES) {
      const backoff = 250 * Math.pow(2, attempt - 1);
      await sleep(backoff);
      return postForm(url, body, attempt + 1);
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
};

const fetchPage = async ({ pageNum, categoryValue }) => {
  // NOTE: pageNum advances the offset. pageNo appears to be ignored for pagination.
  // The collection list UI sends: { pageNum, pageSize, category, dynasty, searchText, exhibitionHall, colLabelId }
  // We only use category filtering here.
  const parts = [
    `pageNum=${encodeURIComponent(pageNum)}`,
    `pageSize=${encodeURIComponent(PAGE_SIZE)}`,
  ];
  if (categoryValue) parts.push(`category=${encodeURIComponent(categoryValue)}`);
  const body = parts.join('&');
  return postForm(`${BASE}/api/collection/select`, body);
};

const fetchActpic = async (id) => {
  const body = `id=${encodeURIComponent(id)}`;
  return postForm(`${BASE}/api/collection/info/actpic`, body);
};

const transformItem = (it, categoryOverride) => {
  const id = String(it.id ?? '').trim();
  const title = String(it.title ?? '').trim();

  const describe = String(it.describe ?? '').trim();
  const reignTitle = String(it.reignTitle ?? '').trim();
  const date = [describe, reignTitle].filter(Boolean).join(' · ');

  const categoryName = String(it.categoryName ?? '').trim();
  const category = categoryOverride || categoryName;

  const imgSrc = Array.isArray(it.imgSrc) ? it.imgSrc : [];
  const images = imgSrc.map((p) => toAbsoluteUrl(p)).filter(Boolean);

  // Fallback only: derived “water” URLs from modify URLs.
  // The true zoomPreview hi-res sources come from /api/collection/info/actpic.
  const waterImagesDerived = imgSrc
    .map((p) => normalizePath(p))
    .map((p) => p.replace('/collection/modify/', '/collection/water/'))
    .map((p) => toAbsoluteUrl(p))
    .filter(Boolean);

  const url = id ? `${BASE}/en/collectionDetails?id=${encodeURIComponent(id)}` : `${BASE}/en/collectionList`;

  return {
    id,
    title,
    artist: '',
    date,
    dimensions: String(it.size ?? '').trim(),
    category,
    image: images[0] || '',
    images,
    waterImages: waterImagesDerived,
    url,
    raw: {
      // Preserve all per-item metadata the API returns
      categoryName: it.categoryName ?? '',
      describe: it.describe ?? '',
      reignTitle: it.reignTitle ?? '',
      size: it.size ?? '',
      pavilionName: it.pavilionName ?? '',
      pavilionId: it.pavilionId ?? 0,
      position: it.position ?? '',
      pivot: it.pivot ?? '',
      outExhibits: it.outExhibits ?? 0,
      exhibitSource: it.exhibitSource ?? '',
      exhibitLink: it.exhibitLink ?? '',
      exhibitionHallName: it.exhibitionHallName ?? '',
      exhibitions: Array.isArray(it.exhibitions) ? it.exhibitions : [],
      imgSrc: imgSrc.map((p) => normalizePath(p)),
      waterImagesDerived,
      wenchuangs: Array.isArray(it.wenchuangs) ? it.wenchuangs : [],
    },
  };
};

async function main() {
  console.log(`[njmuseum] Scraping ${BASE}/en/collectionList via /api/collection/select`);
  console.log(`[njmuseum] pageSize=${PAGE_SIZE}`);

  const categories = (() => {
    const s = String(CATEGORIES_RAW).trim();
    if (!s) return [null]; // blank => fetch all categories
    return s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  })();

  if (categories.length === 1 && categories[0] === null) {
    console.log('[njmuseum] categories=ALL');
  } else {
    console.log(`[njmuseum] categories=${categories.join(',')}`);
  }

  const all = [];
  const pushList = (pageJson, pageNum, categoryValue) => {
    const list = Array.isArray(pageJson.data?.list) ? pageJson.data.list : [];
    if (!list.length) {
      console.warn(`[njmuseum] page ${pageNum}${categoryValue ? ` (category ${categoryValue})` : ''}: empty list`);
    }
    for (const it of list) all.push({ it, categoryValue });
  };

  for (const categoryValue of categories) {
    const first = await fetchPage({ pageNum: 1, categoryValue });
    if (first.code !== 0) throw new Error(`Unexpected API code for page 1${categoryValue ? ` (category ${categoryValue})` : ''}: ${first.code}`);

    const total = Number(first.data?.total || 0);
    const totalDesc = String(first.data?.totaldesc || '').trim();
    const totalPages = total ? Math.ceil(total / PAGE_SIZE) : 0;

    console.log(`[njmuseum] total=${total} (${totalDesc || 'no totaldesc'}) pages=${totalPages}${categoryValue ? ` category=${categoryValue}` : ''}`);

    const pagesToFetch = MAX_PAGES > 0 ? Math.min(totalPages, MAX_PAGES) : totalPages;
    pushList(first, 1, categoryValue);

    for (let pageNum = 2; pageNum <= pagesToFetch; pageNum++) {
      if (pageNum % 2 === 0) console.log(`[njmuseum] fetching page ${pageNum}/${pagesToFetch}${categoryValue ? ` (category ${categoryValue})` : ''}`);
      const j = await fetchPage({ pageNum, categoryValue });
      if (j.code !== 0) {
        console.warn(`[njmuseum] page ${pageNum}${categoryValue ? ` (category ${categoryValue})` : ''}: API code ${j.code} (skipping)`);
        continue;
      }
      pushList(j, pageNum, categoryValue);
      await sleep(120); // be polite
    }
  }

  // Deduplicate by id (defensive)
  const byId = new Map();
  for (const row of all) {
    const it = row.it;
    const id = String(it.id ?? '').trim();
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, row);
  }

  const items = Array.from(byId.values()).map((row) => {
    const categoryValue = row.categoryValue;
    const categoryOverride = categoryValue ? (CATEGORY_LABEL_EN[String(categoryValue)] || undefined) : undefined;
    return transformItem(row.it, categoryOverride);
  });
  const withImages = items.filter((x) => !!x.image);

  // Enrich with true zoomPreview hi-res images via /api/collection/info/actpic.
  // This endpoint is sensitive to Content-Type and returns paths that may require URL encoding.
  const ACTPIC_CONCURRENCY = Number(process.env.ACTPIC_CONCURRENCY || 6);
  console.log(`[njmuseum] fetching actpic hi-res images (concurrency=${ACTPIC_CONCURRENCY})`);
  await mapWithConcurrency(withImages, ACTPIC_CONCURRENCY, async (item, idx) => {
    if (!item?.id) return item;
    try {
      if ((idx + 1) % 50 === 0) console.log(`[njmuseum] actpic ${idx + 1}/${withImages.length}`);
      const j = await fetchActpic(item.id);
      const list = Array.isArray(j?.data) ? j.data : [];
      const actpicImages = list.map((p) => toAbsoluteUrl(p)).filter(Boolean);
      if (actpicImages.length) {
        item.waterImages = actpicImages;
        item.raw.actpicPaths = list.map((p) => normalizePath(p));
      }
    } catch (err) {
      // Keep derived fallback on errors.
      item.raw.actpicError = String(err?.message || err);
    }
    return item;
  });

  console.log(`[njmuseum] collected raw=${all.length} unique=${items.length} withImages=${withImages.length}`);

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(withImages, null, 2), 'utf-8');
  console.log(`[njmuseum] wrote ${OUT_FILE}`);
}

main().catch((err) => {
  console.error('[njmuseum] FAILED:', err);
  process.exit(1);
});
