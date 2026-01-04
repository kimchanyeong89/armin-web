const puppeteer = require('puppeteer');

(async () => {
  try {
    console.log('=== Analyzing Napoli Museum Egyptian Collection ===');
    
    const browser = await puppeteer.launch({ 
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(120000);
    
    console.log('Loading page...');
    await page.goto('https://www.museoarcheologiconapoli.it/en/portfolio-item/egyptian-collection/', { 
      waitUntil: 'networkidle2',
      timeout: 120000 
    });
    
    console.log('Page loaded, scrolling...');
    
    // 스크롤해서 모든 콘텐츠 로드
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 1000));
    }
    
    console.log('Analyzing page structure...');
    
    const data = await page.evaluate(() => {
      const results = {};
      
      // 라이트박스 또는 갤러리 아이템 찾기
      const lightboxItems = document.querySelectorAll('[data-title], [data-caption], a[title]');
      results.lightboxItems = Array.from(lightboxItems).slice(0, 20).map(el => ({
        tag: el.tagName,
        dataTitle: el.getAttribute('data-title'),
        dataCaption: el.getAttribute('data-caption'),
        title: el.getAttribute('title'),
        href: el.href || ''
      })).filter(item => item.dataTitle || item.dataCaption || item.title);
      
      // 캐러셀 슬라이드 찾기
      const slides = document.querySelectorAll('.wpex-carousel-slide, .swiper-slide, .slick-slide');
      results.carouselSlides = slides.length;
      
      // 이미지 갤러리 찾기
      const galleries = document.querySelectorAll('.wpex-lightbox-gallery, .gallery, .image-gallery');
      results.galleries = galleries.length;
      
      // 모든 제목 요소에서 작품 정보 찾기
      const allText = document.body.innerText;
      const artworkMatches = [];
      
      // Dynasty 패턴으로 작품 찾기
      const dynastyRegex = /([A-Z][^\\n]{5,100})\\n\\s*\\d+(?:st|nd|rd|th) Dynasty/g;
      let match;
      while ((match = dynastyRegex.exec(allText)) !== null) {
        artworkMatches.push(match[0].substring(0, 200));
      }
      results.dynastyMatches = artworkMatches;
      
      // 페이지 일부 텍스트
      results.sampleText = allText.substring(0, 4000);
      
      return results;
    });
    
    console.log('\n=== Results ===');
    console.log('Lightbox items with data-title/caption:', data.lightboxItems.length);
    console.log(JSON.stringify(data.lightboxItems.slice(0, 10), null, 2));
    
    console.log('\nCarousel slides:', data.carouselSlides);
    console.log('Galleries:', data.galleries);
    console.log('Dynasty matches:', data.dynastyMatches.length);
    
    if (data.dynastyMatches.length > 0) {
      console.log('Dynasty matches sample:', data.dynastyMatches.slice(0, 5));
    }
    
    console.log('\n=== Page text sample ===');
    console.log(data.sampleText);
    
    await browser.close();
    console.log('\nDone!');
  } catch (error) {
    console.error('Error:', error.message);
  }
})();
