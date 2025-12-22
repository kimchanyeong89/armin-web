const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('Loading page...');
  await page.goto('https://www.mep-fr.org/les-collections/brassai/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 쿠키 배너 닫기
  try {
    await page.click('button:has-text("OK"), .accept', { timeout: 2000 });
  } catch(e) {}
  
  console.log('\n=== Analyzing page structure ===\n');
  
  // 슬라이더 찾기
  const data = await page.evaluate(() => {
    const result = {
      swiperSlides: [],
      figures: [],
      allSlides: []
    };
    
    // .swiper-slide
    document.querySelectorAll('.swiper-slide').forEach((el, i) => {
      if (i < 3) {
        result.swiperSlides.push({
          classes: el.className,
          html: el.innerHTML.substring(0, 400)
        });
      }
    });
    
    // figure
    document.querySelectorAll('figure').forEach((el, i) => {
      if (i < 3) {
        result.figures.push({
          html: el.innerHTML.substring(0, 400)
        });
      }
    });
    
    // 이미지 + 캡션 패턴 찾기
    document.querySelectorAll('img').forEach((img, i) => {
      if (i < 10 && img.src && !img.src.includes('logo')) {
        const parent = img.parentElement;
        const grandparent = parent?.parentElement;
        
        // 근처의 텍스트 찾기
        let caption = '';
        const sibling = img.nextElementSibling;
        if (sibling) caption = sibling.textContent?.trim()?.substring(0, 200);
        if (!caption) {
          const parentText = parent?.textContent?.trim()?.substring(0, 200);
          caption = parentText || '';
        }
        
        result.allSlides.push({
          src: img.src.substring(0, 100),
          parentClass: parent?.className,
          caption: caption
        });
      }
    });
    
    return result;
  });
  
  console.log('Swiper slides found:', data.swiperSlides.length);
  data.swiperSlides.forEach((s, i) => {
    console.log(`\n--- Swiper Slide ${i} ---`);
    console.log(s.html);
  });
  
  console.log('\n\nFigures found:', data.figures.length);
  data.figures.forEach((f, i) => {
    console.log(`\n--- Figure ${i} ---`);
    console.log(f.html);
  });
  
  console.log('\n\nImages with captions:');
  data.allSlides.forEach((s, i) => {
    console.log(`\n${i}: ${s.src}`);
    console.log(`   Class: ${s.parentClass}`);
    console.log(`   Caption: ${s.caption}`);
  });
  
  await browser.close();
})();
