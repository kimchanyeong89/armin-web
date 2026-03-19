/*
  Scrape The Met Collection API for: On-view + has-image + Paintings.

  Goal:
  - Reproduce (as closely as possible via the public API) the Met website list:
      material=Paintings + showOnly=withImage + showOnly=onDisplay

  Notes:
  - The public Met Collection API search endpoint supports:
      hasImages=true, isOnView=true, q=<required>
    It does not support a first-class "material=Paintings" filter, so we:
      1) search broadly (prefer q="*")
      2) fetch object details
      3) filter to painting-like records (classification/objectName)

  Output:
  - public/data/met-ny-on-view-paintings.jsonl  (incremental, resumable)
  - public/data/met-ny-on-view-paintings.json   (final array)
  - scripts/.state/met-ny-on-view-paintings.state.json

  Usage:
    node ./scripts/scrape-met-on-view-paintings.cjs

  Env:
    LIMIT=0            // 0 means ALL (default)
    CONCURRENCY=8      // detail fetch concurrency
    RESUME=1           // resume from jsonl (default 1)
    Q=*                // search query for /search (default "*")
*/

const fs = require('node:fs/promises');
const fssync = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const pLimitImport = require('p-limit');
const pLimit = pLimitImport?.default || pLimitImport;

const API_BASE = 'https://collectionapi.metmuseum.org/public/collection/v1';

const LIMIT = Math.max(0, Number(process.env.LIMIT || '0') || 0);
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || '4') || 4);
const RESUME = String(process.env.RESUME || '1') !== '0';
const Q = String(process.env.Q || 'painting').trim() || 'painting';
const FINALIZE_ONLY = String(process.env.FINALIZE_ONLY || '0') === '1';
const REQUEST_DELAY_MS = Math.max(0, Number(process.env.REQUEST_DELAY_MS || '80') || 80);

const OUT_DIR = path.join(process.cwd(), 'public', 'data');
const OUT_JSONL = path.join(OUT_DIR, 'met-ny-on-view-paintings.jsonl');
const OUT_JSON = path.join(OUT_DIR, 'met-ny-on-view-paintings.json');

const STATE_DIR = path.join(process.cwd(), 'scripts', '.state');
const STATE_PATH = path.join(STATE_DIR, 'met-ny-on-view-paintings.state.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const normalizeSpace = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const cookieJar = new Map();
const getCookieHeader = () => {
  const pairs = [];
  for (const [name, value] of cookieJar.entries()) {
    if (!name || !value) continue;
    pairs.push(`${name}=${value}`);
  }
  return pairs.join('; ');
};

const ingestSetCookies = (setCookieHeaders) => {
  const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : [];
  for (const header of list) {
    const firstPart = String(header || '').split(';')[0] || '';
    const eq = firstPart.indexOf('=');
    if (eq <= 0) continue;
    const name = firstPart.slice(0, eq).trim();
    const value = firstPart.slice(eq + 1).trim();
    if (name && value) cookieJar.set(name, value);
  }
};

const fetchWithCookieSupport = async (url, init = {}) => {
  const cookieHeader = getCookieHeader();
  const res = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; armin-web scraper)',
      'Accept': 'application/json, text/plain, */*',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(init.headers || {}),
    },
  });

  const setCookies = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
  ingestSetCookies(setCookies);

  return res;
};

const fetchJson = async (url, init = {}) => {
  const res = await fetchWithCookieSupport(url, init);
  if (!res.ok) {
    const ct = res.headers.get('content-type') || '';
    const body = ct.includes('application/json') ? await res.text() : await res.text();
    throw new Error(`HTTP ${res.status} for ${url} (ct=${ct}) body=${String(body).slice(0, 120)}`);
  }
  return await res.json();
};

const primeMetCookies = async () => {
  // Incapsula occasionally blocks direct API calls unless you first accept its cookies.
  // A first request often returns HTML + Set-Cookie headers. We capture the cookies and re-use them.
  const u = new URL(`${API_BASE}/search`);
  u.searchParams.set('hasImages', 'true');
  u.searchParams.set('isOnView', 'true');
  u.searchParams.set('q', Q || 'painting');

  const res = await fetchWithCookieSupport(u.toString(), {
    headers: {
      Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
    },
  });

  // Intentionally ignore status/body; we only care about Set-Cookie.
  await res.arrayBuffer().catch(() => { });
};

