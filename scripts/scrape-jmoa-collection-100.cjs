/*
  Scrape Jeju Museum of Art (onlinejmoa.or.kr) digital collection.

  Strategy (efficient + accurate):
  - Use the site's internal JSON endpoint for full metadata:
      POST https://onlinejmoa.or.kr/colection/ajaxSelectColIdx.do  (form: colIdx)
  - Discover colIdx + thumbnail file IDs by parsing server-rendered list pages:
      GET  https://onlinejmoa.or.kr/colectionList.do?menuNum=5000&pageIndex=N

  Output:
  - public/data/jmoa-collection-100.json (format compatible with ExhibitionModal's local JSON loaders)

  Usage:
    node ./scripts/scrape-jmoa-collection-100.cjs

  Optional env:
    LIMIT=100 (default 100)
*/

const fs = require('node:fs/promises');
const path = require('node:path');

const BASE = 'https://onlinejmoa.or.kr';
const LIST_URL = `${BASE}/colectionList.do?menuNum=5000`;
const DETAIL_API = `${BASE}/colection/ajaxSelectColIdx.do`;
const DETAIL_PAGE = `${BASE}/colectionDetail.do?menuNum=5000&colIdx=`;

const LIMIT = Math.max(1, Number(process.env.LIMIT || '100') || 100);

const TYPE_LABEL_KO = {
  J001: '한국화',
  J002: '회화',
  J003: '조각',
  J004: '드로잉&판화',
  J005: '뉴미디어',
  J006: '설치',
  J007: '공예',
  J008: '사진',
  J009: '서예',
  J010: '디자인',
  J011: '건축',
  J099: '기타',
};

// App category is generally English-ish; keep it simple and predictable.
const TYPE_LABEL_EN = {
  J001: 'Korean Painting',
  J002: 'Painting',
  J003: 'Sculpture',
  J004: 'Drawing & Print',
  J005: 'New Media',
  J006: 'Installation',
  J007: 'Craft',
  J008: 'Photography',
  J009: 'Calligraphy',
  J010: 'Design',
  J011: 'Architecture',
  J099: 'Other',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fetchText = async (url, init = {}) => {
  const res = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; armin-web scraper)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
};

const fetchJsonPostForm = async (url, form) => {
  const body = new URLSearchParams(form);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; armin-web scraper)',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': LIST_URL,
    },
    body,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
};

const uniq = (arr) => Array.from(new Set(arr));

const parseListPagePairs = (html) => {
  // We want (colIdx -> imageSrc) pairs with minimal chance of "drift".
  // On the list page, the image anchor typically looks like:
  //   <a ... onclick="fn_colDetail(1121);">
  //     <img src="/cmm/fms/getImage.do?atchFileId=..." ... alt="..." />
  //   </a>
  // We therefore require <img> to appear immediately after the onclick anchor.
  const pairs = [];
  const re = /onclick=\"fn_colDetail\((\d+)\);\"[^>]*>\s*<img[^>]+src=\"([^\"]+)\"[^>]*alt=\"([^\"]*)\"/g;
  let m;
  while ((m = re.exec(html))) {
    const colIdx = Number(m[1]);
    const src = m[2];
    const alt = (m[3] || '').trim();
    if (!Number.isFinite(colIdx) || !src) continue;
    pairs.push({ colIdx, src: new URL(src, BASE).toString(), alt });
  }

  // De-dupe by colIdx (keep first seen).
  const seen = new Set();
  const out = [];
  for (const p of pairs) {
    if (seen.has(p.colIdx)) continue;
    seen.add(p.colIdx);
    out.push(p);
  }
  return out;
};

const buildDimensions = (col) => {
  const w = String(col?.colWidth ?? '').trim();
  const h = String(col?.colHeight ?? '').trim();
  const d = String(col?.colDepth ?? '').trim();
  const hasWH = Boolean(w && h && w !== '0' && h !== '0');

  let dim = '';
  if (hasWH) {
    dim = `${w} x ${h}`;
    if (d && d !== '0') dim += ` x ${d}`;
    dim += ' cm';
  }

  const etc = String(col?.colSizeEtc ?? '').trim();
  if (etc) dim = dim ? `${dim} ${etc}` : etc;

  return dim;
};

