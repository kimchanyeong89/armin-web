const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function scrapeNPGPortrait() {
  const START_URL = process.env.START_URL || 'https://www.npg.org.uk/collections/search/portrait/mw02026/King-Edward-III';
  const MAX_PAGES = parseInt(process.env.MAX_PAGES || '999', 10);
  const CLEAN = process.env.CLEAN === '1';
  const COOKIES_PATH = process.env.COOKIES_PATH;
  const COOKIE_HEADER = process.env.HEADERS_COOKIE; // raw 'Cookie' header string

  const outPath = path.join(__dirname, '..', 'public', 'data', 'npg-floor3.json');
  let rooms = Array.from({ length: 11 }, (_, i) => ({ id: String(i + 1), title: `Room ${i + 1}`, items: [] }));

  if (!CLEAN && fs.existsSync(outPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      if (Array.isArray(existing.rooms)) rooms = existing.rooms;
    } catch {}
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    locale: 'en-GB',
  });
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
        if (/Verifying you are human|Cloudflare/i.test(bodyText)) { 
          // Try to solve Turnstile challenge
          try {
            // Wait for the challenge widget to load
            await page.waitForSelector('[id^="cf-chl-widget-"]', { timeout: 10000 });
            // Click the challenge widget div (which contains the iframe)
            const widget = await page.$('[id^="cf-chl-widget-"]');
            if (widget) {
              await widget.click();
              console.log('Clicked challenge widget');
              await page.waitForTimeout(5000); // Wait for verification
            }
          } catch (e) {
            console.log('Challenge click failed:', e.message);
          }
          await page.waitForTimeout(4000); 
          continue; 
        }
        return true;
      } catch { await page.waitForTimeout(1500); }
    }
    return false;
  }

  let pageNum = 1;
  let totalAdded = 0;
  console.log(`Scraping from ${START_URL}`);

  while (pageNum <= MAX_PAGES) {
    const url = pageNum === 1 ? START_URL : START_URL + `?page=${pageNum}`;
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
      console.log(`No items on page ${pageNum}`);
      break;
    }

    // Save into room 1 slot
    const roomIdx = 0; // Room 1
    const prev = rooms[roomIdx];
    const merged = (prev.items || []).concat(items);
    const dedup = [];
    const seen = new Set();
    for (const it of merged) {
      const key = it.url || `${it.name}-${it.artist}-${it.year}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dedup.push(it);
    }
    const updated = { id: '1', title: 'Room 1', items: dedup };
    rooms[roomIdx] = updated;
    totalAdded += items.length;

    fs.writeFileSync(outPath, JSON.stringify({ scrapedAt: new Date().toISOString(), source: START_URL, rooms }, null, 2));
    console.log(`Room 1: saved page ${pageNum} (${items.length} items), total so far ${updated.items.length}`);

    if (!hasNext) break;
    pageNum += 1;
  }
  console.log(`Room 1 complete. Total items: ${rooms[0].items.length}`);

  await browser.close();
}

scrapeNPGPortrait().catch(err => { console.error(err); process.exit(1); });