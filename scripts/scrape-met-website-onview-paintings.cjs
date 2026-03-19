/*
  Scrape Met website search results (NOT the public collectionapi) for:
    material=Paintings + showOnly=withImage + showOnly=onDisplay

  This avoids per-object detail API calls (and the 403/WAF issues), and
  follows the exact list defined by the website URL the user provided.

  Output:
    public/data/met-ny-on-view-paintings.jsonl (incremental, resumable)
    public/data/met-ny-on-view-paintings.json  (final array)
    scripts/.state/met-ny-on-view-paintings-website.state.json

  Usage:
    node scripts/scrape-met-website-onview-paintings.cjs

  Env:
    LIMIT=0             // 0 means ALL (default)
    RESUME=1            // default 1
    PAGE_SIZE=40        // offset step (default 40; best-effort)
    START_OFFSET=0
    END_OFFSET=0        // 0 means unknown/unbounded
    PAUSE_MS=800        // delay between pages
*/

const fs = require('node:fs/promises');
const fssync = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const { chromium } = require('playwright');

const LIMIT = Math.max(0, Number(process.env.LIMIT || '0') || 0);
const RESUME = String(process.env.RESUME || '1') !== '0';
const PAGE_SIZE = Math.max(1, Number(process.env.PAGE_SIZE || '40') || 40);
const START_OFFSET = Math.max(0, Number(process.env.START_OFFSET || '0') || 0);
const END_OFFSET = Math.max(0, Number(process.env.END_OFFSET || '0') || 0);
const PAUSE_MS = Math.max(0, Number(process.env.PAUSE_MS || '800') || 800);
const MAX_EMPTY_RETRIES = Math.max(0, Number(process.env.MAX_EMPTY_RETRIES || '3') || 3);

const OUT_DIR = path.join(process.cwd(), 'public', 'data');
const OUT_JSONL = path.join(OUT_DIR, 'met-ny-on-view-paintings.jsonl');
const OUT_JSON = path.join(OUT_DIR, 'met-ny-on-view-paintings.json');

const STATE_DIR = path.join(process.cwd(), 'scripts', '.state');
const STATE_PATH = path.join(STATE_DIR, 'met-ny-on-view-paintings-website.state.json');

const BASE_URL = 'https://www.metmuseum.org/art/collection/search';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normalizeSpace = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const buildUrl = (offset) => {
  const u = new URL(BASE_URL);
  u.searchParams.set('material', 'Paintings');
  u.searchParams.set('offset', String(offset));
  // Met uses showOnly repeated in the URL; preserve that.
  u.searchParams.append('showOnly', 'withImage');
  u.searchParams.append('showOnly', 'onDisplay');
  return u.toString();
};

const loadDoneIdsFromJsonl = async () => {
  const done = new Set();
  if (!fssync.existsSync(OUT_JSONL)) return done;

  const stream = fssync.createReadStream(OUT_JSONL, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    const t = String(line || '').trim();
    if (!t) continue;
    try {
      const obj = JSON.parse(t);
      const id = Number(obj?.objectID);
      if (Number.isFinite(id) && id > 0) done.add(id);
    } catch {
      // ignore
    }
  }
  return done;
};

const writeState = async (state) => {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2));
};

const finalizeJson = async () => {
  const items = [];
  if (!fssync.existsSync(OUT_JSONL)) {
    await fs.writeFile(OUT_JSON, JSON.stringify([], null, 2));
    return 0;
  }

  const stream = fssync.createReadStream(OUT_JSONL, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const t = String(line || '').trim();
    if (!t) continue;
    try {
      const obj = JSON.parse(t);
      const id = Number(obj?.objectID);
      if (!Number.isFinite(id) || id <= 0) continue;
      items.push(obj);
    } catch {
      // ignore
    }
  }

  // Dedup by objectID (keep first)
  const seen = new Set();
  const dedup = [];
  for (const it of items) {
    const id = Number(it.objectID);
    if (seen.has(id)) continue;
    seen.add(id);
    dedup.push(it);
  }

  dedup.sort((a, b) => Number(a.objectID) - Number(b.objectID));
  await fs.writeFile(OUT_JSON, JSON.stringify(dedup, null, 2));
  return dedup.length;
};

