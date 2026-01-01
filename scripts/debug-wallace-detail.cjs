#!/usr/bin/env node
const { chromium } = require('playwright');
const fs = require('fs');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();
  
  console.log('세션 초기화...');
  await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await new Promise(r => setTimeout(r, 3000));
  
  console.log('상세 페이지...');
  await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=collection&objectId=61177&viewType=detailView', {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await new Promise(r => setTimeout(r, 3000));
  
  const details = await page.evaluate(() => {
    const data = {};
    document.querySelectorAll('dt').forEach(dt => {
      const dd = dt.nextElementSibling;
      if (dd && dd.tagName === 'DD') {
        data[dt.textContent?.trim()] = dd.textContent?.trim();
      }
    });
    return {
      title: document.querySelector('h1, .title')?.textContent?.trim(),
      fields: data,
      pageText: document.body.innerText.substring(0, 2000),
    };
  });
  
  console.log('\n=== 추출된 데이터 ===');
  console.log(JSON.stringify(details, null, 2));
  
  const html = await page.content();
  fs.writeFileSync('/tmp/wallace-detail.html', html);
  console.log('\nHTML: /tmp/wallace-detail.html');
  
  await browser.close();
}
main().catch(console.error);
