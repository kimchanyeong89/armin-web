#!/usr/bin/env node
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://images.grandpalaisrmn.fr/ark:/36255/25-01834174');
  await new Promise(r => setTimeout(r, 2000));
  
  // Check all h1s
  const h1s = await page.$$eval('h1', els => els.map(e => e.textContent.trim()));
  console.log('H1s:', h1s);
  
  // Check for title in og:title meta
  const ogTitle = await page.$eval('meta[property="og:title"]', el => el.content).catch(() => null);
  console.log('OG Title:', ogTitle);
  
  // Check page title
  const title = await page.title();
  console.log('Page Title:', title);
  
  // Check for previewmeta with title
  const previewMetas = await page.$$eval('.previewmeta', metas => 
    metas.map(m => ({
      legend: m.querySelector('.previewmeta-legend')?.textContent?.trim(),
      value: m.querySelector('.previewmeta-content')?.textContent?.trim()?.substring(0, 100)
    }))
  );
  console.log('Preview Metas:', JSON.stringify(previewMetas.slice(0, 10), null, 2));
  
  await browser.close();
})();
