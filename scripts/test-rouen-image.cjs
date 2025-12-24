/**
 * Rouen 이미지 추출 테스트
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('=== Rouen 이미지 추출 테스트 ===');
  await page.goto('https://mbarouen.fr/en/oeuvres/the-church-at-moret-in-the-morning-sun', { 
    waitUntil: 'networkidle', 
    timeout: 60000 
  });
  await page.waitForTimeout(3000);
  
  const imgData = await page.evaluate(() => {
    // 모든 이미지 src 확인
    const allImgs = [...document.querySelectorAll('img')]
      .filter(img => {
        const src = img.src || '';
        return src.length > 0 && !src.includes('logo') && !src.includes('icon') && !src.includes('zoomin') && !src.includes('zoomout') && !src.includes('home_') && !src.includes('fullpage');
      })
      .map(img => img.src);
    
    // og:image 확인
    const ogImage = document.querySelector('meta[property="og:image"]');
    const ogImageUrl = ogImage ? ogImage.content : null;
    
    // deepzoom 이미지에서 해시 추출
    const deepzoomImgs = [...document.querySelectorAll('img[src*="deepzoom"]')];
    let imageHash = null;
    if (deepzoomImgs.length > 0) {
      const match = deepzoomImgs[0].src.match(/deepzoom\/([a-f0-9]+)_files/);
      if (match) imageHash = match[1];
    }
    
    // 가능한 이미지 URL 패턴들
    const possibleUrls = [];
    if (imageHash) {
      possibleUrls.push('https://mbarouen.fr/sites/default/files/oeuvres/' + imageHash + '.jpg');
      possibleUrls.push('https://mbarouen.fr/sites/default/files/styles/large/public/oeuvres/' + imageHash + '.jpg');
    }
    
    return {
      allImgs: allImgs.slice(0, 15),
      ogImage: ogImageUrl,
      imageHash,
      deepzoomCount: deepzoomImgs.length,
      possibleUrls
    };
  });
  
  console.log('모든 이미지:', JSON.stringify(imgData.allImgs, null, 2));
  console.log('og:image:', imgData.ogImage);
  console.log('imageHash:', imgData.imageHash);
  console.log('deepzoom 이미지 수:', imgData.deepzoomCount);
  console.log('가능한 URL:', JSON.stringify(imgData.possibleUrls, null, 2));
  
  await browser.close();
})();
