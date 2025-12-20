const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function scrapeNPGFloor3() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    locale: 'en-GB',
  });
  // Attempt to import cookies to bypass Cloudflare if provided
  const cookiesPath = process.env.COOKIES_PATH;
  if (cookiesPath && fs.existsSync(cookiesPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
      if (Array.isArray(raw)) {
        await context.addCookies(raw);
        console.log(`Loaded ${raw.length} cookies from ${cookiesPath}`);
      } else if (raw && Array.isArray(raw.cookies)) {
        await context.addCookies(raw.cookies);
        console.log(`Loaded ${raw.cookies.length} cookies from ${cookiesPath}`);
      }
    } catch (e) {
      console.warn('Failed to load cookies (continuing):', e.message);
    }
  }
  const page = await context.newPage();
  await page.addInitScript(() => {
    // Basic stealth: hide webdriver flag
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const floorUrl = 'https://www.npg.org.uk/visit/floor-plans/floor-3/';
  const startRoom = parseInt(process.env.START_ROOM || '1', 10);
  const endRoom = parseInt(process.env.END_ROOM || '18', 10);
  const resume = process.env.CLEAN !== '1';

  // Load existing file for resume
  const outPath = path.join(__dirname, '..', 'public', 'data', 'npg-floor3.json');
  let rooms = Array.from({ length: 18 }, (_, i) => ({ id: String(i + 1), title: `Room ${i + 1}`, items: [] }));
  if (resume && fs.existsSync(outPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      if (Array.isArray(existing.rooms)) rooms = existing.rooms;
    } catch {}
  }

  // Navigate to floor page; may have Cloudflare challenge, so wait and retry
  async function openWithRetry(url) {
    const start = Date.now();
    while (Date.now() - start < 60000) { // up to 60s
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        // If Cloudflare challenge present, wait briefly
        const cf = await page.locator('text=Verifying you are human').count();
        if (cf > 0) {
          await page.waitForTimeout(4000);
          continue;
        }
        return true;
      } catch {
        await page.waitForTimeout(2000);
      }
    }
    return false;
  }

  const ok = await openWithRetry(floorUrl);
  if (!ok) {
    console.error('Failed to open NPG floor page (Cloudflare?)');
    await browser.close();
    process.exit(1);
  }

  // Extract room links (1–18) from the floor plan page; also try image maps
  const roomLinks = await page.evaluate(() => {
    const map = new Map();
    const textFrom = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    anchors.forEach(a => {
      const text = textFrom(a);
      const m = text.match(/\bRoom\s*(\d{1,2})\b/i);
      if (m) {
        const id = m[1];
        map.set(id, a.href);
      }
    });
    // imagemap areas
    const areas = Array.from(document.querySelectorAll('area[href]'));
    areas.forEach(area => {
      const alt = textFrom(area);
      const m = alt.match(/\bRoom\s*(\d{1,2})\b/i);
      if (m) {
        const id = m[1];
        map.set(id, area.href);
      }
    });
    return Array.from(map.entries());
  });

  // Optional override mapping file (user-provided) if discovery fails
  const mappingPath = path.join(__dirname, 'npg-floor3-mapping.json');
  let mapping = {};
  if (fs.existsSync(mappingPath)) {
    try { mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8')) || {}; } catch {}
  }
  const linkByRoom = Object.assign({}, Object.fromEntries(roomLinks), mapping);

  for (let n = startRoom; n <= endRoom; n++) {
    const key = String(n);
    const url = linkByRoom[key];
    if (!url) {
      console.warn(`No link found for room ${key}`);
      continue;
    }
    console.log(`Scraping Room ${key}: ${url}`);

    try {
      await openWithRetry(url);
      // Try to find artwork cards; selectors are best-effort and may require adjustment
      const items = await page.evaluate(() => {
        const out = [];
        const cards = document.querySelectorAll('article, .c-card, .listing__item, .card');
        cards.forEach((card, idx) => {
          const link = card.querySelector('a[href]');
          const img = card.querySelector('img');
          const titleEl = card.querySelector('h3, h2, .c-card__title, .card__title, .title') || link;
          const artistEl = card.querySelector('.artist, .meta .creator, .c-card__meta-item');
          const dateEl = card.querySelector('.date, time, .c-card__meta-item');
          const title = (titleEl?.textContent || img?.alt || 'Artwork').replace(/\s+/g, ' ').trim();
          let artist = (artistEl?.textContent || '').replace(/\s+/g, ' ').trim();
          let date = (dateEl?.textContent || '').replace(/\s+/g, ' ').trim();
          if (!artist && link?.textContent) {
            const t = link.textContent.replace(/\s+/g, ' ').trim();
            const parts = t.split(' by ');
            if (parts.length > 1) {
              artist = parts.pop();
            }
          }
          const yearMatch = date.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
          const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
          out.push({
            id: `npg-${idx}-${Date.now()}`,
            name: title,
            title,
            artist,
            year,
            date,
            image: img?.src || '',
            url: link?.href || ''
          });
        });
        return out;
      });

      const roomIdx = rooms.findIndex(r => r.id === key);
      if (roomIdx >= 0) rooms[roomIdx] = { id: key, title: `Room ${key}`, items };
      else rooms.push({ id: key, title: `Room ${key}`, items });

      fs.writeFileSync(outPath, JSON.stringify({ scrapedAt: new Date().toISOString(), source: floorUrl, rooms }, null, 2));
      console.log(`Saved Room ${key} with ${items.length} items.`);
    } catch (e) {
      console.error(`Failed Room ${key}:`, e.message || e);
    }
  }

  await browser.close();
}

scrapeNPGFloor3().catch(err => { console.error(err); process.exit(1); });
