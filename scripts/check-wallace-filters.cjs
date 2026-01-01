#!/usr/bin/env node
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=room&viewType=detailList', {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  
  // 필터 구조 출력
  const filters = await page.$$eval('.filterItem', items => {
    return items.map(item => {
      const a = item.querySelector('a');
      const level = item.className.includes('filterLevel') ? item.className.match(/filterLevel(\d+)/)?.[1] : '0';
      return {
        text: a?.textContent?.trim() || '',
        level,
        visible: a?.offsetParent !== null,
      };
    });
  });
  
  console.log(JSON.stringify(filters, null, 2));
  await browser.close();
})();