const fetchJsonWithRetry = async (url, init = {}, opts = {}) => {
  const retries = Math.max(0, Number(opts.retries ?? 5));
  const baseDelayMs = Math.max(0, Number(opts.baseDelayMs ?? 600));

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await fetchJson(url, init);
    } catch (err) {
      lastErr = err;
      const msg = err?.message || String(err);
      const is403 = /HTTP\s+403\b/i.test(msg);
      const shouldRetry = is403 || /HTTP\s+(429|5\d\d)/i.test(msg) || /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|network|fetch/i.test(msg);
      if (!shouldRetry || attempt === retries) break;

      if (is403) {
        // eslint-disable-next-line no-await-in-loop
        await primeMetCookies();
        // eslint-disable-next-line no-await-in-loop
        await sleep(800 + Math.floor(Math.random() * 400));
      }

      const jitter = Math.floor(Math.random() * 250);
      const delayMs = Math.min(12_000, baseDelayMs * Math.pow(2, attempt) + jitter);
      // eslint-disable-next-line no-await-in-loop
      await sleep(delayMs);
    }
  }
  throw lastErr;
};

const loadJsonlObjectIds = async (filePath) => {
  const ids = new Set();
  if (!fssync.existsSync(filePath)) return ids;

  const stream = fssync.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const t = String(line || '').trim();
    if (!t) continue;
    try {
      const obj = JSON.parse(t);
      const id = Number(obj?.objectID);
      if (Number.isFinite(id) && id > 0) ids.add(id);
    } catch {
      // ignore
    }
  }

  return ids;
};

const metSearch = async (q) => {
  const u = new URL(`${API_BASE}/search`);
  u.searchParams.set('hasImages', 'true');
  u.searchParams.set('isOnView', 'true');
  u.searchParams.set('q', q);
  return await fetchJsonWithRetry(u.toString(), {}, { retries: 5, baseDelayMs: 800 });
};

const metObject = async (objectID) => {
  const u = `${API_BASE}/objects/${objectID}`;
  return await fetchJsonWithRetry(u, {}, { retries: 5, baseDelayMs: 800 });
};

const isPaintingLike = (obj) => {
  const classification = normalizeSpace(obj?.classification).toLowerCase();
  const objectName = normalizeSpace(obj?.objectName).toLowerCase();
  return classification === 'paintings' || objectName.includes('painting');
};

const hasImage = (obj) => {
  const img = normalizeSpace(obj?.primaryImageSmall) || normalizeSpace(obj?.primaryImage);
  return img.length > 0;
};

const isOnView = (obj) => {
  return normalizeSpace(obj?.GalleryNumber).length > 0;
};

const simplify = (obj) => {
  return {
    objectID: obj?.objectID,
    title: normalizeSpace(obj?.title),
    artistDisplayName: normalizeSpace(obj?.artistDisplayName),
    primaryImage: normalizeSpace(obj?.primaryImage),
    primaryImageSmall: normalizeSpace(obj?.primaryImageSmall),
    department: normalizeSpace(obj?.department),
    classification: normalizeSpace(obj?.classification),
    objectName: normalizeSpace(obj?.objectName),
    medium: normalizeSpace(obj?.medium),
    objectDate: normalizeSpace(obj?.objectDate),
    GalleryNumber: normalizeSpace(obj?.GalleryNumber),
    objectURL: normalizeSpace(obj?.objectURL),
    isPublicDomain: obj?.isPublicDomain === true,
  };
};

const writeState = async (state) => {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2));
};

