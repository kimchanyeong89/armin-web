const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(90000);
  
  console.log('Loading Egyptian collection...');
  await page.goto('https://www.museoarcheologiconapoli.it/en/portfolio-item/egyptian-collection/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(8000);
  
  // 스크롤 끝까지
  for (let i = 0; i < 15; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
  }
  
  // HTML 구조 분석
  const structure = await page.evaluate(() => {
    // 모든 가능한 작품 카드 셀렉터 시도
    const selectors = [
      '.gallery-item',
      '.artwork',
      '.card',
      '.item',
      '.wpex-gallery-slide',
      '.vcex-image-grid-entry',
      'figure',
      '.wpex-lightbox-group-item',
      '.wpex-carousel-slide',
      '.vcex-image-gallery-entry',
      '[data-title]'
    ];
    
    const results = {};
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        results[sel] = {
          count: els.length,
          sample: els[0].outerHTML.substring(0, 800)
        };
      }
    }
    
    // 이미지와 관련 텍스트 찾기
    const images = document.querySelectorAll('img');
    const artworkImages = [];
    
    for (const img of images) {
      const src = img.src || '';
      if (src.includes('uploads') && src.indexOf('logo') === -1 && src.indexOf('icon') === -1 && src.indexOf('menu') === -1) {
        // 부모 요소에서 data 속성 확인
        let parent = img.parentElement;
        let dataTitle = '';
        let dataCaption = '';
        
        for (let i = 0; i < 5; i++) {
          if (parent) {
            if (parent.getAttribute('data-title')) dataTitle = parent.getAttribute('data-title');
            if (parent.getAttribute('data-caption')) dataCaption = parent.getAttribute('data-caption');
            if (parent.getAttribute('title')) dataTitle = dataTitle || parent.getAttribute('title');
            parent = parent.parentElement;
          }
        }
        
        artworkImages.push({
          src: src,
          alt: img.alt,
          dataTitle: dataTitle,
          dataCaption: dataCaption
        });
      }
    }
    
    results.artworkImages = artworkImages.slice(0, 15);
    
    // lightbox 링크 찾기
    const lightboxLinks = document.querySelectorAll('a.wpex-lightbox, a[data-fancybox], a[class*="lightbox"]');
    results.lightboxLinks = Array.from(lightboxLinks).slice(0, 5).map(a => ({
      href: a.href,
      dataTitle: a.getAttribute('data-title'),
      dataCaption: a.getAttribute('data-caption'),
      title: a.title
    }));
    
    return results;
  });
  
  console.log(JSON.stringify(structure, null, 2));
  
  await browser.close();
})();
