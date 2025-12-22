/**
 * Musée d'Orsay Collection Scraper - Debug/Structure Analysis
 * 
 * 1단계: 페이지 구조 파악
 * - 그리드 아이템 선택자
 * - 이미지 URL 패턴
 * - 메타데이터 위치 (제목, 작가, 연도 등)
 * - 페이지네이션 방식
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.musee-orsay.fr';
const SEARCH_URL = 'https://www.musee-orsay.fr/en/collections/search?search=&domain_kind_checkboxes%5B276575%5D=276575&sort_by=search_api_relevance&items_per_page=15&search_type=simple_search&display_type=grid';

async function analyzePageStructure() {
  console.log('🔍 Starting Musée d\'Orsay page structure analysis...\n');
  
  const browser = await chromium.launch({ 
    headless: false,  // 브라우저 보이게 (디버깅용)
    slowMo: 100 
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  try {
    console.log('📄 Loading search page...');
    await page.goto(SEARCH_URL, { waitUntil: 'networkidle', timeout: 60000 });
    
    // 쿠키 배너 닫기 (있으면)
    try {
      const cookieBtn = await page.$('button[id*="cookie"], button[class*="cookie"], .cookie-accept, #onetrust-accept-btn-handler');
      if (cookieBtn) {
        await cookieBtn.click();
        console.log('🍪 Cookie banner dismissed');
        await page.waitForTimeout(1000);
      }
    } catch (e) {}
    
    // 페이지 로드 대기
    await page.waitForTimeout(3000);
    
    // 스크린샷 저장
    const screenshotPath = path.join(__dirname, '../downloads/orsay-debug-screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Screenshot saved: ${screenshotPath}`);
    
    // HTML 저장
    const htmlPath = path.join(__dirname, '../downloads/orsay-debug.html');
    const html = await page.content();
    fs.writeFileSync(htmlPath, html);
    console.log(`📝 HTML saved: ${htmlPath}`);
    
    // 페이지 구조 분석
    console.log('\n🔬 Analyzing page structure...\n');
    
    // 가능한 그리드 아이템 선택자들
    const selectors = [
      '.view-content .views-row',
      '.collection-grid-item',
      '.artwork-item',
      '.search-result-item',
      '.card',
      'article',
      '[class*="result"]',
      '[class*="artwork"]',
      '[class*="item"]',
      '.grid > div',
      '.grid-item'
    ];
    
    for (const sel of selectors) {
      const count = await page.locator(sel).count();
      if (count > 0) {
        console.log(`✅ "${sel}" → ${count} items found`);
      }
    }
    
    // 이미지 찾기
    console.log('\n🖼️ Looking for images...');
    const images = await page.$$eval('img', imgs => 
      imgs.map(img => ({
        src: img.src,
        alt: img.alt,
        class: img.className
      })).filter(img => img.src && !img.src.includes('logo') && !img.src.includes('icon'))
    );
    
    console.log(`Found ${images.length} relevant images`);
    if (images.length > 0) {
      console.log('Sample images:');
      images.slice(0, 5).forEach((img, i) => {
        console.log(`  ${i + 1}. ${img.src.substring(0, 100)}...`);
        console.log(`     alt: ${img.alt}`);
      });
    }
    
    // 링크 찾기 (개별 작품 페이지)
    console.log('\n🔗 Looking for artwork links...');
    const links = await page.$$eval('a[href*="/artworks/"], a[href*="/oeuvres/"], a[href*="/collections/"]', as =>
      as.map(a => ({
        href: a.href,
        text: a.innerText?.trim().substring(0, 50)
      }))
    );
    
    console.log(`Found ${links.length} potential artwork links`);
    if (links.length > 0) {
      console.log('Sample links:');
      links.slice(0, 5).forEach((link, i) => {
        console.log(`  ${i + 1}. ${link.href}`);
        console.log(`     text: ${link.text}`);
      });
    }
    
    // 텍스트 내용 분석
    console.log('\n📝 Looking for text content...');
    const textBlocks = await page.$$eval('h2, h3, h4, .title, [class*="title"], [class*="artist"]', els =>
      els.map(el => ({
        tag: el.tagName,
        class: el.className,
        text: el.innerText?.trim().substring(0, 100)
      })).filter(el => el.text && el.text.length > 0)
    );
    
    console.log(`Found ${textBlocks.length} text blocks`);
    textBlocks.slice(0, 10).forEach((block, i) => {
      console.log(`  ${i + 1}. <${block.tag} class="${block.class}">`);
      console.log(`     "${block.text}"`);
    });
    
    // 페이지네이션 찾기
    console.log('\n📄 Looking for pagination...');
    const pagination = await page.$$eval('.pager, .pagination, [class*="pager"], nav[aria-label*="pagination"]', els =>
      els.map(el => ({
        class: el.className,
        html: el.outerHTML.substring(0, 200)
      }))
    );
    
    if (pagination.length > 0) {
      console.log('Pagination found:');
      pagination.forEach((p, i) => {
        console.log(`  ${i + 1}. class="${p.class}"`);
      });
    }
    
    // 총 결과 수 찾기
    const resultsCount = await page.$eval('body', body => {
      const text = body.innerText;
      const match = text.match(/(\d+)\s*(results?|résultats?|works?|œuvres?)/i);
      return match ? match[0] : null;
    }).catch(() => null);
    
    if (resultsCount) {
      console.log(`\n📊 Total results indicator: "${resultsCount}"`);
    }
    
    console.log('\n✅ Debug analysis complete!');
    console.log('Check the screenshot and HTML file for more details.');
    
    // 브라우저 열어둠 (수동 확인용)
    console.log('\n⏳ Browser will stay open for 30 seconds for manual inspection...');
    await page.waitForTimeout(30000);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
}

analyzePageStructure().catch(console.error);
