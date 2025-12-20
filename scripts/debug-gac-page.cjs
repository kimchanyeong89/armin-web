/**
 * GAC 페이지 디버깅 - 이미지 로딩 과정 분석
 */

const { chromium } = require('playwright');
const fs = require('fs');

// 플레이스홀더인 작품 중 하나 테스트 (실제 URL)
const TEST_URLS = [
  'https://artsandculture.google.com/asset/summer/FAFsdZTSK8AilA',
  'https://artsandculture.google.com/asset/the-blinding-of-elymas/5QGaO8M6MWdIng',
  'https://artsandculture.google.com/asset/design/ogGDDMHPq_ePOA',
  'https://artsandculture.google.com/asset/thor-battering-the-midgard-serpent/fQEH7Ro3EE5c7w',
];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function debugPage(page, url) {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 디버깅:', url);
  console.log('='.repeat(80));
  
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  // 1. 초기 상태 (500ms)
  await delay(500);
  console.log('\n📸 [500ms] 초기 상태:');
  
  let analysis = await page.evaluate(() => {
    const result = {
      title: document.querySelector('h1')?.textContent?.trim(),
      allImages: [],
      googleImages: [],
      iframes: [],
      popups: [],
      lazyImages: [],
      backgroundImages: [],
    };
    
    // 모든 이미지 분석
    document.querySelectorAll('img').forEach(img => {
      const info = {
        src: img.src?.slice(0, 100),
        width: img.width,
        height: img.height,
        loading: img.loading,
        alt: img.alt?.slice(0, 50),
        isVisible: img.offsetParent !== null,
        hasLazySrc: !!img.dataset.src,
        lazySrc: img.dataset.src?.slice(0, 100),
      };
      result.allImages.push(info);
      
      if (img.src?.includes('lh3.googleusercontent.com')) {
        result.googleImages.push(img.src);
      }
    });
    
    // iframe 분석
    document.querySelectorAll('iframe').forEach(iframe => {
      result.iframes.push({
        src: iframe.src?.slice(0, 100),
        width: iframe.width,
        height: iframe.height,
      });
    });
    
    // 팝업/모달/오버레이 분석
    document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="popup"], [class*="overlay"]').forEach(el => {
      result.popups.push({
        tag: el.tagName,
        className: el.className?.slice(0, 100),
        isVisible: el.offsetParent !== null,
        innerHTML: el.innerHTML?.slice(0, 200),
      });
    });
    
    // background-image 분석
    document.querySelectorAll('*').forEach(el => {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none' && bg.includes('lh3.googleusercontent.com')) {
        result.backgroundImages.push({
          tag: el.tagName,
          className: el.className?.slice(0, 50),
          bg: bg.slice(0, 150),
        });
      }
    });
    
    return result;
  });
  
  console.log('   제목:', analysis.title);
  console.log('   전체 이미지:', analysis.allImages.length);
  console.log('   Google 이미지:', analysis.googleImages.length);
  console.log('   iframes:', analysis.iframes.length);
  console.log('   팝업/모달:', analysis.popups.length);
  console.log('   배경 이미지:', analysis.backgroundImages.length);
  
  if (analysis.googleImages.length > 0) {
    console.log('\n   🖼️  Google 이미지 URL:');
    analysis.googleImages.forEach((url, i) => {
      console.log(`      ${i + 1}. ...${url.slice(-60)}`);
    });
  }
  
  if (analysis.popups.length > 0) {
    console.log('\n   ⚠️  팝업/모달 발견:');
    analysis.popups.forEach((p, i) => {
      console.log(`      ${i + 1}. ${p.tag} visible=${p.isVisible} class=${p.className?.slice(0, 50)}`);
    });
  }
  
  // 2. 스크롤 후 (이미지 lazy loading 트리거)
  console.log('\n📸 [스크롤 후] Lazy loading 트리거:');
  await page.evaluate(() => {
    window.scrollTo(0, 500);
  });
  await delay(1000);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await delay(500);
  
  // 3. 3초 대기 후
  console.log('\n📸 [3초 대기 후]:');
  await delay(2000);
  
  analysis = await page.evaluate(() => {
    const googleImages = [];
    document.querySelectorAll('img').forEach(img => {
      if (img.src?.includes('lh3.googleusercontent.com')) {
        googleImages.push({
          src: img.src,
          width: img.width,
          height: img.height,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        });
      }
    });
    
    // HTML에서 직접 URL 추출
    const html = document.documentElement.innerHTML;
    const htmlUrls = html.match(/https:\/\/lh3\.googleusercontent\.com\/ci\/[A-Za-z0-9_-]+/g) || [];
    const uniqueHtmlUrls = [...new Set(htmlUrls)];
    
    return { googleImages, htmlUrls: uniqueHtmlUrls };
  });
  
  console.log('   Google 이미지 (img 태그):', analysis.googleImages.length);
  console.log('   HTML에서 추출한 URL:', analysis.htmlUrls.length);
  
  if (analysis.googleImages.length > 0) {
    console.log('\n   🖼️  실제 로드된 이미지:');
    analysis.googleImages.forEach((img, i) => {
      console.log(`      ${i + 1}. ${img.width}x${img.height} (natural: ${img.naturalWidth}x${img.naturalHeight})`);
      console.log(`         ...${img.src.slice(-70)}`);
    });
  }
  
  if (analysis.htmlUrls.length > 0) {
    console.log('\n   📝 HTML에서 찾은 모든 이미지 URL:');
    analysis.htmlUrls.forEach((url, i) => {
      console.log(`      ${i + 1}. ...${url.slice(-60)}`);
    });
  }
  
  // 4. 이미지 클릭 시도 (더 큰 이미지 로드?)
  console.log('\n📸 [이미지 클릭 후]:');
  try {
    const mainImage = await page.$('img[src*="lh3.googleusercontent.com"]');
    if (mainImage) {
      await mainImage.click();
      await delay(2000);
      
      const afterClick = await page.evaluate(() => {
        const googleImages = [];
        document.querySelectorAll('img').forEach(img => {
          if (img.src?.includes('lh3.googleusercontent.com')) {
            googleImages.push({
              src: img.src,
              width: img.width,
              height: img.height,
            });
          }
        });
        return googleImages;
      });
      
      console.log('   클릭 후 Google 이미지:', afterClick.length);
      if (afterClick.length > 0) {
        afterClick.forEach((img, i) => {
          console.log(`      ${i + 1}. ${img.width}x${img.height} ...${img.src.slice(-60)}`);
        });
      }
    }
  } catch (e) {
    console.log('   이미지 클릭 실패:', e.message);
  }
  
  // 5. 네트워크 요청 분석
  console.log('\n📸 [페이지 소스 분석]:');
  const pageSource = await page.content();
  
  // 이미지 관련 패턴 찾기
  const patterns = [
    /data-src="([^"]+lh3\.googleusercontent\.com[^"]+)"/g,
    /srcset="([^"]+lh3\.googleusercontent\.com[^"]+)"/g,
    /style="[^"]*url\(([^)]+lh3\.googleusercontent\.com[^)]+)\)/g,
  ];
  
  patterns.forEach((pattern, i) => {
    const matches = pageSource.match(pattern);
    if (matches && matches.length > 0) {
      console.log(`   패턴 ${i + 1} 매치: ${matches.length}개`);
      matches.slice(0, 3).forEach(m => console.log(`      ${m.slice(0, 100)}...`));
    }
  });
  
  // 6. 스크린샷 저장
  const title = analysis.title?.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30) || 'unknown';
  const screenshotPath = `/Users/kietzsche/armin-web-main/downloads/debug-${title}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`\n   📷 스크린샷 저장: ${screenshotPath}`);
  
  return analysis;
}

async function main() {
  console.log('🔬 GAC 페이지 이미지 로딩 디버깅');
  console.log('   플레이스홀더 문제 원인 분석\n');
  
  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1200,900']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    viewport: { width: 1200, height: 900 }
  });
  
  const page = await context.newPage();
  
  // CAPTCHA 처리
  console.log('⏳ CAPTCHA 처리...');
  await page.goto('https://artsandculture.google.com/', { waitUntil: 'domcontentloaded' });
  await delay(3000);
  
  console.log('\n🔐 CAPTCHA가 있으면 통과 후 Enter 눌러주세요...');
  await new Promise(resolve => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.setRawMode(false);
      resolve();
    });
  });
  
  console.log('✅ 디버깅 시작...');
  
  for (const url of TEST_URLS) {
    await debugPage(page, url);
  }
  
  console.log('\n\n🏁 디버깅 완료!');
  console.log('브라우저는 열어둘게요. 직접 확인해보세요.');
  console.log('종료하려면 Ctrl+C...');
  
  // 브라우저 열어둠
  await new Promise(() => {});
}

main().catch(console.error);
