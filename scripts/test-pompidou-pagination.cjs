/**
 * Test script to understand Pompidou pagination mechanism
 */

const { chromium } = require('playwright');

async function main() {
  console.log('🔍 Testing Pompidou pagination mechanism...\n');
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto('https://www.centrepompidou.fr/en/recherche/oeuvres?secteurCollection%5B%5D=Cin%C3%A9ma&display=Grid', { 
      waitUntil: 'networkidle', 
      timeout: 60000 
    });
    await page.waitForTimeout(3000);
    
    // Cookie 배너 닫기
    try {
      await page.click('#onetrust-accept-btn-handler');
      console.log('🍪 Cookie banner dismissed');
      await page.waitForTimeout(1000);
    } catch(e) {}
    
    // 1. 페이지네이션 요소 찾기
    console.log('\n📋 Looking for pagination elements...\n');
    
    const paginationInfo = await page.evaluate(() => {
      const allButtons = [...document.querySelectorAll('button, a, [role="button"]')];
      const paginationRelated = allButtons.filter(el => {
        const text = el.textContent?.toLowerCase() || '';
        const className = el.className?.toLowerCase() || '';
        const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
        return text.includes('more') || text.includes('next') || text.includes('load') || 
               text.includes('page') || text.includes('suivant') || text.includes('charger') ||
               className.includes('pagination') || className.includes('load') ||
               ariaLabel.includes('next') || ariaLabel.includes('page');
      }).map(el => ({
        tag: el.tagName,
        text: el.textContent?.trim().substring(0, 80),
        className: (el.className || '').substring(0, 150),
        href: el.href || null,
        ariaLabel: el.getAttribute('aria-label')
      }));
      
      // 숫자 페이지네이션 찾기
      const pageNumbers = [...document.querySelectorAll('a, button, span, div')].filter(el => {
        const text = el.textContent?.trim() || '';
        return /^[0-9]+$/.test(text) && parseInt(text) > 0 && parseInt(text) < 100;
      }).slice(0, 20).map(el => ({
        tag: el.tagName,
        text: el.textContent?.trim(),
        className: (el.className || '').substring(0, 100),
        href: el.href || null
      }));
      
      return { paginationRelated, pageNumbers };
    });
    
    console.log('Pagination-related elements:', paginationInfo.paginationRelated.length);
    paginationInfo.paginationRelated.forEach((el, i) => {
      console.log(`  ${i+1}. [${el.tag}] "${el.text}" - class: ${el.className || 'none'}`);
    });
    
    console.log('\nPage number elements:', paginationInfo.pageNumbers.length);
    paginationInfo.pageNumbers.forEach((el, i) => {
      console.log(`  ${i+1}. [${el.tag}] "${el.text}" - href: ${el.href || 'none'}`);
    });
    
    // 2. 초기 링크 수 확인
    const initialLinks = await page.$$eval('a[href*="/ressources/oeuvre/"]', els => 
      [...new Set(els.map(e => e.href))].length
    );
    console.log(`\n📊 Initial artwork links: ${initialLinks}`);
    
    // 3. 스크롤 테스트
    console.log('\n📜 Testing scroll loading...\n');
    
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2500);
      
      const count = await page.$$eval('a[href*="/ressources/oeuvre/"]', els => 
        [...new Set(els.map(e => e.href))].length
      );
      console.log(`  Scroll ${i+1}: ${count} unique links`);
      
      if (count > initialLinks) {
        console.log('  ✅ Scroll loading works!');
      }
    }
    
    // 4. 최종 링크 수
    const finalLinks = await page.$$eval('a[href*="/ressources/oeuvre/"]', els => 
      [...new Set(els.map(e => e.href))].length
    );
    console.log(`\n📊 Final artwork links after scrolling: ${finalLinks}`);
    
    // 5. 페이지 HTML 구조 확인
    console.log('\n🔍 Checking for lazy loading or infinite scroll markers...');
    
    const scrollIndicators = await page.evaluate(() => {
      const body = document.body.innerHTML;
      const indicators = [];
      
      if (body.includes('infinite-scroll') || body.includes('InfiniteScroll')) indicators.push('infinite-scroll');
      if (body.includes('lazy-load') || body.includes('lazyload')) indicators.push('lazy-load');
      if (body.includes('load-more')) indicators.push('load-more');
      if (body.includes('pagination')) indicators.push('pagination');
      if (body.includes('observer') || body.includes('intersection')) indicators.push('intersection-observer');
      
      // Check for any hidden buttons or links
      const hiddenPagination = [...document.querySelectorAll('[style*="display: none"], [hidden]')].filter(el => 
        el.textContent?.toLowerCase().includes('more') || el.textContent?.toLowerCase().includes('page')
      ).length;
      
      return { indicators, hiddenPagination };
    });
    
    console.log('  Indicators found:', scrollIndicators.indicators.join(', ') || 'none');
    console.log('  Hidden pagination elements:', scrollIndicators.hiddenPagination);
    
    // 6. URL 파라미터 테스트 - 다른 형식 시도
    console.log('\n🔗 Testing different URL parameter formats...\n');
    
    const urlTests = [
      'https://www.centrepompidou.fr/en/recherche/oeuvres?secteurCollection%5B%5D=Cin%C3%A9ma&display=Grid&page=2',
      'https://www.centrepompidou.fr/en/recherche/oeuvres?secteurCollection%5B%5D=Cin%C3%A9ma&display=Grid&p=2',
      'https://www.centrepompidou.fr/en/recherche/oeuvres?secteurCollection%5B%5D=Cin%C3%A9ma&display=Grid&offset=20',
      'https://www.centrepompidou.fr/en/recherche/oeuvres?secteurCollection%5B%5D=Cin%C3%A9ma&display=Grid&start=20',
    ];
    
    for (const url of urlTests) {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
      
      const firstLink = await page.$eval('a[href*="/ressources/oeuvre/"]', el => el.href).catch(() => 'none');
      const linkCount = await page.$$eval('a[href*="/ressources/oeuvre/"]', els => els.length);
      
      const param = url.split('&').pop();
      console.log(`  ${param}: ${linkCount} links, first: ${firstLink.split('/').pop()}`);
    }
    
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