const main = async () => {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const finalizeFromJsonl = async (meta = {}) => {
    const finalItems = [];
    if (!fssync.existsSync(OUT_JSONL)) {
      await fs.writeFile(OUT_JSON, JSON.stringify([], null, 2));
      await writeState({ finishedAt: new Date().toISOString(), included: 0, note: 'no jsonl found', ...meta });
      console.log('wrote', path.relative(process.cwd(), OUT_JSON), 'count', 0);
      return;
    }

    const stream = fssync.createReadStream(OUT_JSONL, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      const t = String(line || '').trim();
      if (!t) continue;
      try {
        const obj = JSON.parse(t);
        if (obj?._skip) continue;
        if (obj?.error) continue;
        if (!obj?.objectID) continue;
        finalItems.push(obj);
      } catch {
        // ignore
      }
    }

    finalItems.sort((a, b) => Number(a.objectID) - Number(b.objectID));
    await fs.writeFile(OUT_JSON, JSON.stringify(finalItems, null, 2));
    await writeState({ finishedAt: new Date().toISOString(), included: finalItems.length, ...meta });
    console.log('wrote', path.relative(process.cwd(), OUT_JSON), 'count', finalItems.length);
  };

  if (FINALIZE_ONLY) {
    await finalizeFromJsonl({ mode: 'finalize_only', q: Q, limit: LIMIT });
    return;
  }

  await primeMetCookies();

  if (!RESUME) {
    await fs.rm(OUT_JSONL, { force: true });
    await fs.rm(OUT_JSON, { force: true });
  }

  const doneIds = RESUME ? await loadJsonlObjectIds(OUT_JSONL) : new Set();
  console.log('resume', RESUME ? 1 : 0, 'doneIds', doneIds.size);

  console.log('searching met /search ...');
  let search = await metSearch(Q);
  if (!Array.isArray(search?.objectIDs) || search.objectIDs.length === 0) {
    console.warn(`no objectIDs for q=${JSON.stringify(Q)}; falling back to q="painting"`);
    search = await metSearch('painting');
  }

  const objectIDs = Array.isArray(search?.objectIDs) ? search.objectIDs.filter((n) => Number.isFinite(n) && n > 0) : [];
  console.log('searchTotal', search?.total, 'objectIDs', objectIDs.length);

  const ids = LIMIT > 0 ? objectIDs.slice(0, LIMIT) : objectIDs;
  const toFetch = ids.filter((id) => !doneIds.has(id));

  console.log('target', ids.length, 'toFetch', toFetch.length, 'concurrency', CONCURRENCY);

  const appendHandle = await fs.open(OUT_JSONL, 'a');

  let fetched = 0;
  let kept = 0;
  let skipped = 0;
  let errored = 0;

  const limit = pLimit(CONCURRENCY);

  const tasks = toFetch.map((objectID) => limit(async () => {
    try {
      if (REQUEST_DELAY_MS > 0) {
        await sleep(REQUEST_DELAY_MS + Math.floor(Math.random() * 80));
      }
      const obj = await metObject(objectID);

      fetched++;

      const simplified = simplify(obj);

      const ok = isPaintingLike(obj) && hasImage(obj) && isOnView(obj);
      if (ok) {
        kept++;
        await appendHandle.appendFile(JSON.stringify(simplified) + '\n');
      } else {
        skipped++;
        await appendHandle.appendFile(JSON.stringify({ objectID, _skip: true }) + '\n');
      }

      if ((fetched + skipped + errored) % 50 === 0) {
        console.log('progress', { fetched, kept, skipped, errored });
        await writeState({ updatedAt: new Date().toISOString(), q: Q, limit: LIMIT, fetched, kept, skipped, errored, done: doneIds.size + fetched + skipped + errored });
      }
    } catch (err) {
      errored++;
      await appendHandle.appendFile(JSON.stringify({ objectID, error: err?.message || String(err) }) + '\n');
    }
  }));

  await Promise.all(tasks);
  await appendHandle.close();

  console.log('done', { fetched, kept, skipped, errored });

  await finalizeFromJsonl({
    q: Q,
    limit: LIMIT,
    totalFromSearch: search?.total ?? null,
    idsFromSearch: objectIDs.length,
    outputJson: path.relative(process.cwd(), OUT_JSON),
    outputJsonl: path.relative(process.cwd(), OUT_JSONL),
  });
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
