/*
  Scrape KIM TSCHANG-YEUL ART MUSEUM JEJU (kimtschang-yeul.jeju.go.kr) collection (ALL items).

  Observed site behavior:
  - List page renders cards and opens a modal for details:
      GET  https://kimtschang-yeul.jeju.go.kr/colectionList.do?menuNum=5100&pageIndex=N
      onclick="fn_colModal('C',<colIdx>);"
  - Detail JSON endpoint:
      POST https://kimtschang-yeul.jeju.go.kr/colection/ajaxSelectColIdx.do  (form: colIdx)
      result includes colFile which can be used to construct a stable image URL.

  Output:
  - public/data/kimtschang-yeul-collection-all.json

  Optional env:
    MAX_PAGES=500
    CONCURRENCY=4
    PAGE_DELAY_MS=120
    DETAIL_DELAY_MS=50
*/

const fs = require('node:fs/promises');
const path = require('node:path');

const BASE = 'https://kimtschang-yeul.jeju.go.kr';
const LIST_URL = `${BASE}/colectionList.do?menuNum=5100`;
const DETAIL_API = `${BASE}/colection/ajaxSelectColIdx.do`;
const IMAGE = `${BASE}/cmm/fms/getImage.do?atchFileId=`;

const MAX_PAGES = Math.max(1, Number(process.env.MAX_PAGES || '500') || 500);
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || '4') || 4);
const PAGE_DELAY_MS = Math.max(0, Number(process.env.PAGE_DELAY_MS || '120') || 120);
const DETAIL_DELAY_MS = Math.max(0, Number(process.env.DETAIL_DELAY_MS || '50') || 50);

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

const fetchJsonPostForm = async (url, form, referer) => {
  const body = new URLSearchParams(form);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; armin-web scraper)',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': referer,
    },
    body,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
};

const parseListPagePairs = (html) => {
  // Example:
  // <a ... onclick="fn_colModal('C',27);">
  //   <img src="/cmm/fms/getImage.do?atchFileId=...&fileSize=s" ... alt="무제" />
  // </a>
  const pairs = [];
  const re = /onclick=\"fn_colModal\(\'C\',(\d+)\);\"[^>]*>\s*<img[^>]+src=\"([^\"]+)\"[^>]*alt=\"([^\"]*)\"/g;
  let m;
  while ((m = re.exec(html))) {
    const colIdx = Number(m[1]);
    const src = m[2];
    const alt = (m[3] || '').trim();
    if (!Number.isFinite(colIdx)) continue;
    const thumbUrl = src ? new URL(src, BASE).toString() : '';
    pairs.push({ colIdx, thumbUrl, alt });
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
      const wait = baseDelayMs * Math.pow(2, i) + Math.floor(Math.random() * 120);
      await sleep(wait);
    }
  }
  throw lastErr;
};

const main = async () => {
  console.log(`[KTY] Discovering items from list pages (max pages: ${MAX_PAGES})`);

  const byId = new Map(); // colIdx -> {colIdx, thumbUrl, alt}
  let pageIndex = 1;
  let emptyStreak = 0;

  while (pageIndex <= MAX_PAGES) {
    const url = `${LIST_URL}&pageIndex=${pageIndex}`;

    let html;
    try {
      html = await withRetries(() => fetchText(url), { tries: 3, baseDelayMs: 300 });
    } catch (e) {
      console.warn(`[KTY] list page failed pageIndex=${pageIndex}:`, e?.message || e);
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

    console.log(`[KTY] pageIndex=${pageIndex} -> found=${found.length} added=${added} total=${byId.size}`);

    if (found.length === 0) emptyStreak += 1;
    else emptyStreak = 0;

    if (emptyStreak >= 2) break;

    pageIndex += 1;
    if (PAGE_DELAY_MS) await sleep(PAGE_DELAY_MS);
  }

  if (byId.size === 0) throw new Error('No items discovered from list pages');

  const colIdxs = Array.from(byId.keys()).sort((a, b) => a - b);
  console.log(`[KTY] Fetching detail JSON for ${colIdxs.length} items (concurrency=${CONCURRENCY})`);

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
      const listAlt = (row?.alt || '').trim();
      const listThumb = row?.thumbUrl || '';

      try {
        const data = await withRetries(
          () => fetchJsonPostForm(DETAIL_API, { colIdx: String(colIdx) }, `${LIST_URL}&pageIndex=1`),
          { tries: 4, baseDelayMs: 250 }
        );
        if (!data || data.code !== '100' || !data.result) {
          throw new Error(`unexpected detail payload code=${data?.code}`);
        }

        const col = data.result;
        const title = String(col.colTitle || '').trim() || 'Untitled';
        const artist = String(col.colArtist || '').trim() || 'Unknown';

        if (listAlt && title && listAlt !== title) {
          console.warn(`[KTY] list/title mismatch colIdx=${colIdx}: listAlt="${listAlt}" apiTitle="${title}"`);
        }

        const colFile = String(col.colFile || col.colStrmFile || '').trim();
        const imageUrl = colFile ? `${IMAGE}${encodeURIComponent(colFile)}&fileSize=t` : (listThumb || '');

        out[i] = {
          id: `kimtschang-yeul-${colIdx}`,
          title,
          artist,
          date: normalizeDate(col),
          medium: String(col.colMt || '').trim(),
          dimensions: buildDimensions(col),
          imageUrl,
          // The site mostly exposes details via modal; link the canonical list page and include colIdx.
          detailUrl: `${LIST_URL}&colIdx=${colIdx}`,
          category: 'Artwork',
          description: String(col.colInfo || '').trim(),
          source: 'KIM TSCHANG-YEUL ART MUSEUM JEJU',
          meta: {
            provider: 'kimtschang-yeul.jeju.go.kr',
            colIdx: String(colIdx),
            api: { detailEndpoint: '/colection/ajaxSelectColIdx.do' },
            list: { alt: listAlt, thumbnailUrl: listThumb },
            raw: col,
          },
        };

        ok += 1;
      } catch (e) {
        failed += 1;
        console.warn(`[KTY] detail failed colIdx=${colIdx} (worker=${workerId}):`, e?.message || e);
      }

      if ((ok + failed) % 50 === 0) {
        console.log(`[KTY] progress: done=${ok + failed}/${colIdxs.length} ok=${ok} failed=${failed}`);
      }

      if (DETAIL_DELAY_MS) await sleep(DETAIL_DELAY_MS);
    }
  };

  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  const results = out.filter(Boolean);
  console.log(`[KTY] Done. ok=${ok} failed=${failed} output=${results.length}`);

  const dest = path.join(process.cwd(), 'public', 'data', 'kimtschang-yeul-collection-all.json');
  await fs.writeFile(dest, JSON.stringify(results, null, 2), 'utf8');
  console.log(`[KTY] Wrote ${dest}`);
};

main().catch((e) => {
  console.error('[KTY] Fatal:', e);
  process.exit(1);
});
