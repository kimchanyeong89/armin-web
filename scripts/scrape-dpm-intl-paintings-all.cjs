/*
  Scrape The Palace Museum (intl.dpm.org.cn) collection: Paintings only.

  Requirements:
  - Fetch all Paintings (reported total: 13,672)
  - Exclude rows with missing/placeholder images
  - Add checkpoint/resume for long runs

  How it works:
  - Uses the site's internal collection search endpoint (HTML fragment via AJAX):
      GET https://intl.dpm.org.cn/searchs/collection
    Pass Paintings as an array param (matches the site JS search['category'] serialization):
      category[]=132

  Output:
  - public/data/dpm-intl-paintings-all.jsonl  (incremental, resumable)
  - public/data/dpm-intl-paintings-all.json   (final array, written at the end)
  - scripts/.state/dpm-intl-paintings-all.state.json (checkpoint)

  Usage:
    node ./scripts/scrape-dpm-intl-paintings-all.cjs

  Env:
    LIMIT=0            // 0 means ALL (default)
    CONCURRENCY=6      // detail fetch concurrency
    PAGE_DELAY_MS=120  // delay between list pages
    RESUME=1           // resume from state/output jsonl (default 1)
*/

const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');

const cheerio = require('cheerio');

const pLimitImport = require('p-limit');
const pLimit = pLimitImport?.default || pLimitImport;

const BASE = 'https://intl.dpm.org.cn';
const REFERER = `${BASE}/collection_list.html?l=en`;
const SEARCH_ENDPOINT = `${BASE}/searchs/collection`;

const CATEGORY_PAINTINGS_ID = 132;
const PAGESIZE = 12;

const LIMIT = Math.max(0, Number(process.env.LIMIT || '0') || 0);
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || '6') || 6);
const PAGE_DELAY_MS = Math.max(0, Number(process.env.PAGE_DELAY_MS || '120') || 120);
const RESUME = String(process.env.RESUME || '1') !== '0';

const OUT_DIR = path.join(process.cwd(), 'public', 'data');
const OUT_JSONL = path.join(OUT_DIR, 'dpm-intl-paintings-all.jsonl');
const OUT_JSON = path.join(OUT_DIR, 'dpm-intl-paintings-all.json');

const STATE_DIR = path.join(process.cwd(), 'scripts', '.state');
const STATE_PATH = path.join(STATE_DIR, 'dpm-intl-paintings-all.state.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fetchTextWithRetry = async (url, init = {}, opts = {}) => {
  const retries = Math.max(0, Number(opts.retries ?? 4));
  const baseDelayMs = Math.max(0, Number(opts.baseDelayMs ?? 600));

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await fetchText(url, init);
    } catch (err) {
      lastErr = err;
      const msg = err?.message || String(err);
      const shouldRetry = /HTTP\s+(429|5\d\d)/i.test(msg) || /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|network|fetch/i.test(msg);
      if (!shouldRetry || attempt === retries) break;

      const jitter = Math.floor(Math.random() * 250);
      const delayMs = Math.min(12_000, baseDelayMs * Math.pow(2, attempt) + jitter);
      // eslint-disable-next-line no-await-in-loop
      await sleep(delayMs);
    }
  }
  throw lastErr;
};

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

const normalizeSpace = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const buildSearchUrl = (page) => {
  const u = new URL(SEARCH_ENDPOINT);

  // emulate jQuery cache buster: url + '?' + Math.random()
  u.searchParams.set(String(Math.random()), '');

  u.searchParams.set('tpl_file', 'collection_list');
  u.searchParams.set('pagesize', String(PAGESIZE));
  u.searchParams.set('p', String(page));
  u.searchParams.set('l', 'en');

  // Important: category is an array parameter
  u.searchParams.append('category[]', String(CATEGORY_PAINTINGS_ID));

  return u.toString();
};

const parseTotalResult = (html) => {
  const m = html.match(/var\s+total_result\s*=\s*"(\d+)"/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
};

const parseListFragment = (html) => {
  const $ = cheerio.load(html);
  const out = [];

  $('.list .list-item a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const absUrl = href ? new URL(href, BASE).toString() : '';
    if (!absUrl) return;
    const img = $(el).find('img').attr('src') || '';
    const title = normalizeSpace($(el).find('.text .t').text());
    const period = normalizeSpace($(el).find('.text .p').text());
    out.push({ url: absUrl, imageUrl: img, title, period });
  });

  return out;
};

