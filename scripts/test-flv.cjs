const { webkit } = require('playwright');

(async () => {
  console.log('WebKit 브라우저 시작...');
  const browser = await webkit.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    console.log('페이지 로딩 중...');
    const response = await page.goto('https://www.fondationlouisvuitton.fr/en/collection/artworks', { 
      timeout: 30000 
    });
    
    console.log('Status:', response?.status());
    const title = await page.title();
    console.log('Title:', title);
    
    const html = await page.content();
    require('fs').writeFileSync('/tmp/flv-page.html', html);
    console.log('저장됨:', html.length, 'bytes');
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  
  await browser.close();
})();
