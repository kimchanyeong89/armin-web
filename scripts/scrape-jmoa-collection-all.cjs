/*
  Scrape Jeju Museum of Art (onlinejmoa.or.kr) digital collection (ALL items).

  Strategy (efficient + accurate):
  - Discover colIdx + thumbnail URLs by parsing server-rendered list pages:
      GET  https://onlinejmoa.or.kr/colectionList.do?menuNum=5000&pageIndex=N
  - For each colIdx, fetch full metadata from internal JSON endpoint:
      POST https://onlinejmoa.or.kr/colection/ajaxSelectColIdx.do  (form: colIdx)

  Output:
  - public/data/jmoa-collection-all.json (format compatible with ExhibitionModal's local JSON loaders)

  Usage:
    node ./scripts/scrape-jmoa-collection-all.cjs

  Optional env:
    MAX_PAGES=500        (safety cap)
    CONCURRENCY=4        (detail fetch parallelism)
    PAGE_DELAY_MS=120    (delay between list pages)
    DETAIL_DELAY_MS=50   (delay per detail request per worker)
*/

const fs = require('node:fs/promises');
const path = require('node:path');

const BASE = 'https://onlinejmoa.or.kr';
const LIST_URL = `${BASE}/colectionList.do?menuNum=5000`;
const DETAIL_API = `${BASE}/colection/ajaxSelectColIdx.do`;
const DETAIL_PAGE = `${BASE}/colectionDetail.do?menuNum=5000&colIdx=`;

const MAX_PAGES = Math.max(1, Number(process.env.MAX_PAGES || '500') || 500);
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || '4') || 4);
const PAGE_DELAY_MS = Math.max(0, Number(process.env.PAGE_DELAY_MS || '120') || 120);
const DETAIL_DELAY_MS = Math.max(0, Number(process.env.DETAIL_DELAY_MS || '50') || 50);

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

const parseListPagePairs = (html) => {
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

const withRetries = async (fn, { tries = 3, baseDelayMs = 250 } = {}) => {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const wait = baseDelayMs * Math.pow(2, i) + Math.floor(Math.random() * 100);
      await sleep(wait);
    }
  }
  throw lastErr;
};

const main = async () => {
  console.log(`[JMOA] Discovering items from list pages (max pages: ${MAX_PAGES})`);

  const byId = new Map(); // colIdx -> {colIdx, src, alt}
  let pageIndex = 1;
  let emptyStreak = 0;

  while (pageIndex <= MAX_PAGES) {
    const url = `${LIST_URL}&pageIndex=${pageIndex}`;

    let html;
    try {
      html = await withRetries(() => fetchText(url), { tries: 3, baseDelayMs: 300 });
    } catch (e) {
      console.warn(`[JMOA] list page failed pageIndex=${pageIndex}:`, e?.message || e);
      emptyStreak += 1;
      if (emptyStreak >= 3) break;
      pageIndex += 1;
      continue;
    }

    const found = parseListPagePairs(html);
    let added = 0;
    for (const item of found) {
      if (!byId.has(item.colIdx)) {
        byId.set(item.colIdx, item);
        added += 1;
      }
    }

    console.log(`[JMOA] pageIndex=${pageIndex} -> found=${found.length} added=${added} total=${byId.size}`);

    if (found.length === 0) emptyStreak += 1;
    else emptyStreak = 0;

    // Heuristic stop: after 2 consecutive empty pages, assume we're done.
    if (emptyStreak >= 2) break;

    pageIndex += 1;
    if (PAGE_DELAY_MS) await sleep(PAGE_DELAY_MS);
  }

  if (byId.size === 0) throw new Error('No items discovered from list pages');

  const colIdxs = Array.from(byId.keys()).sort((a, b) => a - b);
  console.log(`[JMOA] Fetching detail JSON for ${colIdxs.length} items (concurrency=${CONCURRENCY})`);

  const out = [];
  let cursor = 0;
  let ok = 0;
  let failed = 0;

  const worker = async (workerId) => {
    while (true) {
      const i = cursor;
      cursor += 1;
      if (i >= colIdxs.length) return;

      const colIdx = colIdxs[i];
      const row = byId.get(colIdx);
      const thumb = row?.src || '';
      const listAlt = (row?.alt || '').trim();

      try {
        const data = await withRetries(() => fetchJsonPostForm(DETAIL_API, { colIdx: String(colIdx) }), { tries: 4, baseDelayMs: 250 });
        if (!data || data.code !== '100' || !data.result) {
          throw new Error(`unexpected detail payload code=${data?.code}`);
        }

        const col = data.result;
        const code = String(col.colTypeOfArt || '').trim();
        const typeKo = TYPE_LABEL_KO[code] || '';
        const typeEn = TYPE_LABEL_EN[code] || '';

        const title = String(col.colTitle || '').trim() || 'Untitled';
        const artist = String(col.colArtist || '').trim() || 'Unknown';

        if (listAlt && title && listAlt !== title) {
          // Keep this as a warning, but do not fail.
          // This can happen if the list page alt text is simplified or has spacing differences.
          console.warn(`[JMOA] list/title mismatch colIdx=${colIdx}: listAlt="${listAlt}" apiTitle="${title}"`);
        }

        out[i] = {
          id: `jmoa-${colIdx}`,
          title,
          artist,
          date: normalizeDate(col),
          medium: String(col.colMt || '').trim(),
          dimensions: buildDimensions(col),
          imageUrl: thumb,
          detailUrl: `${DETAIL_PAGE}${colIdx}`,
          category: typeEn || 'Artwork',
          description: String(col.colInfo || '').trim(),
          source: 'Jeju Museum of Art (온라인 제주도립미술관)',
          meta: {
            provider: 'onlinejmoa.or.kr',
            colIdx: String(colIdx),
            api: { detailEndpoint: '/colection/ajaxSelectColIdx.do' },
            objectType: { code, labelKo: typeKo, labelEn: typeEn },
            list: { alt: listAlt, thumbnailUrl: thumb },
            raw: col,
          },
        };

        ok += 1;
      } catch (e) {
        failed += 1;
        console.warn(`[JMOA] detail failed colIdx=${colIdx} (worker=${workerId}):`, e?.message || e);
      }

      if ((ok + failed) % 50 === 0) {
        console.log(`[JMOA] progress: done=${ok + failed}/${colIdxs.length} ok=${ok} failed=${failed}`);
      }

      if (DETAIL_DELAY_MS) await sleep(DETAIL_DELAY_MS);
    }
  };

  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  const results = out.filter(Boolean);
  console.log(`[JMOA] Done. ok=${ok} failed=${failed} output=${results.length}`);

  const dest = path.join(process.cwd(), 'public', 'data', 'jmoa-collection-all.json');
  await fs.writeFile(dest, JSON.stringify(results, null, 2), 'utf8');
  console.log(`[JMOA] Wrote ${dest}`);
};

main().catch((e) => {
  console.error('[JMOA] Fatal:', e);
  process.exit(1);
});