const normalizeDate = (col) => {
  const etc = String(col?.colProYearEtc ?? '').trim();
  if (etc) return etc;
  const y = col?.colProYear;
  if (y === undefined || y === null || y === '') return '';
  return String(y);
};

const main = async () => {
  console.log(`[JMOA] Collecting up to ${LIMIT} artworks`);

  const pairs = [];
  const byId = new Map();

  let pageIndex = 1;
  while (pairs.length < LIMIT && pageIndex < 500) {
    const url = `${LIST_URL}&pageIndex=${pageIndex}`;
    const html = await fetchText(url);
    const found = parseListPagePairs(html);

    for (const item of found) {
      if (!byId.has(item.colIdx)) {
        byId.set(item.colIdx, item);
        pairs.push(item);
        if (pairs.length >= LIMIT) break;
      }
    }

    console.log(`[JMOA] pageIndex=${pageIndex} -> +${found.length} (total ${pairs.length})`);
    pageIndex += 1;

    // Be polite: tiny delay to avoid hammering
    await sleep(120);

    if (found.length === 0) break;
  }

  if (pairs.length === 0) {
    throw new Error('No items discovered from list pages');
  }

  const colIdxs = pairs.map((p) => p.colIdx);
  const uniqueColIdxs = uniq(colIdxs).slice(0, LIMIT);

  console.log(`[JMOA] Fetching detail JSON for ${uniqueColIdxs.length} items`);

  const results = [];
  for (let i = 0; i < uniqueColIdxs.length; i++) {
    const colIdx = uniqueColIdxs[i];
    const row = byId.get(colIdx);
    const thumb = row?.src || '';
    const listAlt = (row?.alt || '').trim();

    let data;
    try {
      data = await fetchJsonPostForm(DETAIL_API, { colIdx: String(colIdx) });
    } catch (err) {
      console.warn(`[JMOA] detail failed colIdx=${colIdx}:`, err?.message || err);
      continue;
    }

    if (!data || data.code !== '100' || !data.result) {
      console.warn(`[JMOA] unexpected detail payload colIdx=${colIdx}: code=${data?.code}`);
      continue;
    }

    const col = data.result;
    const code = String(col.colTypeOfArt || '').trim();
    const typeKo = TYPE_LABEL_KO[code] || '';
    const typeEn = TYPE_LABEL_EN[code] || '';

    const title = String(col.colTitle || '').trim() || 'Untitled';
    const artist = String(col.colArtist || '').trim() || 'Unknown';

    if (listAlt && title && listAlt !== title) {
      console.warn(`[JMOA] list/title mismatch colIdx=${colIdx}: listAlt="${listAlt}" apiTitle="${title}"`);
    }

    const description = String(col.colInfo || '').trim();

    results.push({
      id: `jmoa-${colIdx}`,
      title,
      artist,
      date: normalizeDate(col),
      medium: String(col.colMt || '').trim(),
      dimensions: buildDimensions(col),

      // For modal / card list display: give a real image URL and let the app proxy it.
      imageUrl: thumb,

      // Per-item museum page.
      // Note: onlinejmoa may restrict some clients; we still emit the canonical per-item URL.
      detailUrl: `${DETAIL_PAGE}${colIdx}`,

      category: typeEn || 'Artwork',
      description,

      source: 'Jeju Museum of Art (온라인 제주도립미술관)',

      // Keep everything for "모든 메타데이터" requirement.
      meta: {
        provider: 'onlinejmoa.or.kr',
        colIdx: String(colIdx),
        api: {
          detailEndpoint: '/colection/ajaxSelectColIdx.do',
        },
        objectType: {
          code,
          labelKo: typeKo,
          labelEn: typeEn,
        },
        list: {
          alt: listAlt,
          thumbnailUrl: thumb,
        },
        raw: col,
      },
    });

    if ((i + 1) % 10 === 0) {
      console.log(`[JMOA] details: ${i + 1}/${uniqueColIdxs.length}`);
    }

    await sleep(80);
  }

  if (!results.length) throw new Error('No detail results produced');

  const outPath = path.join(process.cwd(), 'public', 'data', 'jmoa-collection-100.json');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(results, null, 2), 'utf8');

  console.log(`[JMOA] Wrote ${results.length} items -> ${outPath}`);
};

main().catch((err) => {
  console.error('[JMOA] FAILED:', err);
  process.exitCode = 1;
});