const extractDetailDlMap = ($) => {
  const map = {};
  $('.collection_detail2 .l .dl').each((_, el) => {
    const dt = normalizeSpace($(el).find('.dt').text()).replace(/:$/, '');
    const dd = normalizeSpace($(el).find('.dd').text());
    if (!dt || !dd) return;
    map[dt] = dd;
  });
  return map;
};

const looksLikeRealDpmImage = (url) => {
  if (!url) return false;
  const u = String(url);

  // The real images we observed are hosted on Tencent COS and include /relic/.
  if (u.includes('/relic/') || u.includes('cos.ap-beijing.myqcloud.com/relic/')) return true;

  // Reject obvious placeholders / site assets.
  if (u.includes('/Public/static/') || u.includes('/Uploads/')) return false;

  // If it is an http(s) URL but doesn't match known relic patterns, be conservative and skip.
  if (/^https?:\/\//i.test(u)) return false;

  return false;
};

const parseDetailPage = (html, detailUrl) => {
  const $ = cheerio.load(html);

  const title = normalizeSpace($('.collection_detail2 .tit_box .tit.fft').first().text()) || 'Untitled';
  const dl = extractDetailDlMap($);

  const category = dl['Category'] || '';
  const period = dl['Period'] || '';

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
    title,
    artist: artist || 'Unknown',
    date: period || '',
    medium,
    dimensions,
    description,
    category,
    imageUrl: img,
    detailUrl,
    sourceUrl: detailUrl,
    raw: { dl },
  };
};

const readJsonIfExists = async (filePath) => {
  try {
    const txt = await fs.readFile(filePath, 'utf8');
    return JSON.parse(txt);
  } catch {
    return null;
  }
};

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true });
};

const readExistingIdsFromJsonl = async (filePath) => {
  const ids = new Set();
  try {
    await fs.access(filePath);
  } catch {
    return ids;
  }

  const fh = await fs.open(filePath, 'r');
  const rl = readline.createInterface({ input: fh.createReadStream(), crlfDelay: Infinity });
  for await (const line of rl) {
    const t = String(line || '').trim();
    if (!t) continue;
    try {
      const row = JSON.parse(t);
      if (row?.id) ids.add(String(row.id));
    } catch {
      // ignore partial/bad lines
    }
  }
  await fh.close();
  return ids;
};

const jsonlToJsonArray = async (jsonlPath, jsonPath) => {
  const out = [];
  const fh = await fs.open(jsonlPath, 'r');
  const rl = readline.createInterface({ input: fh.createReadStream(), crlfDelay: Infinity });
  for await (const line of rl) {
    const t = String(line || '').trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      // ignore
    }
  }
  await fh.close();
  await fs.writeFile(jsonPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
  return out.length;
};

