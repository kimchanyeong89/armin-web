#!/usr/bin/env node
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';

puppeteer.use(StealthPlugin());

const WHATSON_URL = 'https://www.tate.org.uk/whats-on?date_range=from_now&gallery_group=tate-modern';

function toYMD(input) {
  if (!input) return '';
  // Expect formats like '1 Sep 2025 – 12 Jan 2026' or 'Until 5 Jan 2026'
  const months = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };
  const parts = String(input).toLowerCase().replace(/\u2013|\u2014|—|–/g, '-');
  const re = /(?:(\d{1,2})\s+([a-z]{3,})\s+(\d{4}))\s*(?:-|to|until|–|—)?\s*(?:(\d{1,2})\s+([a-z]{3,})\s+(\d{4}))?/i;
  const m = parts.match(re);
  if (!m) return '';
  const d1 = `${m[3]}-${months[m[2].slice(0,3)]||''}-${String(m[1]).padStart(2,'0')}`;
  if (m[4] && m[5] && m[6]) {
    const d2 = `${m[6]}-${months[m[5].slice(0,3)]||''}-${String(m[4]).padStart(2,'0')}`;
    return `${d1}__${d2}`;
  }
  return `${d1}__`;
}

async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
  await page.goto(WHATSON_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Some content may lazy-load, try a small scroll and wait
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight/3));
  await page.waitForTimeout(1500);

  const items = await page.evaluate(() => {
    const results = [];
    // Look for cards/teasers
    const cards = Array.from(document.querySelectorAll('[class*="whats-on" i] article, .teaser, .whats-on__item, [data-component="teaser"]'));
    const uniq = new Set();
    for (const el of cards) {
      const a = el.querySelector('a[href*="/whats-on/"]') || el.querySelector('a[href]');
      const href = a ? (a.getAttribute('href') || '').trim() : '';
      let title = (el.querySelector('h3, h2, .teaser__title')?.textContent || '').trim();
      if (!title && a) title = (a.textContent || '').trim();
      const dateText = (el.querySelector('[class*="date" i]')?.textContent || '').replace(/\s+/g,' ').trim();
      // Prefer <img> currentSrc or data-src
      const imgEl = el.querySelector('img');
      const img = imgEl ? (imgEl.currentSrc || imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '').trim() : '';
      if (!href || !title) continue;
      const key = href + '|' + title;
      if (uniq.has(key)) continue;
      uniq.add(key);
      results.push({ href, title, dateText, img });
    }
    return results;
  });

  // Visit each detail page for better dates and og:image
  const enriched = [];
  for (const it of items.slice(0, 30)) {
    const url = it.href.startsWith('http') ? it.href : `https://www.tate.org.uk${it.href}`;
    try {
      const p = await browser.newPage();
      await p.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await p.waitForTimeout(500);
      const detail = await p.evaluate(() => {
        const og = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
        const title = document.querySelector('h1')?.textContent?.trim() || '';
        const date = (document.querySelector('[class*="date" i]')?.textContent || '').replace(/\s+/g,' ').trim();
        return { og, title, date };
      });
      await p.close();
      const ymd = toYMD(detail.date || it.dateText || '');
      const [startDate, endDate] = ymd.split('__');
      enriched.push({
        title: detail.title || it.title,
        url,
        startDate: startDate || '',
        endDate: endDate || '',
        imageUrl: detail.og || it.img || '',
      });
    } catch (e) {
      const ymd = toYMD(it.dateText || '');
      const [startDate, endDate] = ymd.split('__');
      enriched.push({ title: it.title, url, startDate, endDate, imageUrl: it.img || '' });
    }
  }

  await browser.close();

  const outDir = path.join(process.cwd(), 'src', 'data');
  const outFile = path.join(outDir, 'tate-modern.json');
  fs.writeFileSync(outFile, JSON.stringify({ scrapedAt: new Date().toISOString(), items: enriched }, null, 2));
  console.log(`Saved ${enriched.length} items -> ${path.relative(process.cwd(), outFile)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
