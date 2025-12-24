/**
 * Petit Palais 페이지네이션 분석
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Paris 1900 페이지
  await page.goto('https://www.petitpalais.paris.fr/en/collections/paris-1900', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  
  // 페이지네이션 링크 확인
  const paginationInfo = await page.evaluate(() => {
    const results = {
      currentPage: '',
      pages: [],
      nextLink: '',
      allLinks: []
    };
    
    // 페이지 링크들 찾기
    document.querySelectorAll('a').forEach(a => {
      const href = a.href;
      const text = a.textContent.trim();
      
      // page 파라미터가 있는 링크
      if (href.includes('page=') || href.includes('/page/')) {
        results.pages.push({ text, href });
      }
      
      // next, 다음, suivant 등
      if (text.toLowerCase().includes('next') || text.includes('›') || text.includes('»') || text.toLowerCase().includes('suivant')) {
        results.nextLink = href;
      }
    });
    
    // 현재 페이지 정보
    const current = document.querySelector('.pager-current, .current, [aria-current="page"]');
    results.currentPage = current ? current.textContent.trim() : '';
    
    // 작품 링크 수
    document.querySelectorAll('a[href*="/oeuvre/"]').forEach(a => {
      if (!results.allLinks.includes(a.href)) results.allLinks.push(a.href);
    });
    
    return results;
  });
  
  console.log('현재 페이지:', paginationInfo.currentPage);
  console.log('작품 수:', paginationInfo.allLinks.length);
  console.log('\n페이지네이션 링크:');
  paginationInfo.pages.slice(0, 10).forEach(p => console.log('  ' + p.text + ' -> ' + p.href));
  console.log('\n다음 페이지:', paginationInfo.nextLink);
  
  await browser.close();
})();