(async () => {
  await fs.mkdir(OUT_DIR, { recursive: true });

  if (!RESUME) {
    await fs.rm(OUT_JSONL, { force: true });
    // Keep OUT_JSON until we successfully finalize; this avoids showing 0
    // if a long scrape is interrupted mid-run.
  }

  const doneIds = RESUME ? await loadDoneIdsFromJsonl() : new Set();
  console.log('resume', RESUME ? 1 : 0, 'doneIds', doneIds.size);

  let browser;
  let appendHandle;
  let pages = 0;
  let totalKept = 0;
  let lastPageCount = null;
  let offset = START_OFFSET;
  let knownTotalHits = null;

  const shouldStopByLimit = () => LIMIT > 0 && totalKept >= LIMIT;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      locale: 'en-US',
    });
    const page = await context.newPage();

    appendHandle = await fs.open(OUT_JSONL, 'a');

    while (true) {
      if (shouldStopByLimit()) break;
      if (END_OFFSET > 0 && offset > END_OFFSET) break;
      if (knownTotalHits && offset >= knownTotalHits) break;

      const url = buildUrl(offset);
      console.log('page', pages + 1, 'offset', offset, url);

      let results = [];
      let totalHits = null;
      let blocked = false;

      for (let attempt = 0; attempt <= MAX_EMPTY_RETRIES; attempt += 1) {
        if (attempt > 0) {
          const backoff = blocked ? (4_000 + attempt * 4_000) : (1_000 + attempt * 800);
          console.log('retry', attempt, 'afterMs', backoff, blocked ? '(blocked?)' : '');
          await sleep(backoff);
        }

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

        // Wait for result links (best-effort). The page may be slow.
        try {
          await page.waitForSelector('a[href^="/art/collection/search/"]', { timeout: 20_000 });
        } catch {
          // no-op
        }

        // Small settle time for client-rendered content.
        await page.waitForTimeout(500);

        const evaluated = await page.evaluate(() => {
          const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim();

          const bodyText = normalize(document.body?.innerText || '');
          const blocked = /incapsula|captcha|verify you are human|access denied|unusual traffic/i.test(bodyText);

          // Try to extract total hits from the results header text.
          // Common formats include: "Results 1–40 of 2,371".
          let totalHits = null;
          const m = bodyText.match(/\bResults\s+\d+\s*[\-\u2013]\s*\d+\s+of\s+([\d,]{3,})\b/i)
            || bodyText.match(/\bof\s+([\d,]{3,})\s+results\b/i);
          if (m && m[1]) {
            const n = Number(String(m[1]).replace(/,/g, ''));
            if (Number.isFinite(n) && n > 0) totalHits = n;
          }

          const anchors = Array.from(document.querySelectorAll('a[href^="/art/collection/search/"]'));
          const items = [];

          for (const a of anchors) {
            const href = a.getAttribute('href') || '';
            const m = href.match(/\/art\/collection\/search\/(\d+)\b/);
            if (!m) continue;
            const objectID = Number(m[1]);
            if (!Number.isFinite(objectID) || objectID <= 0) continue;

            const card = a.closest('li, article, div') || a;

            const img = card.querySelector('img');
            const imageUrl = img ? (img.getAttribute('src') || img.getAttribute('data-src') || '') : '';

            const text = normalize(card.textContent || '');

            items.push({
              objectID,
              objectURL: new URL(href, location.origin).toString(),
              primaryImageSmall: imageUrl,
              _cardText: text,
            });
          }

          const seen = new Set();
          const dedup = [];
          for (const it of items) {
            if (seen.has(it.objectID)) continue;
            seen.add(it.objectID);
            dedup.push(it);
          }

          return { results: dedup, totalHits, blocked };
        });

        results = evaluated?.results || [];
        totalHits = evaluated?.totalHits ?? null;
        blocked = Boolean(evaluated?.blocked);

        if (results.length > 0) break;
        // If blocked or empty, retry a few times before deciding we're done.
      }

      if (Number.isFinite(totalHits) && totalHits > 0 && !knownTotalHits) {
        knownTotalHits = totalHits;
        console.log('detected totalHits', knownTotalHits);
      }

      if (results.length === 0) {
        console.log('no results; stopping', blocked ? '(blocked?)' : '');
        break;
      }

      const fresh = [];
      for (const r of results) {
        if (LIMIT > 0 && fresh.length + totalKept >= LIMIT) break;
        const id = Number(r.objectID);
        if (!Number.isFinite(id) || id <= 0) continue;
        if (doneIds.has(id)) continue;
        doneIds.add(id);

        // Minimal normalized record (compatible with existing Met loader mapping)
        fresh.push({
          objectID: id,
          title: '',
          artistDisplayName: '',
          objectDate: '',
          primaryImage: '',
          primaryImageSmall: normalizeSpace(r.primaryImageSmall),
          GalleryNumber: 'On display',
          objectURL: r.objectURL,
          // Keep raw card text for later enrichment/debug (doesn't break UI)
          _cardText: r._cardText,
        });
      }

      for (const it of fresh) {
        await appendHandle.appendFile(JSON.stringify(it) + '\n');
      }

      totalKept += fresh.length;
      pages += 1;
      lastPageCount = results.length;

      await writeState({
        updatedAt: new Date().toISOString(),
        offset,
        pageSize: PAGE_SIZE,
        pages,
        lastPageCount,
        totalKept,
        limit: LIMIT,
        totalHits: knownTotalHits,
        sampleUrl: url,
        outputJsonl: path.relative(process.cwd(), OUT_JSONL),
      });

      console.log('pageStats', { results: results.length, fresh: fresh.length, totalKept });

      // Heuristic: if we are past a point and the site returns <5 results, we likely reached the end.
      if (pages >= 3 && results.length < 5) break;

      // If we know the total and this was the last partial page, stop.
      if (knownTotalHits && offset + PAGE_SIZE >= knownTotalHits && results.length < PAGE_SIZE) break;

      offset += PAGE_SIZE;
      await sleep(PAUSE_MS + Math.floor(Math.random() * 400));
    }
  } catch (err) {
    await writeState({
      errorAt: new Date().toISOString(),
      pages,
      totalKept,
      offset,
      lastPageCount,
      message: err?.message || String(err),
    });
    console.error('scrape failed:', err);
  } finally {
    try { if (appendHandle) await appendHandle.close(); } catch { }
    try { if (browser) await browser.close(); } catch { }

    const finalCount = await finalizeJson();
    await writeState({
      finishedAt: new Date().toISOString(),
      pages,
      totalKept,
      finalCount,
      outputJson: path.relative(process.cwd(), OUT_JSON),
      outputJsonl: path.relative(process.cwd(), OUT_JSONL),
    });

    console.log('wrote', path.relative(process.cwd(), OUT_JSON), 'count', finalCount);
  }
})();
