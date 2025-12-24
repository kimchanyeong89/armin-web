const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://www.marmottan.fr/en/collections/highlights/', { waitUntil: 'networkidle' });
  
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
  }
  
  const items = await page.evaluate(() => {
    const results = [];
    const anchors = document.querySelectorAll('a[href*="/notice/"]');
    anchors.forEach((a, idx) => {
      const match = a.href.match(/\/notice\/([^\/]+)$/);
      const img = a.querySelector('img');
      const imgSrc = img?.src || '';
      
      results.push({
        id: match ? match[1] : 'none',
        hasImage: !!imgSrc && !imgSrc.includes('placeholder') && !imgSrc.includes('data:image'),
        imgSrc: imgSrc.substring(0, 80)
      });
    });
    return results;
  });
  
  const withImage = items.filter(i => i.hasImage);
  const withoutImage = items.filter(i => !i.hasImage);
  
  console.log('이미지 있는 항목:', withImage.length);
  console.log('이미지 없는 항목:', withoutImage.length);
  console.log('\n이미지 없는 항목 예시 (처음 5개):');
  console.log(JSON.stringify(withoutImage.slice(0, 5), null, 2));
  
  await browser.close();
})();
