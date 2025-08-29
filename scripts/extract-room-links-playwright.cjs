#!/usr/bin/env node
/**
 * Extract painting links from a National Gallery room page using Playwright (handles cookie banner).
 * Usage:
 *   node scripts/extract-room-links-playwright.cjs <roomUrl> <outSeedJson>
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOM_URL = process.argv[2];
const OUT_JSON = process.argv[3] || path.join('scripts', 'seed', 'ng-room-seed.json');
if (!ROOM_URL) {
  console.error('Usage: node scripts/extract-room-links-playwright.cjs <roomUrl> <outSeedJson>');
  process.exit(1);
}

function unique(arr) { return Array.from(new Set(arr)); }

async function acceptCookies(page) {
  const selectors = [
    'button:has-text("Accept all cookies")',
    'button[aria-label="Accept all cookies"]',
    'button:has-text("Accept")',
    'button:has-text("Allow all")',
    '#onetrust-accept-btn-handler'
  ];
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel);
      if (await loc.count()) { await loc.first().click({ timeout: 1000 }); await page.waitForTimeout(300); return; }
    } catch {}
  }
}

async function collectLinks(page) {
  const urls = await page.$$eval('a[href*="/paintings/"]', (anchors) => {
    const blocklist = /(search-the-collection|must-sees|latest-arrivals|picture-of-the-month|residency-programmes)\b/i;
    const out = anchors
      .map(a => a.getAttribute('href') || '')
      .filter(h => h && h.includes('/paintings/'))
      .filter(h => !blocklist.test(h))
      .map(h => (h.startsWith('http') ? h : new URL(h, location.href).toString()));
    return Array.from(new Set(out));
  });
  return urls;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(ROOM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await acceptCookies(page).catch(() => {});
  await page.waitForTimeout(500);
  let links = await collectLinks(page);
  if (!links.length) {
    const ampUrl = ROOM_URL.includes('?') ? `${ROOM_URL}&amp` : `${ROOM_URL}?amp`;
    await page.goto(ampUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(500);
    await acceptCookies(page).catch(() => {});
    links = await collectLinks(page);
  }
  await browser.close();

  const m = ROOM_URL.match(/room-(\d+)/i);
  const roomId = m ? m[1] : '';
  const payload = { room: roomId, source: ROOM_URL, items: unique(links) };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${OUT_JSON} with ${payload.items.length} links`);
})();
