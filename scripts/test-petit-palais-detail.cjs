/**
 * Petit Palais 페이지 구조 분석
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://www.petitpalais.paris.fr/en/oeuvre/courbet-black-dog', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 작가 정보 추출 테스트
  const info = await page.evaluate(() => {
    // p.author 직접 확인
    const authorEl = document.querySelector('p.author');
    const authorDirect = authorEl ? authorEl.textContent.trim() : 'NOT FOUND';
    
    // 클래스로 검색
    const authorByClass = document.querySelector('.author');
    const authorClass = authorByClass ? authorByClass.textContent.trim() : 'NOT FOUND';
    
    // 모든 p 태그 중 작가 관련
    let authorFromP = 'NOT FOUND';
    document.querySelectorAll('p').forEach(p => {
      if (p.className === 'author') {
        authorFromP = p.textContent.trim();
      }
    });
    
    return { authorDirect, authorClass, authorFromP };
  });
  
  console.log(JSON.stringify(info, null, 2));
  
  await browser.close();
})();
