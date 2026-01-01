/**
 * Louis Vuitton Foundation 스크래핑 테스트
 * puppeteer-extra + stealth plugin 사용
 */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

(async () => {
  console.log('🚀 Stealth 모드로 브라우저 시작...');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080'
    ]
  });
  
  const page = await browser.newPage();
  
  // 추가 위장
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0'
  });
  
  try {
    console.log('📄 페이지 로딩 중...');
    
    const response = await page.goto('https://www.fondationlouisvuitton.fr/en/collection/artworks', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    console.log('Status:', response.status());
    
    // 페이지 로딩 대기
    await new Promise(r => setTimeout(r, 5000));
    
    const title = await page.title();
    console.log('Title:', title);
    
    if (title.includes('Access Denied')) {
      console.log('❌ 접근 차단됨');
    } else {
      console.log('✅ 접근 성공!');
      
      // 페이지 분석
      const info = await page.evaluate(() => {
        const images = document.querySelectorAll('img');
        const links = Array.from(document.querySelectorAll('a')).filter(a => 
          a.href && (a.href.includes('artwork') || a.href.includes('collection'))
        );
        
        // 작품 카드 찾기
        const cards = document.querySelectorAll('[class*="card"], [class*="artwork"], [class*="item"]');
        
        return {
          imageCount: images.length,
          linkCount: links.length,
          cardCount: cards.length,
          sampleLinks: links.slice(0, 5).map(a => a.href),
          bodyLength: document.body.innerHTML.length
        };
      });
      
      console.log('\n📊 페이지 분석:');
      console.log('  이미지:', info.imageCount);
      console.log('  링크:', info.linkCount);
      console.log('  카드:', info.cardCount);
      console.log('  HTML 길이:', info.bodyLength);
      console.log('  샘플 링크:', info.sampleLinks);
    }
    
    // HTML 저장
    const html = await page.content();
    fs.writeFileSync('/tmp/flv-stealth.html', html);
    console.log('\n💾 저장됨: /tmp/flv-stealth.html (' + html.length + ' bytes)');
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  
  await browser.close();
})();
