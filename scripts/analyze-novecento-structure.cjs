/**
 * Museo Novecento 사이트 구조 분석
 */

const { chromium } = require('playwright');

async function analyze() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    console.log('페이지 로드 중...');
    await page.goto('https://www.museonovecento.it/en/collezione/alberto-della-ragione-en/', { 
      waitUntil: 'networkidle', 
      timeout: 60000 
    });
    await new Promise(r => setTimeout(r, 5000));
    
    // 스크롤
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, 2000));
      await new Promise(r => setTimeout(r, 500));
    }
    
    // 페이지 HTML 구조 분석
    const structure = await page.evaluate(() => {
      const result = {
        allClasses: [],
        artworkCards: []
      };
      
      // 모든 클래스 이름 수집 (opera 관련)
      document.querySelectorAll('*').forEach(el => {
        if (el.className && typeof el.className === 'string' && el.className.includes('opera')) {
          result.allClasses.push({
            tag: el.tagName,
            class: el.className,
            childrenCount: el.children.length
          });
        }
      });
      
      // 실제 작품 카드 구조 분석 (이미지가 있는)
      const containers = document.querySelectorAll('.opera, [class*="opera-item"], .artwork, .collection-item');
      containers.forEach((el, i) => {
        if (i >= 3) return;
        
        const img = el.querySelector('img');
        const link = el.querySelector('a');
        
        // 모든 텍스트 노드 수집
        const textNodes = [];
        el.querySelectorAll('*').forEach(child => {
          const text = child.textContent?.trim();
          if (text && text.length < 200) {
            textNodes.push({
              tag: child.tagName,
              class: child.className,
              text: text
            });
          }
        });
        
        result.artworkCards.push({
          className: el.className,
          img: img?.src,
          link: link?.href,
          innerHTML: el.innerHTML.slice(0, 2000),
          textNodes
        });
      });
      
      return result;
    });
    
    console.log('\n=== OPERA 관련 클래스 ===');
    const uniqueClasses = [...new Set(structure.allClasses.map(c => c.class))].slice(0, 10);
    uniqueClasses.forEach(c => console.log(c));
    
    console.log('\n=== 작품 카드 구조 ===');
    structure.artworkCards.forEach((card, i) => {
      console.log(`\n--- Card ${i + 1} ---`);
      console.log('Class:', card.className);
      console.log('Image:', card.img);
      console.log('Link:', card.link);
      console.log('HTML:', card.innerHTML);
    });
    
    // 개별 작품 페이지 분석
    const firstLink = await page.evaluate(() => {
      const link = document.querySelector('.opera a[href*="opere"]');
      return link?.href;
    });
    
    if (firstLink) {
      console.log('\n=== 상세 페이지 분석 ===');
      console.log('Link:', firstLink);
      await page.goto(firstLink, { waitUntil: 'networkidle', timeout: 30000 });
      await new Promise(r => setTimeout(r, 3000));
      
      const detail = await page.evaluate(() => {
        return {
          title: document.querySelector('h1, .title, [class*="titolo"]')?.textContent?.trim(),
          artist: document.querySelector('[class*="artist"], [class*="autore"]')?.textContent?.trim(),
          year: document.querySelector('[class*="anno"], [class*="year"], [class*="date"]')?.textContent?.trim(),
          allText: document.body.innerText.slice(0, 3000)
        };
      });
      
      console.log('Detail:', JSON.stringify(detail, null, 2));
    }
    
  } finally {
    await browser.close();
  }
}

analyze().catch(console.error);
