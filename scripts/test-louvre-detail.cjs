const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // 상세 페이지 테스트
  await page.goto('https://collections.louvre.fr/en/ark:/53355/cl010052603', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);
  
  // 제목 - h1 중 첫번째
  const titles = await page.$$eval('h1', els => els.map(el => el.textContent?.trim()));
  console.log('All H1:', titles);
  
  // 이미지들
  const images = await page.$$eval('img', els => els.map(el => ({
    src: el.src,
    alt: el.alt
  })).filter(img => img.src && !img.src.includes('data:image')));
  console.log('\nImages:', images.slice(0, 5));
  
  // og:image
  const ogImg = await page.$eval('meta[property="og:image"]', el => el.content).catch(() => null);
  console.log('\nOG Image:', ogImg);
  
  // 메타 태그들
  const metas = await page.$$eval('meta', els => els.map(el => ({
    name: el.name,
    property: el.getAttribute('property'),
    content: el.content
  })).filter(m => m.content && (m.name || m.property)));
  console.log('\nMeta tags:');
  metas.slice(0, 10).forEach(m => console.log(`  ${m.name || m.property}: ${m.content?.substring(0, 100)}`));
  
  // 작품 정보 영역
  const noticeText = await page.$eval('.notice, .artwork-info, main', el => el.innerText).catch(() => null);
  if (noticeText) {
    console.log('\nNotice text (first 1000 chars):');
    console.log(noticeText.substring(0, 1000));
  }
  
  await browser.close();
})();
