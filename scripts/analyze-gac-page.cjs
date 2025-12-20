/**
 * Google Arts & Culture 페이지 구조 분석
 */
const { chromium } = require('playwright');

async function analyze() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Movement in Squares by Bridget Riley
  await page.goto('https://artsandculture.google.com/asset/movement-in-squares/5gGo7raKbm-NtQ', {
    waitUntil: 'networkidle',
    timeout: 30000
  });
  
  await page.waitForTimeout(2000);
  
  // 페이지 HTML 분석
  const info = await page.evaluate(() => {
    const result = {};
    
    // 제목 (h1)
    const h1 = document.querySelector('h1');
    result.title = h1 ? h1.textContent.trim() : null;
    
    // 모든 링크 중 /entity/ 포함하는 것들
    const entityLinks = Array.from(document.querySelectorAll('a[href*="/entity/"]'));
    result.entityLinks = entityLinks.map(a => ({
      text: a.textContent.trim(),
      href: a.href
    }));
    
    // aria-label="Creator" 또는 data-* 속성 찾기
    const creatorEl = document.querySelector('[aria-label*="Creator"]') ||
                      document.querySelector('[data-type="creator"]');
    result.creator = creatorEl ? creatorEl.textContent.trim() : null;
    
    // 메타데이터 섹션 찾기
    const allText = document.body.innerText;
    
    // "Creator:" 또는 "Artist:" 뒤에 오는 텍스트 찾기
    const creatorMatch = allText.match(/(?:Creator|Artist)[:\s]+([^\n]+)/i);
    result.creatorFromText = creatorMatch ? creatorMatch[1].trim() : null;
    
    // 모든 텍스트 중 이름처럼 보이는 것
    const namePattern = /^[A-Z][a-z]+ [A-Z][a-z]+$/;
    
    // dl/dt/dd 구조 찾기
    const dtElements = document.querySelectorAll('dt');
    result.metadata = {};
    dtElements.forEach(dt => {
      const dd = dt.nextElementSibling;
      if (dd && dd.tagName === 'DD') {
        result.metadata[dt.textContent.trim()] = dd.textContent.trim();
      }
    });
    
    // 이미지
    const img = document.querySelector('img[src*="googleusercontent"]') ||
                document.querySelector('img[src*="lh3."]');
    result.image = img ? img.src : null;
    
    // 페이지 구조 분석을 위한 주요 요소들
    result.h2s = Array.from(document.querySelectorAll('h2')).map(h => h.textContent.trim());
    result.h3s = Array.from(document.querySelectorAll('h3')).map(h => h.textContent.trim());
    
    return result;
  });
  
  console.log(JSON.stringify(info, null, 2));
  
  await browser.close();
}

analyze().catch(console.error);