const main = async () => {
  await ensureDir(OUT_DIR);
  await ensureDir(STATE_DIR);

  let state = (RESUME && (await readJsonIfExists(STATE_PATH))) || null;

  // Build seen IDs from existing jsonl (cheap at 13k lines)
  const seenIds = RESUME ? await readExistingIdsFromJsonl(OUT_JSONL) : new Set();

  // Establish total from page 1
  const firstHtml = await fetchTextWithRetry(buildSearchUrl(1), {
    headers: { 'X-Requested-With': 'XMLHttpRequest', Referer: REFERER },
  }, { retries: 6, baseDelayMs: 800 });
  const totalReported = parseTotalResult(firstHtml);
  if (!Number.isFinite(totalReported)) {
    throw new Error('Could not parse total_result from first search response');
  }

  const targetCount = LIMIT > 0 ? LIMIT : totalReported;
  const totalPages = Math.ceil(totalReported / PAGESIZE);

  if (!state) {
    state = {
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalReported,
      totalPages,
      pagesize: PAGESIZE,
      categoryArrayValue: CATEGORY_PAINTINGS_ID,
      lastPageCompleted: 0,
      written: 0,
      skippedNoImage: 0,
      skippedPlaceholder: 0,
      skippedNonPaintings: 0,
      errors: 0,
    };
  } else {
    state.totalReported = totalReported;
    state.totalPages = totalPages;
    state.pagesize = PAGESIZE;
    state.categoryArrayValue = CATEGORY_PAINTINGS_ID;
  }

  // Derive written count from existing ids
  state.written = Math.max(Number(state.written || 0), seenIds.size);

  const startPage = Math.max(1, Number(state.lastPageCompleted || 0) + 1);

  console.log(`[DPM] Paintings ALL: target=${targetCount} reportedTotal=${totalReported} pages=${totalPages}`);
  console.log(`[DPM] Resume=${RESUME} startPage=${startPage} alreadyWritten=${seenIds.size} concurrency=${CONCURRENCY}`);

  let writeChain = Promise.resolve();
  const enqueueWriteRow = (row) => {
    writeChain = writeChain.then(async () => {
      if (state.written >= targetCount) return false;
      if (!row?.id) return false;
      if (seenIds.has(row.id)) return false;

      await fs.appendFile(OUT_JSONL, JSON.stringify(row) + '\n', 'utf8');
      seenIds.add(row.id);
      state.written += 1;
      writtenThisRun += 1;
      return true;
    });

    return writeChain;
  };

  const limiter = pLimit(CONCURRENCY);

  let writtenThisRun = 0;

  for (let page = startPage; page <= totalPages && state.written < targetCount; page++) {
    let html;
    try {
      html = await fetchTextWithRetry(buildSearchUrl(page), {
        headers: { 'X-Requested-With': 'XMLHttpRequest', Referer: REFERER },
      }, { retries: 5, baseDelayMs: 700 });
    } catch (err) {
      state.errors += 1;
      console.warn(`[DPM] page fetch failed page=${page}:`, err?.message || err);
      await fs.writeFile(STATE_PATH, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2) + '\n', 'utf8');
      await sleep(Math.max(500, PAGE_DELAY_MS));
      continue;
    }

    const items = parseListFragment(html);

    const uniqueUrls = [];
    const seenUrl = new Set();
    for (const it of items) {
      if (!it?.url) continue;
      if (seenUrl.has(it.url)) continue;
      seenUrl.add(it.url);
      uniqueUrls.push(it);
    }

    const jobs = uniqueUrls.map((it, idx) =>
      limiter(async () => {
        if (state.written >= targetCount) return;

        const detailUrl = it.url;
        const idMatch = detailUrl.match(/\/(\d+)\.html(?:\?|$)/);
        const probableId = idMatch ? `dpm-${idMatch[1]}` : null;
        if (probableId && seenIds.has(probableId)) return;

        let detailHtml;
        try {
          detailHtml = await fetchTextWithRetry(detailUrl, { headers: { Referer: REFERER } }, { retries: 4, baseDelayMs: 650 });
        } catch (err) {
          state.errors += 1;
          console.warn(`[DPM] detail fetch failed url=${detailUrl}:`, err?.message || err);
          return;
        }

        const row = parseDetailPage(detailHtml, detailUrl);

        // Ensure paintings-only (URL paths are unreliable).
        if (row.category && row.category !== 'Paintings') {
          state.skippedNonPaintings += 1;
          return;
        }

        // Use list-side image as fallback only if it's a real relic image.
        if (!row.imageUrl && it.imageUrl) row.imageUrl = it.imageUrl;

        if (!row.imageUrl) {
          state.skippedNoImage += 1;
          return;
        }

        if (!looksLikeRealDpmImage(row.imageUrl)) {
          state.skippedPlaceholder += 1;
          return;
        }

        row.raw.list = {
          title: it.title || '',
          period: it.period || '',
          imageUrl: it.imageUrl || '',
          page,
          idx,
        };

        await enqueueWriteRow(row);
      })
    );

    await Promise.all(jobs);
    await writeChain;

    // Hard-stop: future pages won't schedule if we've hit target.
    if (state.written >= targetCount) {
      state.lastPageCompleted = page;
      state.updatedAt = new Date().toISOString();
      await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf8');
      break;
    }

    state.lastPageCompleted = page;
    state.updatedAt = new Date().toISOString();
    await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf8');

    if (page % 10 === 0 || page === startPage) {
      console.log(`[DPM] page=${page}/${totalPages} written=${state.written}/${targetCount} (+${writtenThisRun} this run) skippedNoImage=${state.skippedNoImage} skippedPlaceholder=${state.skippedPlaceholder} errors=${state.errors}`);
    }

    if (PAGE_DELAY_MS) await sleep(PAGE_DELAY_MS);
  }

  console.log(`[DPM] Done crawling pages. written=${state.written} target=${targetCount}`);
  console.log(`[DPM] Converting JSONL -> JSON array (this may take a bit)...`);

  const n = await jsonlToJsonArray(OUT_JSONL, OUT_JSON);
  console.log(`[DPM] Wrote ${n} items -> ${OUT_JSON}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
