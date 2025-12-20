#!/usr/bin/env node
// Fallback Playwright scraper to bypass 403 and render client-side content.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const outPath = path.join(process.cwd(), 'public', 'data', 'british-museum.json');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  });
  try {
    await page.goto('https://www.britishmuseum.org/exhibitions', { waitUntil: 'domcontentloaded', timeout: 60000 });
    // Give any client scripts time to render
    await page.waitForTimeout(1500);

    const data = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('.promo, .teaser, article, li'));
      const items = nodes.map((el) => {
        const name = (el.querySelector('h3, h2, .promo__title')?.textContent || '').trim();
        const a = el.querySelector('a');
        const href = a && a.getAttribute('href');
        const url = href ? (href.startsWith('http') ? href : `https://www.britishmuseum.org${href}`) : '';
        const img = el.querySelector('img')?.getAttribute('src') || '';
        const dateText = Array.from(el.querySelectorAll('.date, .promo__meta, time')).map(t => t.textContent?.trim() || '').join(' ');
        const m = dateText.match(/(\d{1,2}\s\w+\s\d{4})/g) || [];
        const toIso = (s) => {
          try { return new Date(s).toISOString().slice(0,10); } catch { return ''; }
        };
        return {
          id: (name || url || Math.random().toString(36).slice(2)).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''),
          name: name || 'Exhibition',
          title: name || 'Exhibition',
          description: '',
          startDate: m[0] ? toIso(m[0]) : '',
          endDate: m[1] ? toIso(m[1]) : '',
          image: img && (img.startsWith('http') ? img : `https://www.britishmuseum.org${img}`),
          url
        };
      }).filter(it => it.name && it.url && /exhibition|display|event/i.test(it.url));
      const dedup = Object.values(items.reduce((acc, it) => { acc[it.url] = acc[it.url] || it; return acc; }, {}));
      return { description: 'British Museum exhibitions (rendered)', items: dedup.slice(0, 24), past: [] };
    });

    fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
    console.log(`Wrote ${outPath} with ${data.items.length} items.`);
  } catch (e) {
    console.error('Playwright scrape failed:', e.message || e);
  } finally {
    await page.close();
    await browser.close();
  }
})();
