/**
 * Hayward Gallery - Playwright Stealth Mode
 * 더 강력한 봇 탐지 우회
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://artsandculture.google.com';
const JSON_PATH = path.join(__dirname, '../public/data/hayward-gallery-collection.json');
const MAX_ITEMS = 100;

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=' .repeat(50));
  console.log('🎨 Hayward Gallery - Playwright Stealth');
  console.log('=' .repeat(50));

  // 스텔스 브라우저 설정
  const browser = await chromium.launch({
    headless: false,  // 헤드리스 false가 더 안전
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/New_York',
    geolocation: { longitude: -73.935242, latitude: 40.730610 },
    permissions: ['geolocation']
  });

  // 웹드라이버 탐지 회피
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    
    // Chrome 객체 추가
    window.chrome = { runtime: {} };
    
    // 권한 쿼리 덮어쓰기
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
  });

  const page = await context.newPage();

  try {
    // 1. 컬렉션 페이지 로드
    console.log('\n📡 페이지 로드 중...');
    await page.goto(`${BASE_URL}/explore/collections/hayward-gallery?c=assets`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // CAPTCHA 체크
    const url = page.url();
    if (url.includes('/sorry/') || url.includes('captcha')) {
      console.log('\n⚠️  CAPTCHA 감지! 수동으로 해결해주세요...');
      console.log('   해결 후 엔터를 누르세요.');
      
      const readline = require('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      await new Promise(r => rl.question('', () => { rl.close(); r(); }));
    }

    await delay(2000);

    // 2. 스크롤하며 링크 수집
    console.log('📜 스크롤하며 링크 수집 중...');
    let links = new Set();
    let stallCount = 0;
    let lastCount = 0;

    while (links.size < MAX_ITEMS && stallCount < 5) {
      const newLinks = await page.$$eval('a[href*="/asset/"]', els => 
        els.map(el => el.href).filter(h => h.includes('/asset/'))
      );
      newLinks.forEach(l => links.add(l));

      process.stdout.write(`\r  수집: ${links.size}개`);

      if (links.size === lastCount) {
        stallCount++;
      } else {
        stallCount = 0;
        lastCount = links.size;
      }

      if (links.size >= MAX_ITEMS) break;

      await page.evaluate(() => window.scrollBy(0, 800));
      await delay(500);
    }

    console.log(`\n✅ ${links.size}개 링크 수집 완료`);
    const linkArray = Array.from(links).slice(0, MAX_ITEMS);

    // 3. 개별 페이지 스크래핑
    console.log(`\n🖼️  ${linkArray.length}개 작품 스크래핑...`);
    const results = [];

    for (let i = 0; i < linkArray.length; i++) {
      try {
        await page.goto(linkArray[i], { waitUntil: 'networkidle', timeout: 20000 });
        await delay(1500);  // 이미지 로딩 대기

        const data = await page.evaluate(() => {
          const title = document.querySelector('h1')?.textContent?.trim();
          
          let artist = 'Unknown', year = null;
          for (const h2 of document.querySelectorAll('h2')) {
            const text = h2.textContent.trim();
            if (text.includes('Get the app') || text.includes('Hayward') || text.length > 100) continue;
            const m = text.match(/(\d{4})$/);
            if (m) { year = m[1]; artist = text.replace(/\d{4}$/, '').trim(); }
            else { artist = text; }
            if (artist) break;
          }

          // 이미지 찾기 - 여러 방법 시도
          let image = null;
          
          // 방법 1: 페이지 전체 HTML에서 고해상도 이미지 URL 추출
          const html = document.documentElement.innerHTML;
          const urlMatches = html.match(/https:\/\/lh3\.googleusercontent\.com\/ci\/[A-Za-z0-9_-]+/g) || [];
          const uniqueUrls = [...new Set(urlMatches)];
          
          // 첫 번째 ci/ URL이 보통 메인 작품 이미지
          if (uniqueUrls.length > 0) {
            // 가장 긴 URL 선택 (더 구체적인 것)
            image = uniqueUrls.reduce((a, b) => a.length >= b.length ? a : b);
          }
          
          // 방법 2: 배경 이미지에서 찾기
          if (!image) {
            for (const el of document.querySelectorAll('[style*="background"]')) {
              const style = el.getAttribute('style') || '';
              const match = style.match(/url\(["']?(https:\/\/lh3\.googleusercontent\.com[^"'\)]+)/);
              if (match) {
                image = match[1];
                break;
              }
            }
          }
          
          // 방법 3: img 태그에서 찾기 (백업)
          if (!image) {
            for (const img of document.querySelectorAll('img')) {
              const src = img.src || '';
              if (!src.includes('googleusercontent')) continue;
              if (src.includes('avatar') || src.includes('logo') || src.includes('=s32') || src.includes('=s48') || src.includes('=s64')) continue;
              image = src;
              break;
            }
          }
          
          // 고해상도로 변환
          if (image) {
            image = image.replace(/=w\d+.*/, '=w800').replace(/=s\d+.*/, '=s800');
            if (!image.includes('=')) image += '=w800';
          }

          return { title, artist, year, image };
        });

        if (data.title && data.image) {
          results.push({
            id: `hayward-gac-${i + 1}`,
            title: data.title,
            artist: data.artist || 'Unknown',
            year: data.year ? parseInt(data.year) : null,
            image: data.image,
            sourceUrl: linkArray[i]
          });
        }

        if ((i + 1) % 10 === 0) {
          console.log(`  진행: ${i + 1}/${linkArray.length} | 성공: ${results.length}`);
        }
      } catch (e) {
        // 에러 무시
      }
    }

    // 4. 저장
    const output = {
      museum: "Hayward Gallery",
      museumId: "hayward-gallery",
      collectionName: "The Collection",
      scrapedAt: new Date().toISOString(),
      totalObjects: results.length,
      coverImage: results[0]?.image || null,
      objects: results
    };

    fs.writeFileSync(JSON_PATH, JSON.stringify(output, null, 2));
    console.log(`\n✅ 완료! ${results.length}개 저장 → ${JSON_PATH}`);

    // 이미지 URL 중복 확인
    const imageUrls = results.map(r => r.image);
    const uniqueUrls = new Set(imageUrls);
    console.log(`📊 고유 이미지: ${uniqueUrls.size}/${results.length}`);

  } finally {
    await browser.close();
  }
}

main().catch(console.error);
