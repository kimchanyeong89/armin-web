/*
  Taipei Fine Arts Museum (tfam.museum) — Collections

  Efficient strategy:
  - Use the site's internal JSON endpoint:
      POST https://www.tfam.museum/ashx/Collection.ashx
      body: JSON string (JJMethod=GetCollectionList)
  - For richer metadata (title, artwork fields, image URL), fetch the public detail page:
      https://www.tfam.museum/Collection/CollectionDetail.aspx?ddlLang=en-us&CID=<MuseumID>

  Output:
    public/data/tfam-collection-100.json

  Usage:
    node ./scripts/scrape-tfam-collection-100.cjs

  Env:
    LIMIT=100 (default 100)
    CONCURRENCY=6 (default 6)
    HIGHLIGHT_THEME_ID=16 (default 16)  // used to mark isHighlight
*/

const fs = require('node:fs/promises');
const path = require('node:path');

const cheerio = require('cheerio');
const pLimitImport = require('p-limit');
const pLimit = pLimitImport?.default || pLimitImport;

const BASE = 'https://www.tfam.museum';
const API = `${BASE}/ashx/Collection.ashx`;
const DETAIL_BASE = `${BASE}/Collection/CollectionDetail.aspx?ddlLang=en-us&CID=`;

const LIMIT = Math.max(1, Number(process.env.LIMIT || '100') || 100);
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || '6') || 6);
const HIGHLIGHT_THEME_ID = String(process.env.HIGHLIGHT_THEME_ID || '16');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const normalizeSpace = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const toAbs = (href, baseUrl) => {
  if (!href) return '';
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return '';
  }
};

