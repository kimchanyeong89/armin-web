/**
 * Hayward Gallery - Cookie Reuse Mode
 * Saves cookies after first captcha solve, reuses for future runs
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

puppeteer.use(StealthPlugin());

const BASE_URL = 'https://artsandculture.google.com';
const COOKIE_PATH = path.join(__dirname, '../.gac-cookies.json');
const JSON_PATH = path.join(__dirname, '../public/data/hayward-gallery-collection.json');

const CONCURRENCY = 10;
const MAX_ITEMS = 100; // 테스트용

function waitForEnter(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => { rl.question(prompt, () => { rl.close(); resolve(); }); });
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function parseYear(yearStr) {
  if (!yearStr) return null;
  const match = yearStr.match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}

async function processArtwork(browser, url, index) {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await delay(800);

    const data = await page.evaluate(() => {
      const title = document.querySelector('h1')?.textContent?.trim();
      let artist = null, year = null;
      for (const h2 of document.querySelectorAll('h2')) {
        const text = h2.textContent.trim();
        if (text.includes('Get the app') || text.includes('Hayward') || text.length > 100) continue;
        const m = text.match(/(\d{4})$/);
        if (m) { year = m[1]; artist = text.replace(/\d{4}$/, '').trim(); }
        else { artist = text; }
        if (artist) break;
      }
      
      // 이미지 찾기 - 가장 큰 이미지 선택
      let image = null;
      let maxSize = 0;
      for (const img of document.querySelectorAll('img')) {
        const src = img.src || '';
        if (!src.includes('googleusercontent') && !src.includes('lh3.') && !src.includes('lh4.') && !src.includes('lh5.')) continue;
        if (src.includes('avatar') || src.includes('logo') || src.includes('=s32') || src.includes('=s48')) continue;
        
        // 이미지 크기 확인
        const size = (img.naturalWidth || img.width || 0) * (img.naturalHeight || img.height || 0);
        if (size > maxSize) {
          maxSize = size;
          // 고해상도 버전으로 변환
          image = src.replace(/=w\d+.*/, '=w800').replace(/=s\d+.*/, '=s800');
        }
      }
      return { title, artist, year, image };
    });

    await page.close();
    if (!data.title || !data.image) return null;
    return { id: `hayward-gac-${index + 1}`, title: data.title, artist: data.artist || 'Unknown', year: parseYear(data.year), image: data.image, sourceUrl: url };
  } catch (e) {
    await page.close();
    return null;
  }
}

async function main() {
  console.log('============================================');
  console.log('🍪 Hayward Gallery - Cookie Reuse Mode');
  console.log('============================================\n');

  const hasCookies = fs.existsSync(COOKIE_PATH);
  if (hasCookies) console.log('✅ 저장된 쿠키 발견!\n');
  else console.log('⚠️ 쿠키 없음 - 캡차 해결 필요\n');

  const browser = await puppeteer.launch({ 
    headless: hasCookies ? 'new' : false, // 쿠키 있으면 headless
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    defaultViewport: { width: 1400, height: 900 }
  });

  const page = await browser.newPage();

  // 쿠키 로드
  if (hasCookies) {
    const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf8'));
    await page.setCookie(...cookies);
    console.log('🍪 쿠키 적용됨\n');
  }

  const artworks = [];

  try {
    console.log('📡 페이지 로드 중...');
    await page.goto(`${BASE_URL}/explore/collections/hayward-gallery?c=assets`, { waitUntil: 'networkidle2', timeout: 60000 });

    // 캡차 체크
    if (page.url().includes('/sorry/')) {
      console.log('\n🔐 캡차 감지! 브라우저에서 해결하세요.');
      await waitForEnter('✅ 해결 후 Enter... ');
      
      // 쿠키 저장
      const cookies = await page.cookies();
      fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2));
      console.log('🍪 쿠키 저장됨! 다음부터는 캡차 없이 실행됩니다.\n');
    }

    await delay(2000);

    // 스크롤
    console.log('📜 스크롤 중...');
    let prevH = 0, attempts = 0;
    while (attempts < 50) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(800);
      const h = await page.evaluate(() => document.body.scrollHeight);
      const cnt = await page.evaluate(() => document.querySelectorAll('a[href*="/asset/"]').length);
      if (attempts % 10 === 0) console.log(`    ${cnt}개...`);
      if (h === prevH && attempts > 5) break;
      prevH = h;
      attempts++;
    }

    let urls = await page.evaluate(() => 
      [...new Set([...document.querySelectorAll('a[href*="/asset/"]')].map(a => a.href))]
    );
    
    urls = urls.slice(0, MAX_ITEMS);
    console.log(`\n✅ ${urls.length}개 처리 시작\n`);

    const startTime = Date.now();
    let completed = 0, successful = 0;

    for (let i = 0; i < urls.length; i += CONCURRENCY) {
      const batch = urls.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map((url, idx) => processArtwork(browser, url, i + idx)));
      for (const r of results) { completed++; if (r) { artworks.push(r); successful++; } }
      
      if (completed % 20 === 0 || completed === urls.length) {
        const elapsed = (Date.now() - startTime) / 1000;
        console.log(`📊 ${completed}/${urls.length} | 성공: ${successful} | ${(completed/elapsed*60).toFixed(0)}개/분`);
      }
    }

    // 쿠키 다시 저장 (세션 유지)
    const cookies = await page.cookies();
    fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2));

  } catch (e) {
    console.error('❌', e.message);
  }

  await browser.close();

  fs.writeFileSync(JSON_PATH, JSON.stringify({
    museum: 'Hayward Gallery', museumId: 'hayward-gallery', collectionName: 'The Collection',
    scrapedAt: new Date().toISOString(), totalObjects: artworks.length,
    coverImage: artworks[0]?.image || '', objects: artworks
  }, null, 2));

  console.log(`\n✅ 완료! ${artworks.length}개 저장`);
}

main().catch(console.error);
