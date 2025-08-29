#!/usr/bin/env node
/**
 * Extracts painting links from a National Gallery room page using Puppeteer (handles cookie banner).
 * Usage:
 *   node scripts/extract-room-links-puppeteer.cjs <roomUrl> <outSeedJson>
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const ROOM_URL = process.argv[2];
const OUT_JSON = process.argv[3] || path.join('scripts', 'seed', 'ng-room-seed.json');
if (!ROOM_URL) {
  console.error('Usage: node scripts/extract-room-links-puppeteer.cjs <roomUrl> <outSeedJson>');
  process.exit(1);
}

function unique(arr) { return Array.from(new Set(arr)); }

async function acceptCookies(page) {
  try {
    // Try common cookie accept buttons
    const candidates = [
      'button:has-text("Accept all cookies")',
      'button[aria-label="Accept all cookies"]',
      'button:has-text("Accept")',
      'button:has-text("Allow all")',
      '#onetrust-accept-btn-handler',
    ];
    for (const sel of candidates) {
      const btn = await page.$(sel).catch(() => null);
      if (btn) { await btn.click({ delay: 10 }).catch(() => {}); await page.waitForTimeout(400); return; }
    }
    // Fallback: query all buttons and click the first "Accept" text
    const clicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find(b => /accept/i.test(b.textContent || ''));
      if (target) { target.click(); return true; }
      return false;
    });
    if (clicked) await page.waitForTimeout(400);
  } catch {}
}

async function extractLinks(page) {
  // Try main page first
  const collect = async () => {
    return await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href*="/paintings/"]'));
      const blocklist = /(search-the-collection|must-sees|latest-arrivals|picture-of-the-month|residency-programmes)\b/i;
      const urls = anchors
        .map(a => a.getAttribute('href') || '')
        .filter(h => h && h.includes('/paintings/'))
        .filter(h => !blocklist.test(h))
        .map(h => (h.startsWith('http') ? h : new URL(h, location.href).toString()));
      return Array.from(new Set(urls));
    });
  };
  let links = await collect();
  if (links.length) return links;
  // Fallback: go to AMP variant
  const ampUrl = ROOM_URL.includes('?') ? `${ROOM_URL}&amp` : `${ROOM_URL}?amp`;
  await page.goto(ampUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(600);
  await acceptCookies(page);
  links = await collect();
  return links;
}

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36');
  await page.goto(ROOM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(800);
  await acceptCookies(page);
  // Give some time for dynamic content
  await page.waitForTimeout(800);
  const links = unique(await extractLinks(page));
  await browser.close();

  const m = ROOM_URL.match(/room-(\d+)/i);
  const roomId = m ? m[1] : '';
  const payload = { room: roomId, source: ROOM_URL, items: links };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${OUT_JSON} with ${links.length} links`);
})();
