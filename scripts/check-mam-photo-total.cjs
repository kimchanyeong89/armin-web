const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('페이지 로딩 중...');
  await page.goto('https://www.navigart.fr/mam/artworks?filters=domain%3APhotographie', { waitUntil: 'domcontentloaded', timeout: 60000 });
  
  console.log('결과 대기 중...');
  await page.waitForSelector('.navigart-item', { timeout: 30000 });
  await page.waitForTimeout(2000);
  
  // 총 작품 수 찾기
  const html = await page.content();
  const match = html.match(/(\d[\d\s]*)\s*résultats?/i);
  if (match) {
    console.log('총 작품 수:', match[1].replace(/\s/g, ''));
  }
  
  // 페이지네이션 버튼들 확인
  const pageNums = await page.$$eval('.navigart-pagination button', btns => 
    btns.map(b => parseInt(b.textContent)).filter(n => n > 0)
  );
  const maxPage = Math.max(...pageNums, 1);
  console.log('총 페이지:', maxPage);
  console.log('예상 작품:', maxPage * 15);
  
  await browser.close();
})();
