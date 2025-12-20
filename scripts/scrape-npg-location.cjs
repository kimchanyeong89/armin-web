const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function scrapeNPGLocations() {
  const START_LOCATION = parseInt(process.env.START_LOCATION || '998', 10);
  const END_ROOM = parseInt(process.env.END_ROOM || '11', 10); // number of rooms to scrape starting from START_LOCATION
  const MAX_PAGES = parseInt(process.env.MAX_PAGES || '999', 10);
  const CLEAN = process.env.CLEAN === '1';
  const COOKIES_PATH = process.env.COOKIES_PATH;
  const COOKIE_HEADER = process.env.HEADERS_COOKIE; // raw 'Cookie' header string
  const HEADLESS = !(process.env.HEADLESS === '0' || /false|no/i.test(process.env.HEADLESS || ''));
  const PAUSE_FOR_HUMAN = process.env.PAUSE_FOR_HUMAN === '1' || /true|yes/i.test(process.env.PAUSE_FOR_HUMAN || '');
  const STORAGE_STATE = process.env.STORAGE_STATE; // path to persist/reuse playwright storage state

  const outPath = path.join(__dirname, '..', 'public', 'data', 'npg-floor3.json');
  let rooms = Array.from({ length: END_ROOM }, (_, i) => ({ id: String(i + 1), title: `Room ${i + 1}`, items: [] }));

  if (!CLEAN && fs.existsSync(outPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      if (Array.isArray(existing.rooms)) rooms = existing.rooms;
    } catch {}
  }

  const browser = await chromium.launch({ headless: HEADLESS });
  const contextOptions = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
₩WebTransportq2w23e4r5790-    contextOptions.storageState = STORAGE_STATE;
    console.log(`Loaded storageState from ${STORAGE_STATE}`);
  }
  const context = await browser.newContext(contextOptions);
  if (COOKIE_HEADER && COOKIE_HEADER.trim()) {
    await context.setExtraHTTPHeaders({ Cookie: COOKIE_HEADER.trim() });
    console.log('Using raw Cookie header from HEADERS_COOKIE');
  }
  if (COOKIES_PATH && fs.existsSync(COOKIES_PATH)) {
    try {
      const raw = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
      const cookies = Array.isArray(raw) ? raw : raw.cookies;
      if (Array.isArray(cookies)) await context.addCookies(cookies);
      console.log(`Loaded cookies from ${COOKIES_PATH}`);
    } catch (e) {
      console.warn('Failed to load cookies:', e.message);
    }
  }
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  async function openWithRetry(url) {
    const start = Date.now();
    while (Date.now() - start < 90000) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        // Cookie consent
        try {
          const btn = await page.$("#onetrust-accept-btn-handler, button#onetrust-accept-btn-handler, button[aria-label*='Accept'], button:has-text('Accept all')");
          if (btn) await btn.click({ timeout: 2000 });
        } catch {}
        // Cloudflare check
        const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 1000) || '');
        let solvedCF = false;
        if (/Verifying you are human|Cloudflare/i.test(bodyText)) {
          if (PAUSE_FOR_HUMAN && !HEADLESS) {
            console.log('\nCloudflare challenge detected.');
            console.log('Action required: In the visible browser window, complete the "Verify you are human" check.');
            console.log('The scraper will resume automatically once the page content loads.');
            // Wait indefinitely until the challenge text disappears
            await page.waitForFunction(() => {
              const t = document.body?.innerText || '';
              return !/Verifying you are human|Cloudflare/i.test(t);
            }, { timeout: 0 });
            // Small settle time
            await page.waitForTimeout(1500);
            solvedCF = true;
          } else {
            await page.waitForTimeout(4000);
            continue;
          }
        }
        // If we just solved CF, reload the target URL once to ensure content renders with the token
        if (solvedCF) {
          try {
            // Try to read Cloudflare-provided post-challenge URL (cUPMDTk)
            const nextPath = await page.evaluate(() => {
              try { return window._cf_chl_opt && window._cf_chl_opt.cUPMDTk; } catch { return null; }
            });
            if (nextPath && typeof nextPath === 'string') {
              const target = nextPath.startsWith('http') ? nextPath : new URL(nextPath, 'https://www.npg.org.uk').href;
              console.log(`Navigating to CF post-challenge URL: ${target}`);
              await page.goto(target, { waitUntil: 'domcontentloaded' });
            } else {
              await page.goto(url, { waitUntil: 'domcontentloaded' });
            }
          } catch {}
        }
        // After CF handling, wait for search results to actually render (robust wait)
        try {
          await page.waitForLoadState('domcontentloaded');
          await page.waitForFunction(() => {
            const hasCards = document.querySelectorAll('ul.search-results__list li, .search-results__item, article.result, .results .result, .listing__item, .c-card').length > 0;
            const isChallenge = /Verifying you are human|Cloudflare/i.test(document.body?.innerText || '');
            return hasCards && !isChallenge;
          }, { timeout: 60000 });
        } catch {}

        // Persist storage state after first successful open, if requested
        if (STORAGE_STATE) {
          try {
            await context.storageState({ path: STORAGE_STATE });
            console.log(`Saved storageState to ${STORAGE_STATE}`);
          } catch {}
        }
        return true;
      } catch { await page.waitForTimeout(1500); }
    }
    return false;
  }

  const base = 'https://www.npg.org.uk/collections/search/location/';
  const toRoomIndex = (locCode) => (locCode - START_LOCATION + 1);

  for (let roomIdx = 1; roomIdx <= END_ROOM; roomIdx++) {
    const locCode = START_LOCATION + (roomIdx - 1);
    let pageNum = 1;
    let totalAdded = 0;
    console.log(`Scraping Room ${roomIdx} (location ${locCode})`);

    while (pageNum <= MAX_PAGES) {
      const url = `${base}${locCode}/?page=${pageNum}`;
      const ok = await openWithRetry(url);
      if (!ok) { console.error('Open failed (CF?) at', url); break; }

      // Wait for results or empty state
      try {
        await page.waitForSelector('main, .search-results, .results, .grid, .listing, .search-results__list', { timeout: 20000 });
      } catch {}

      // Debug: capture a small snippet to verify structure
      try {
        const snippet = await page.evaluate(() => {
          const m = document.querySelector('main') || document.body;
          return (m?.innerHTML || '').slice(0, 1500);
        });
        console.log('HTML snippet:', snippet);
      } catch {}

      // Save HTML snapshot for offline debugging/fallback
      try {
        const snapDir = path.join(__dirname, '..', 'downloads', 'npg');
        if (!fs.existsSync(snapDir)) fs.mkdirSync(snapDir, { recursive: true });
        const file = path.join(snapDir, `location-${locCode}-page-${pageNum}.html`);
        const html = await page.content();
        fs.writeFileSync(file, html);
        console.log(`Saved snapshot: ${file}`);
      } catch {}

      const { items, count, hasNext } = await page.evaluate(() => {
        const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const list = [];
        const sel = [
          'ul.search-results__list > li',
          '.search-results__item',
          'article',
          '.result',
          '.results .result',
          '.listing__item',
          '.c-card',
          'li, .grid__item, .card',
        ].join(',');
        const cards = document.querySelectorAll(sel);
        // Fallback: if no structured cards found, try anchors with images
        let pool = cards;
        if (!pool || pool.length === 0) {
          pool = document.querySelectorAll('a[href] img');
        }
        (pool || []).forEach((card, idx) => {
          const scope = card.closest ? (card.closest('li, article, .result, .c-card, .listing__item, .grid__item') || card.parentElement || card) : card;
          const a = scope.querySelector ? (scope.querySelector('a[href*="/collections/"]') || scope.querySelector('a[href]')) : null;
          const imgEl = scope.querySelector ? scope.querySelector('img') : (card.tagName === 'IMG' ? card : null);
          const getImg = (el) => {
            if (!el) return '';
            const ds = el.getAttribute('data-src') || el.getAttribute('data-lazy') || '';
            const ss = el.getAttribute('srcset') || '';
            const sr = el.getAttribute('src') || '';
            if (ds) return ds;
            if (ss) {
              // pick last candidate (largest)
              const parts = ss.split(',').map(s => s.trim());
              const last = parts[parts.length - 1] || '';
              const url = last.split(' ')[0];
              if (url) return url;
            }
            return sr;
          };
          const tEl = scope.querySelector ? (scope.querySelector('h3, h2, .title, .c-card__title') || a) : a;
          const meta = scope.querySelector ? (scope.querySelector('.artist, .creator, .meta, .c-card__meta, .details, .result__meta')) : null;
          const title = norm(tEl?.textContent || imgEl?.alt || 'Artwork');
          const metaText = norm(meta?.textContent || '');
          // Heuristic: try to split "Title — Artist — Date" or similar
          let artist = '';
          let date = '';
          const yearMatch = metaText.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
          if (yearMatch) date = yearMatch[0];
          const dashSplit = metaText.split(/—|\||·|,/).map(norm).filter(Boolean);
          if (dashSplit.length) artist = dashSplit[0];
          const year = yearMatch ? parseInt(yearMatch[1] || yearMatch[0], 10) : null;
          list.push({
            id: `npg-${Date.now()}-${idx}`,
            name: title,
            title,
            artist,
            year,
            date,
            image: getImg(imgEl),
            url: a?.href || ''
          });
        });
        const nextLink = document.querySelector('a[rel="next"], .pagination a[aria-label*="Next"], .pager__next a, a.next, a[title*="Next"]');
        return { items: list, count: list.length, hasNext: !!nextLink };
      });

      if (count === 0) {
        console.log(`No items on page ${pageNum} for location ${locCode}`);
        break;
      }

      // Save into room slot
      const idx = rooms.findIndex(r => r.id === String(roomIdx));
      const prev = idx >= 0 ? rooms[idx] : { id: String(roomIdx), title: `Room ${roomIdx}`, items: [] };
      const merged = (prev.items || []).concat(items);
      const dedup = [];
      const seen = new Set();
      for (const it of merged) {
        const key = it.url || `${it.name}-${it.artist}-${it.year}`;
        if (seen.has(key)) continue;
        seen.add(key);
        dedup.push(it);
      }
      const updated = { id: String(roomIdx), title: `Room ${roomIdx}`, items: dedup };
      if (idx >= 0) rooms[idx] = updated; else rooms.push(updated);
      totalAdded += items.length;

      fs.writeFileSync(outPath, JSON.stringify({ scrapedAt: new Date().toISOString(), source: base, rooms }, null, 2));
      console.log(`Room ${roomIdx}: saved page ${pageNum} (${items.length} items), total so far ${updated.items.length}`);

      if (!hasNext) break;
      pageNum += 1;
    }
    console.log(`Room ${roomIdx} complete. Total items: ${rooms.find(r => r.id === String(roomIdx))?.items.length || 0}`);
  }

  await browser.close();
}

scrapeNPGLocations().catch(err => { console.error(err); process.exit(1); });