const fetchJsonPost = async (url, obj, { referer } = {}) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; armin-web scraper)',
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/json; charset=utf-8',
      'Origin': BASE,
      ...(referer ? { Referer: referer } : {}),
    },
    body: JSON.stringify(obj),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} for ${url} (${text.slice(0, 200)})`);
  }

  return await res.json();
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

const getCollectionListPage = async ({ pgNum, pgSize, mTheme } = {}) => {
  const payload = {
    JJMethod: 'GetCollectionList',
    pg_num: pgNum,
    pg_size: pgSize,
  };
  if (mTheme !== undefined && mTheme !== null && String(mTheme).trim() !== '') {
    payload.MTheme = String(mTheme).trim();
  }

  const json = await fetchJsonPost(API, payload, { referer: `${BASE}/Collection/CollectionList.aspx?ddlLang=en-us` });
  if (!json || json.Status !== '1' || json.Method !== 'GetCollectionList') {
    throw new Error(`Unexpected GetCollectionList response: ${JSON.stringify({ Status: json?.Status, Method: json?.Method })}`);
  }
  const data = Array.isArray(json.Data) ? json.Data : [];
  return { data, raw: json };
};

const parseArtistName = (artistDisplay) => {
  const s = normalizeSpace(artistDisplay);
  if (!s) return '';
  // Common format: "NAME (1965)". Keep name only for the main field.
  const m = s.match(/^(.*?)(\s*\([^)]*\))\s*$/);
  return normalizeSpace(m ? m[1] : s);
};

const parseDetailPage = (html) => {
  const $ = cheerio.load(html);

  const title = normalizeSpace($('h2').first().text()) || normalizeSpace($('title').first().text()).replace(/\s*\|\s*TFAM\s*$/i, '');
  const artistDisplay = normalizeSpace($('.titleTheme').first().text());
  const artist = parseArtistName(artistDisplay);

  const pairs = {};
  $('li').each((_, li) => {
    const $li = $(li);
    const label = normalizeSpace($li.find('span.h6').first().text());
    if (!label) return;

    const clone = $li.clone();
    clone.find('span.h6').remove();
    const value = normalizeSpace(clone.text());
    if (value) pairs[label] = value;
  });

  const ogImage = $('meta[property="og:image"]').attr('content') || '';
  const twImage = $('meta[name="twitter:image"]').attr('content') || '';

  const imgSrcs = $('img')
    .map((_, el) => $(el).attr('src') || '')
    .get()
    .map((s) => toAbs(s, BASE))
    .filter(Boolean);

  const candidates = [
    toAbs(ogImage, BASE),
    toAbs(twImage, BASE),
    ...imgSrcs,
  ].filter(Boolean);

  const mainImage =
    candidates.find((u) => /\/File\/Collection\/Image\//i.test(u)) ||
    candidates.find((u) => /\/File\/Collection\//i.test(u)) ||
    candidates[0] ||
    '';

  return {
    title,
    artist,
    artistDisplay,
    fields: pairs,
    image: mainImage,
    images: mainImage ? [mainImage] : [],
  };
};

const fetchDetail = async (museumId, attempt = 1) => {
  const url = `${DETAIL_BASE}${encodeURIComponent(String(museumId))}`;
  try {
    const html = await fetchText(url);
    const parsed = parseDetailPage(html);
    return { url, ...parsed };
  } catch (err) {
    if (attempt >= 3) throw err;
    await sleep(250 * attempt);
    return await fetchDetail(museumId, attempt + 1);
  }
};

const main = async () => {
  console.log(`[TFAM] Fetching list: LIMIT=${LIMIT}`);

  // Highlight set (theme 16 by default)
  let highlightIds = new Set();
  try {
    const { data: hi } = await getCollectionListPage({ pgNum: 1, pgSize: 500, mTheme: HIGHLIGHT_THEME_ID });
    highlightIds = new Set((hi || []).map((x) => String(x?.MuseumID || '')).filter(Boolean));
    console.log(`[TFAM] highlight theme=${HIGHLIGHT_THEME_ID} -> ${highlightIds.size} ids`);
  } catch (err) {
    console.warn('[TFAM] highlight fetch failed (continuing without isHighlight):', err?.message || err);
  }

  const listItems = [];
  let pgNum = 1;
  const pgSize = Math.min(200, Math.max(20, LIMIT));

  while (listItems.length < LIMIT) {
    const { data } = await getCollectionListPage({ pgNum, pgSize });
    if (!data.length) break;

    for (const row of data) {
      listItems.push(row);
      if (listItems.length >= LIMIT) break;
    }

    console.log(`[TFAM] pg_num=${pgNum} +${data.length} (total ${listItems.length})`);
    pgNum += 1;
    await sleep(120);

    // Safety bound
    if (pgNum > 500) break;
  }

  if (!listItems.length) throw new Error('No items returned from GetCollectionList');

  const limit = pLimit(CONCURRENCY);
  console.log(`[TFAM] Fetching detail pages (concurrency=${CONCURRENCY})`);

  const detailResults = await Promise.all(
    listItems.map((row, idx) =>
      limit(async () => {
        const museumId = row?.MuseumID;
        if (!museumId) {
          return { idx, museumId: '', detail: null, err: 'missing MuseumID' };
        }
        try {
          const detail = await fetchDetail(museumId);
          await sleep(80);
          return { idx, museumId: String(museumId), detail, err: null };
        } catch (e) {
          return { idx, museumId: String(museumId), detail: null, err: e?.message || String(e) };
        }
      }),
    ),
  );

  const byId = new Map(detailResults.filter((r) => r.detail).map((r) => [r.museumId, r.detail]));

  const out = listItems.map((row) => {
    const museumId = String(row?.MuseumID || '');
    const detail = byId.get(museumId) || null;

    const title = detail?.title || normalizeSpace(row?.Title) || '';
    const artist = detail?.artist || normalizeSpace(row?.Artist) || '';
    const date = detail?.fields?.Date || normalizeSpace(row?.['年代']) || '';
    const category = detail?.fields?.Type || normalizeSpace(row?.Type) || '';
    const medium = detail?.fields?.['Media Technology'] || '';
    const dimensions = detail?.fields?.Dimensions || '';

    const image = detail?.image || '';
    const images = detail?.images || (image ? [image] : []);

    return {
      id: museumId,
      title,
      artist,
      date,
      category,
      medium,
      dimensions,
      image,
      images,
      detailUrl: detail?.url || `${DETAIL_BASE}${encodeURIComponent(museumId)}`,
      sourceUrl: detail?.url || `${DETAIL_BASE}${encodeURIComponent(museumId)}`,
      isHighlight: highlightIds.size ? highlightIds.has(museumId) : false,
      metadata: {
        tfam: {
          museumId,
          listRow: row,
          detailFields: detail?.fields || {},
          artistDisplay: detail?.artistDisplay || '',
        },
      },
    };
  });

  const errors = detailResults.filter((r) => r.err);
  if (errors.length) {
    console.warn(`[TFAM] detail errors: ${errors.length}/${detailResults.length}`);
    for (const e of errors.slice(0, 6)) console.warn('  -', e.museumId || `idx=${e.idx}`, e.err);
  }

  const outPath = path.join('public', 'data', 'tfam-collection-100.json');
  await fs.writeFile(outPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`[TFAM] wrote ${outPath} (${out.length} items)`);

  const highlightCount = out.filter((x) => x.isHighlight).length;
  console.log(`[TFAM] isHighlight=true: ${highlightCount}/${out.length}`);
};

main().catch((err) => {
  console.error('[TFAM] fatal:', err);
  process.exit(1);
});
