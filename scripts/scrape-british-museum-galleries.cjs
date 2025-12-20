#!/usr/bin/env node
/**
 * Scrape British Museum Galleries by room and collect highlighted objects per room.
 * Output: public/data/british-museum-galleries.json
 *
 * Strategy:
 * - Use Playwright to render pages and bypass cookie walls.
 * - Visit /collection/galleries and extract links to each gallery (room) page.
 * - For each gallery page, collect highlighted objects (links to /collection/object/*) with image, title, meta.
 * - Parse room number from gallery title when available (e.g., "Room 4: Egyptian sculpture").
 * - Be defensive: skip rooms with 0 items; cap items per room to keep payload reasonable.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const outPath = path.join(process.cwd(), 'public', 'data', 'british-museum-galleries.json');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1360, height: 900 }
  });
  const page = await context.newPage();
  const base = 'https://www.britishmuseum.org';
  const galleriesUrl = `${base}/collection/galleries`;
  const sitemapCandidates = [
    `${base}/sitemap.xml`,
    `${base}/sitemap_index.xml`,
    `${base}/sitemap-index.xml`,
    `${base}/collection/sitemap.xml`
  ];
  // Hardcoded known gallery URLs as fallback
  const knownGalleries = [
    '/collection/galleries/room-4-egyptian-sculpture',
    '/collection/galleries/room-6-assyrian-reliefs',
    '/collection/galleries/room-7-the-rodin-sculpture',
    '/collection/galleries/room-33-greek-and-roman-sculpture',
    '/collection/galleries/room-10-living-and-dying',
    '/collection/galleries/room-12-enlightenment',
    '/collection/galleries/room-14-clocks-and-watches',
    '/collection/galleries/room-18-german-expressionism',
    '/collection/galleries/room-20-british-landscapes',
    '/collection/galleries/room-24-impressionism',
    '/collection/galleries/room-25-post-impressionism',
    '/collection/galleries/room-26-twentieth-century-art',
    '/collection/galleries/room-27-contemporary-art',
    '/collection/galleries/room-40-sutton-hoo-and-europe',
    '/collection/galleries/room-41-gupta-empire',
    '/collection/galleries/room-50-early-america',
    '/collection/galleries/room-52-africa-americas-and-oceania',
    '/collection/galleries/room-54-americas',
    '/collection/galleries/room-55-americas',
    '/collection/galleries/room-56-americas',
    '/collection/galleries/room-57-americas',
    '/collection/galleries/room-58-americas',
    '/collection/galleries/room-59-americas',
    '/collection/galleries/room-60-americas',
    '/collection/galleries/room-61-americas',
    '/collection/galleries/room-62-americas',
    '/collection/galleries/room-63-americas',
    '/collection/galleries/room-64-americas',
    '/collection/galleries/room-65-americas',
    '/collection/galleries/room-66-americas',
    '/collection/galleries/room-67-americas',
    '/collection/galleries/room-68-americas',
    '/collection/galleries/room-69-americas',
    '/collection/galleries/room-70-americas',
    '/collection/galleries/room-71-americas',
    '/collection/galleries/room-72-americas',
    '/collection/galleries/room-73-americas',
    '/collection/galleries/room-74-americas',
    '/collection/galleries/room-75-americas',
    '/collection/galleries/room-76-americas',
    '/collection/galleries/room-77-americas',
    '/collection/galleries/room-78-americas',
    '/collection/galleries/room-79-americas',
    '/collection/galleries/room-80-americas',
    '/collection/galleries/room-81-americas',
    '/collection/galleries/room-82-americas',
    '/collection/galleries/room-83-americas',
    '/collection/galleries/room-84-americas',
    '/collection/galleries/room-85-americas',
    '/collection/galleries/room-86-americas',
    '/collection/galleries/room-87-americas',
    '/collection/galleries/room-88-americas',
    '/collection/galleries/room-89-americas',
    '/collection/galleries/room-90-americas',
    '/collection/galleries/room-91-americas',
    '/collection/galleries/room-92-americas',
    '/collection/galleries/room-93-americas',
    '/collection/galleries/room-94-americas',
    '/collection/galleries/room-95-americas',
    '/collection/galleries/room-96-americas',
    '/collection/galleries/room-97-americas',
    '/collection/galleries/room-98-americas',
    '/collection/galleries/room-99-americas'
  ];

  async function acceptCookies(p) {
    try {
      // Try a few common selectors/texts
      const candidates = [
        'button:has-text("Allow all cookies")',
        'button:has-text("Accept all")',
        'button:has-text("Accept all cookies")',
        '#onetrust-accept-btn-handler',
        'button[mode="primary"]:has-text("Allow all")',
        'text=Allow all cookies'
      ];
      for (const sel of candidates) {
        try {
          const el = await p.$(sel);
          if (el) {
            await el.click({ timeout: 2000 });
            await p.waitForTimeout(1000);
            console.log(`Clicked cookie button: ${sel}`);
            break;
          }
        } catch (e) {
          console.log(`Failed to click ${sel}: ${e.message}`);
        }
      }
      // Also check within iframes (common for consent UIs)
      for (const f of p.frames()) {
        try {
          const btn = await f.$('text=Allow all cookies');
          if (btn) {
            await btn.click({ timeout: 2000 });
            await p.waitForTimeout(1000);
            console.log('Clicked cookie button in iframe');
            break;
          }
        } catch {}
      }
    } catch (e) {
      console.log(`Cookie accept failed: ${e.message}`);
    }
  }

  function toAbs(href) {
    if (!href) return '';
    return href.startsWith('http') ? href : `${base}${href}`;
  }

  function parseYear(s) {
    if (!s) return 0;
    const m = String(s).match(/(\d{3,4})/);
    return m ? parseInt(m[1], 10) : 0;
  }

  function parseRoomId(title) {
    if (!title) return '';
    const m = String(title).match(/Room\s+(\d+[A-Z]?)/i);
    return m ? m[1] : '';
  }

  try {
    await page.goto(galleriesUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await acceptCookies(page);
    // Wait for gallery links to appear; scroll a bit to trigger lazy content
    try {
      await page.waitForSelector('a[href*="/collection/galleries/"]', { timeout: 8000 });
    } catch {}
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
      await page.waitForTimeout(400);
    }

    // Collect gallery links
    let galleryLinks = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href*="/collection/galleries/"]'));
      const links = anchors
        .map((a) => a.getAttribute('href'))
        .filter((h) => h && h !== '/collection/galleries')
        .map((h) => h.split('#')[0]);
      return Array.from(new Set(links));
    });

    // Fallback: try sitemap(s) to discover gallery pages
    if (!galleryLinks.length) {
      for (const sm of sitemapCandidates) {
        try {
          await page.goto(sm, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await page.waitForTimeout(300);
          const links = await page.evaluate(() => {
            const locs = Array.from(document.querySelectorAll('loc'));
            return locs.map((n) => n.textContent || '').filter(Boolean);
          });
          const g = links
            .filter((u) => /\/collection\/galleries\//.test(u))
            .map((u) => u.replace(/^https?:\/\/www\.britishmuseum\.org/, ''))
            .map((u) => u.split('#')[0]);
          if (g.length) {
            galleryLinks = Array.from(new Set([...(galleryLinks || []), ...g]));
          }
          // Some sitemap indexes link to other sitemaps; parse them too
          const nested = links.filter((u) => /sitemap/i.test(u));
          for (const ns of nested) {
            try {
              await page.goto(ns, { waitUntil: 'domcontentloaded', timeout: 30000 });
              await page.waitForTimeout(300);
              const links2 = await page.evaluate(() => {
                const locs = Array.from(document.querySelectorAll('loc'));
                return locs.map((n) => n.textContent || '').filter(Boolean);
              });
              const g2 = links2
                .filter((u) => /\/collection\/galleries\//.test(u))
                .map((u) => u.replace(/^https?:\/\/www\.britishmuseum\.org/, ''))
                .map((u) => u.split('#')[0]);
              if (g2.length) galleryLinks = Array.from(new Set([...(galleryLinks || []), ...g2]));
            } catch {}
          }
        } catch {}
      }
    }

    // Final fallback: use hardcoded known galleries
    if (!galleryLinks.length) {
      console.log('Using hardcoded known galleries as fallback');
      galleryLinks = knownGalleries.map(path => base + path);
    }

    console.log(`Found ${galleryLinks.length} gallery links`);
    // For debugging, limit to first 3 rooms
    galleryLinks = galleryLinks.slice(0, 3);

    const rooms = [];
    for (const href of galleryLinks) {
      const url = toAbs(href);
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await acceptCookies(page);
        await page.waitForTimeout(2000); // Wait for page to load after cookies
        console.log(`Loaded page: ${url}, title: ${await page.title()}`);
        // Try to ensure objects are rendered: wait for object links and scroll
        for (let i = 0; i < 6; i++) {
          await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
          await page.waitForTimeout(400);
        }
  try { await page.waitForSelector('a[href^="/collection/object/"]', { timeout: 5000 }); } catch {}

        const roomData = await page.evaluate(() => {
          const titleEl = document.querySelector('h1, .page-title, header h1');
          const title = (titleEl?.textContent || '').trim();
          // Collect highlighted objects on the gallery page
          const nodes = Array.from(
            document.querySelectorAll('a[href^="/collection/object/"]')
          );
          const items = nodes.map((a) => {
            const href = a.getAttribute('href') || '';
            const url = href.startsWith('http') ? href : `https://www.britishmuseum.org${href}`;
            const img = a.querySelector('img');
            const imgSrc = img?.getAttribute('src') || '';
            const imgAbs = imgSrc ? (imgSrc.startsWith('http') ? imgSrc : `https://www.britishmuseum.org${imgSrc}`) : '';
            // try to get a name from nearby headings or alt
            const alt = (img?.getAttribute('alt') || '').trim();
            const heading = a.querySelector('h3, h2, .promo__title, .teaser__title');
            const name = (heading?.textContent || alt || '').trim();
            // meta/date text if present
            const meta = Array.from(a.querySelectorAll('.date, .promo__meta, time, .teaser__meta'))
              .map((t) => t.textContent?.trim() || '')
              .filter(Boolean)
              .join(' ');
            return { url, image: imgAbs || undefined, name, meta };
          });
          return { title, items };
        });

        console.log(`Room ${url}: title="${roomData.title}", items found: ${roomData.items.length}`);

        // Skip empty rooms
        const roomTitle = roomData.title || url;
        const roomId = parseRoomId(roomTitle) || '';
        const uniqueByUrl = Object.values(
          roomData.items.reduce((acc, it) => {
            if (!it || !it.url) return acc;
            acc[it.url] = acc[it.url] || it;
            return acc;
          }, {})
        );
        // Cap to avoid massive payloads per room
        const capped = uniqueByUrl.slice(0, 80);
        const mapped = capped.map((it) => ({
          id: (it.url.split('/').pop() || it.name || Math.random().toString(36).slice(2))
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, ''),
          name: it.name || 'Object',
          artist: undefined,
          year: parseYear(it.meta),
          image: it.image,
          url: it.url
        }));

        console.log(`Room ${url}: mapped items: ${mapped.length}`);

        if (mapped.length) {
          rooms.push({
            id: roomId || roomTitle,
            title: roomTitle,
            url,
            items: mapped
          });
        }
      } catch (e) {
        // Skip this room on failure, continue
        // eslint-disable-next-line no-console
        console.warn('Failed room:', url, e?.message || e);
      }
    }

    const payload = {
      description: 'British Museum galleries — highlighted objects by room (scraped)',
      source: galleriesUrl,
      scrapedAt: new Date().toISOString(),
      rooms
    };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
    // eslint-disable-next-line no-console
    console.log(`Wrote ${outPath} with ${rooms.length} rooms.`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('British Museum galleries scrape failed:', e?.message || e);
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }
})();
