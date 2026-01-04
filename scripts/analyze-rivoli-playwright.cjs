/**
 * Analyze Rivoli Load More with Playwright
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('Loading page...');
  await page.goto('https://www.castellodirivoli.org/en/collections/', { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(3000);
  
  let clickCount = 0;
  while (clickCount < 30) {
    const urlCount = await page.evaluate(() => {
      return new Set(Array.from(document.querySelectorAll('a[href*="/opera/"]')).map(l => l.href)).size;
    });
    console.log(`Click ${clickCount} - URLs: ${urlCount}`);
    
    // Load More 버튼 클릭
    const btn = await page.$('a.btn-loadmore');
    if (!btn) {
      console.log('No more button found');
      break;
    }
    
    const isVisible = await btn.isVisible();
    if (!isVisible) {
      console.log('Button not visible');
      break;
    }
    
    await btn.click();
    await page.waitForTimeout(2500);
    clickCount++;
  }
  
  // 최종 URL 수집
  const urls = await page.evaluate(() => {
    return Array.from(new Set(Array.from(document.querySelectorAll('a[href*="/opera/"]')).map(l => l.href)));
  });
  console.log('\nFinal total URLs:', urls.length);
  
  await browser.close();
})();
