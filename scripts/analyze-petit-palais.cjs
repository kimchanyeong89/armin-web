/**
 * Petit Palais Paris 1900 페이지 분석
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Paris 1900 페이지 확인
  await page.goto('https://www.petitpalais.paris.fr/en/collections/paris-1900', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  
  // 페이지 맨 아래까지 스크롤
  for (let i = 0; i < 30; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
  }
  
  // 모든 작품 링크 수집
  const links = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll('a').forEach(a => {
      if (a.href && a.href.includes('/oeuvre/')) {
        const exists = results.find(r => r === a.href);
        if (!exists) results.push(a.href);
      }
    });
    return results;
  });
  
  console.log('Paris 1900 작품 수:', links.length);
  console.log('처음 5개:', links.slice(0, 5));
  
  // 페이지네이션/더보기 확인
  const html = await page.content();
  if (html.includes('pager') || html.includes('pagination')) {
    console.log('\n페이지네이션 있음');
  }
  if (html.includes('load-more') || html.includes('voir plus') || html.includes('see more')) {
    console.log('더보기 버튼 있음');
  }
  
  // 총 작품 수 텍스트 확인
  const countText = await page.evaluate(() => {
    const text = document.body.innerText;
    const match = text.match(/(\d+)\s*(works?|oeuvres?|items?)/i);
    return match ? match[0] : 'Not found';
  });
  console.log('\n총 작품 수 텍스트:', countText);
  
  await browser.close();
})();
