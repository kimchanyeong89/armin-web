#!/usr/bin/env node
// Playwright-based diagnostic for deployed site
const fs = require('fs');
const { chromium } = require('playwright');
(async ()=>{
  const url = process.argv[2] || 'https://armin-web.web.app';
  const out = { url, console: [], errors: [], requestsFailed: [], responses4xx: [], dom: {} };
  const browser = await chromium.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.on('console', msg => out.console.push({type: msg.type(), text: msg.text()}));
  page.on('pageerror', err => out.errors.push(String(err)));
  page.on('requestfailed', req => out.requestsFailed.push({url: req.url(), failure: req.failure()}));
  page.on('response', res => {
    const status = res.status();
    if (status >= 400) out.responses4xx.push({url: res.url(), status});
  });
  try {
    await page.goto(url, { waitUntil: 'networkidle' , timeout: 30000});
    // attempt to open exhibition modal
    const triggers = ['#open-exhibition-btn', 'button[data-open-exhibition]', '.exhibition-trigger', '.openExhibition'];
    for (const sel of triggers) {
      const el = await page.$(sel);
      if (el) { try { await el.click(); break; } catch(e){} }
    }
    await page.waitForTimeout(1500);
    const roomButtons = await page.$$eval('.exhibition-room-button, .room-button, .roomSelector button, .room-selector button', els => els.length);
    out.dom.roomButtons = roomButtons;
    // try to find artworks count in DOM
    out.dom.artworkCount = await page.$$eval('.gallery-item, .artwork-card, .artwork', els => els.length).catch(()=>null);
    const ss = '/tmp/armin_playwright.png';
    await page.screenshot({path: ss, fullPage: false});
    out.screenshot = ss;
  } catch (e) {
    out.error = String(e);
  }
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})();
