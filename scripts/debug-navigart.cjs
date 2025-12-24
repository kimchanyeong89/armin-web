const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('Loading page...');
  await page.goto('https://www.navigart.fr/mamcs/artworks/tree_domain_all/Peinture/checkbox:withimage/Avec%20image?page=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
  // 작품 로딩 대기
  await page.waitForSelector('.art-items img', { timeout: 30000 }).catch(() => console.log('No images found'));
  await page.waitForTimeout(3000);
  
  // art-items 내부 구조 분석
  const items = await page.evaluate(() => {
    const results = [];
    const container = document.querySelector('.art-items');
    if (!container) return { error: 'No art-items container' };
    
    // 직접 자식 확인
    const pageDiv = container.querySelector('.page');
    if (pageDiv) {
      const allChildren = pageDiv.children;
      for (let i = 0; i < Math.min(5, allChildren.length); i++) {
        const child = allChildren[i];
        results.push({
          tagName: child.tagName,
          className: child.className,
          innerHTML: child.innerHTML.slice(0, 800)
        });
      }
    }
    
    return results;
  });
  
  console.log('Items found:', JSON.stringify(items, null, 2));
  
  // 총 개수 확인
  const total = await page.evaluate(() => {
    const el = document.querySelector('.total');
    return el ? el.textContent : 'not found';
  });
  console.log('\nTotal artworks:', total);
  
  // 필터된 개수
  const filtered = await page.evaluate(() => {
    const el = document.querySelector('.filtered b');
    return el ? el.textContent : 'not found';
  });
  console.log('Filtered:', filtered);
  
  await browser.close();
})();
