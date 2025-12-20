/**
 * Courtauld 이미지 디버깅
 * 20개 작품에서 어떤 이미지 URL이 추출되는지 분석
 */

const { chromium } = require('playwright');

const URL = 'https://artsandculture.google.com/explore/collections/the-courtauld?c=assets';

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const browser = await chromium.launch({
    headless: false,
    args: ['--window-position=100,100', '--window-size=1200,800']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  const page = await context.newPage();
  
  console.log('⏳ CAPTCHA 통과 후 Enter...');
  await page.goto('https://artsandculture.google.com/', { waitUntil: 'domcontentloaded' });
  await delay(3000);
  
  await new Promise(resolve => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.setRawMode(false);
      resolve();
    });
  });
  
  // 링크 수집
  console.log('\n🔗 링크 수집 중...');
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await delay(3000);
  
  const links = await page.$$eval('a[href*="/asset/"]', els => 
    els.slice(0, 20).map(el => el.href)
  );
  
  console.log(`✅ ${links.length}개 링크 수집\n`);
  
  // 각 링크에서 이미지 분석
  for (let i = 0; i < links.length; i++) {
    const url = links[i];
    const detailPage = await context.newPage();
    
    await detailPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await delay(2000);
    
    const data = await detailPage.evaluate(() => {
      const title = document.querySelector('h1')?.textContent?.trim();
      const html = document.documentElement.innerHTML;
      
      // 모든 lh3 이미지 URL 추출
      const allUrls = html.match(/https:\/\/lh3\.googleusercontent\.com\/ci\/[A-Za-z0-9_-]+/g) || [];
      const uniqueUrls = [...new Set(allUrls)];
      
      // img 태그에서 실제 보이는 이미지 추출
      const imgTags = Array.from(document.querySelectorAll('img[src*="lh3.googleusercontent.com"]'));
      const visibleImages = imgTags.map(img => ({
        src: img.src.split('=')[0],
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        alt: img.alt
      })).filter(img => img.width > 100);
      
      return { title, uniqueUrls, visibleImages };
    });
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${i + 1}] ${data.title}`);
    console.log(`URL: ${url}`);
    console.log(`\n📷 HTML에서 추출된 이미지 URLs (${data.uniqueUrls.length}개):`);
    data.uniqueUrls.forEach((u, j) => {
      const id = u.split('/ci/')[1];
      console.log(`  ${j + 1}. ...${id.slice(-50)}`);
    });
    
    console.log(`\n🖼️  실제 보이는 이미지 (width > 100):`);
    data.visibleImages.forEach((img, j) => {
      const id = img.src.split('/ci/')[1] || img.src.slice(-50);
      console.log(`  ${j + 1}. ${img.width}x${img.height} | alt: "${img.alt}" | ...${id.slice(-40)}`);
    });
    
    await detailPage.close();
  }
  
  await browser.close();
  console.log('\n✅ 분석 완료');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
