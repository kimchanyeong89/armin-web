#!/usr/bin/env node
/**
 * Puppeteer Extra + Stealth fallback scraper for British Museum galleries.
 * Output: public/data/british-m    // If still empty, try site search pages
    if (!galleryLinks.length) {
      console.warn('No gallery links from index; trying fallback search pages');
      const fallback = [
        `${base}/search?keyword=galleries`,
        `${base}/search?keyword=room`
      ];
      for (const u of fallback) {
        try {
          await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await tryConsent(page);
          await new Promise(r=>setTimeout(r,600));
          const links = await page.$$eval('a[href*="/collection/galleries/"]', as =>
            Array.from(new Set(as.map(a=>a.getAttribute('href')).filter(Boolean)))
          );
          if (links?.length) galleryLinks = Array.from(new Set([...(galleryLinks||[]), ...links]));
        } catch {}
      }
    }

    // Final fallback: use hardcoded known galleries
    if (!galleryLinks.length) {
      console.log('Using hardcoded known galleries as fallback');
      galleryLinks = knownGalleries.map(path => base + path);
    }n
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

(async () => {
  const outPath = path.join(process.cwd(), 'public', 'data', 'british-museum-galleries.json');
  const base = 'https://www.britishmuseum.org';
  const galleriesUrl = `${base}/collection/galleries`;
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

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
    defaultViewport: { width: 1360, height: 900 }
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');

  async function tryConsent(p) {
    try {
      const sels = [
        'button:has-text("Allow all cookies")',
        'button:has-text("Accept all cookies")',
        '#onetrust-accept-btn-handler'
      ];
      for (const sel of sels) {
        const el = await p.$(sel);
        if (el) { await el.click().catch(()=>{}); await new Promise(r=>setTimeout(r,300)); break; }
      }
      // iframes too
      for (const f of p.frames()) {
        try {
          const btn = await f.$('#onetrust-accept-btn-handler');
          if (btn) { await btn.click().catch(()=>{}); await new Promise(r=>setTimeout(r,300)); break; }
        } catch {}
      }
    } catch {}
  }

  function parseRoomId(title) {
    if (!title) return '';
    const m = title.match(/Room\s+(\d+[A-Z]?)/i);
    return m ? m[1] : '';
  }
  const parseYear = (s) => { const m = String(s||'').match(/(\d{3,4})/); return m ? parseInt(m[1],10) : 0; };

  try {
    await page.goto(galleriesUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await tryConsent(page);
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    // allow hydration
    for (let i=0;i<8;i++){ await page.evaluate(()=>window.scrollBy(0,document.body.scrollHeight)); await new Promise(r=>setTimeout(r,400)); }
    let galleryLinks = await page.$$eval('a[href*="/collection/galleries/"]', as =>
      Array.from(new Set(as.map(a=>a.getAttribute('href')).filter(h=>h && h!=='/collection/galleries').map(h=>h.split('#')[0])))
    );

    // If still empty, use hardcoded known galleries
    if (!galleryLinks.length) {
      console.log('Using hardcoded known galleries as fallback');
      galleryLinks = knownGalleries.map(path => base + path);
    }

    // If still empty, try site search pages
    if (!galleryLinks.length) {
      console.warn('No gallery links from index; trying fallback search pages');
      const fallback = [
        `${base}/search?keyword=galleries`,
        `${base}/search?keyword=room`
      ];
      for (const u of fallback) {
        try {
          await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await tryConsent(page);
          await new Promise(r=>setTimeout(r,600));
          const links = await page.$$eval('a[href*="/collection/galleries/"]', as =>
            Array.from(new Set(as.map(a=>a.getAttribute('href')).filter(Boolean)))
          );
          if (links?.length) galleryLinks = Array.from(new Set([...(galleryLinks||[]), ...links]));
        } catch {}
      }
    }

    const rooms = [];
    for (const href of galleryLinks) {
      const url = href.startsWith('http') ? href : `${base}${href}`;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await tryConsent(page);
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
        for (let i=0;i<6;i++){ await page.evaluate(()=>window.scrollBy(0,document.body.scrollHeight)); await new Promise(r=>setTimeout(r,400)); }
        const room = await page.evaluate(() => {
          const titleEl = document.querySelector('h1, .page-title, header h1');
          const title = (titleEl?.textContent || '').trim();
          const nodes = Array.from(document.querySelectorAll('a[href^="/collection/object/"]'));
          const items = nodes.map(a => {
            const href = a.getAttribute('href')||'';
            const url = href.startsWith('http') ? href : `https://www.britishmuseum.org${href}`;
            const img = a.querySelector('img');
            const src = img?.getAttribute('src')||'';
            const image = src ? (src.startsWith('http')?src:`https://www.britishmuseum.org${src}`) : '';
            const name = (a.querySelector('h3, h2, .promo__title, .teaser__title')?.textContent || img?.getAttribute('alt') || '').trim();
            const meta = Array.from(a.querySelectorAll('.date, .promo__meta, time, .teaser__meta')).map(t=>t.textContent?.trim()||'').filter(Boolean).join(' ');
            return { url, image, name, meta };
          });
          return { title, items };
        });
        console.log(`Room ${url}: title="${room.title}", items found: ${room.items.length}`);
        const roomId = parseRoomId(room.title) || room.title;
        const uniq = Object.values((room.items||[]).reduce((acc,it)=>{ if(!it||!it.url) return acc; acc[it.url]=acc[it.url]||it; return acc; },{}));
        const mapped = uniq.slice(0,80).map(it => ({
          id: (it.url.split('/').pop() || it.name || Math.random().toString(36).slice(2)).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''),
          name: it.name || 'Object',
          artist: '',
          year: parseYear(it.meta),
          image: it.image || undefined,
          url: it.url
        }));
        if (mapped.length) rooms.push({ id: roomId, title: room.title, url, items: mapped });
      } catch (e) {
        console.warn('Room failed', url, e?.message||e);
      }
    }

    const payload = {
      description: 'British Museum galleries — highlighted objects by room (scraped, puppeteer) ',
      source: galleriesUrl,
      scrapedAt: new Date().toISOString(),
      rooms
    };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
    console.log(`Wrote ${outPath} with ${rooms.length} rooms.`);
  } catch (e) {
    console.error('BM galleries puppeteer failed:', e?.message||e);
  } finally {
    await page.close();
    await browser.close();
  }
})();
