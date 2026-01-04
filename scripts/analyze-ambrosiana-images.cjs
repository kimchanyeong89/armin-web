/**
 * Ambrosiana 이미지 URL 분석
 */

const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // 네트워크 요청 캡처
  const imageUrls = [];
  page.on('response', async (response) => {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';
    if (contentType.includes('image') || url.match(/\.(jpg|png|jpeg|webp|gif)/i)) {
      if (!url.includes('icon') && !url.includes('logo') && !url.includes('zoom') && !url.includes('home_') && !url.includes('fullpage')) {
        imageUrls.push(url);
      }
    }
  });
  
  console.log('페이지 로드 중...');
  await page.goto('https://www.ambrosiana.it/en/pinacoteca-collections/#/dettaglio/f893635c-1ca7-4ed8-95ac-9fdc91fbd99a', { waitUntil: 'networkidle', timeout: 60000 });
  await new Promise(r => setTimeout(r, 8000));
  
  console.log('\n캡처된 이미지 URL:');
  imageUrls.forEach(url => console.log(url));
  
  // OpenSeadragon 타일 소스 확인
  const tileSource = await page.evaluate(() => {
    // OpenSeadragon 인스턴스 찾기
    if (window.OpenSeadragon) {
      return 'OpenSeadragon detected';
    }
    
    // Canvas 요소 확인
    const canvases = document.querySelectorAll('canvas');
    if (canvases.length > 0) {
      return `Found ${canvases.length} canvas elements`;
    }
    
    // Deep Zoom 이미지 정보
    const scripts = Array.from(document.querySelectorAll('script'));
    for (const s of scripts) {
      if (s.textContent && s.textContent.includes('tilesUrl')) {
        return s.textContent.substring(0, 500);
      }
    }
    
    return 'No tile source found';
  });
  
  console.log('\n타일 소스:', tileSource);
  
  await browser.close();
}

main().catch(console.error);
