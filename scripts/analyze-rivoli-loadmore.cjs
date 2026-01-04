/**
 * Analyze Rivoli Load More
 */
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  await page.goto('https://www.castellodirivoli.org/en/collections/', { waitUntil: 'networkidle2', timeout: 120000 });
  await new Promise(r => setTimeout(r, 3000));
  
  let clickCount = 0;
  while (clickCount < 30) {
    const urlCount = await page.evaluate(() => {
      return new Set(Array.from(document.querySelectorAll('a[href*="/opera/"]')).map(l => l.href)).size;
    });
    console.log(`Click ${clickCount} - URLs: ${urlCount}`);
    
    // Load More 버튼 클릭
    const clicked = await page.evaluate(() => {
      const btn = document.querySelector('a.btn-loadmore');
      if (btn && btn.offsetParent !== null) {
        btn.click();
        return true;
      }
      return false;
    });
    
    if (!clicked) {
      console.log('No more button to click');
      break;
    }
    
    await new Promise(r => setTimeout(r, 2500));
    clickCount++;
  }
  
  // 최종 URL 수집
  const urls = await page.evaluate(() => {
    return Array.from(new Set(Array.from(document.querySelectorAll('a[href*="/opera/"]')).map(l => l.href)));
  });
  console.log('\nFinal total URLs:', urls.length);
  
  await browser.close();
})();
