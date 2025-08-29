#!/usr/bin/env node
// Load the deployed site and capture console logs, network errors, and DOM counts for Exhibition modal
const fs = require('fs');
const puppeteer = require('puppeteer');
(async ()=>{
  const url = process.argv[2] || 'https://armin-web.web.app';
  const out = { url, console: [], errors: [], requests: [], dom: {} };
  const browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.on('console', msg => out.console.push({type: msg.type(), text: msg.text()}));
  page.on('pageerror', err => out.errors.push(String(err)));
  page.on('requestfailed', req => out.requests.push({url: req.url(), failure: req.failure()}));
  page.on('response', res => {
    const status = res.status();
    if (status >= 400) out.requests.push({url: res.url(), status});
  });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  // open exhibition modal by clicking a trigger if available
  try {
    await page.waitForSelector('#open-exhibition-btn,button[data-open-exhibition],.exhibition-trigger', { timeout: 3000 });
    await page.click('#open-exhibition-btn,button[data-open-exhibition],.exhibition-trigger').catch(()=>{});
  } catch(e) {
    // fallback: try to open modal via keyboard or inspect DOM
  }
  // wait for modal
  await page.waitForTimeout(1500);
  // count room buttons
  const roomCount = await page.evaluate(()=>{
    const buttons = Array.from(document.querySelectorAll('.exhibition-room-button, .room-button, .roomSelector button'));
    return buttons.length;
  });
  out.dom.roomButtons = roomCount;
  // screenshot for quick manual inspection
  const ss = '/tmp/armin_live_screenshot.png';
  await page.screenshot({path:ss, fullPage: false});
  out.screenshot = ss;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})();
