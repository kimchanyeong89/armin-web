/**
 * Hayward Gallery - 하이브리드 고속 스크래핑
 * 1. Playwright로 링크만 수집 (headless)
 * 2. requests로 병렬 스크래핑 (초고속)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const BASE_URL = 'https://artsandculture.google.com';
const JSON_PATH = path.join(__dirname, '../public/data/hayward-gallery-collection.json');
const MAX_ITEMS = 1200;  // 전체 컬렉션 (1091개 + 여유)
const CONCURRENCY = 15;  // 안정성을 위해 약간 줄임

// 비작품 필터링 패턴
const EXCLUDE_PATTERNS = [
  /installation view/i,
  /poster for/i,
  /exhibition guide/i,
  /private view card/i,
  /marketing leaflet/i,
  /catalogue for/i,
  /leaflet for/i,
  /press cutting/i,
  /draft poster/i,
  /hayward exterior/i,
  /exterior view/i,
  /gallery exterior/i,
  /building exterior/i,
  /\bphoto:/i,
  /additional items/i,
];

function isActualArtwork(title, artist) {
  if (!title) return false;
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(title)) return false;
  }
  if (artist && /^(unknown|hayward gallery|additional items|england)$/i.test(artist)) {
    return false;
  }
  return true;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// macOS에서 Chromium 창 숨기기 (더 강력하게)
function minimizeChrome() {
  // Chromium을 완전히 숨기고 다른 앱으로 포커스 이동
  exec(`osascript -e '
    tell application "System Events"
      set visible of process "Chromium" to false
    end tell
    tell application "System Events"
      set frontmost of the first process whose frontmost is true to true
    end tell
  '`);
}

// Chromium 창 보이기 (CAPTCHA용)
function showChrome() {
  exec(`osascript -e '
    tell application "System Events"
      set visible of process "Chromium" to true
      set frontmost of process "Chromium" to true
    end tell
  '`);
}

async function collectLinks() {
  console.log('📡 Playwright로 링크 수집...');
  
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--window-position=100,100',
      '--window-size=800,600'
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    viewport: { width: 800, height: 600 }
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();
  
  try {
    await page.goto(`${BASE_URL}/explore/collections/hayward-gallery?c=assets`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // CAPTCHA 체크
    if (page.url().includes('/sorry/')) {
      // CAPTCHA 시 창 보이기
      showChrome();
      console.log('\n⚠️  CAPTCHA 감지! 브라우저에서 해결해주세요...');
      const readline = require('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      await new Promise(r => rl.question('   해결 후 엔터...', () => { rl.close(); r(); }));
      await page.goto(`${BASE_URL}/explore/collections/hayward-gallery?c=assets`);
    }

    // CAPTCHA 해결 후 창 숨기기
    console.log('🔽 창 숨기는 중...');
    minimizeChrome();
    await delay(500);
    minimizeChrome();  // 한번 더
    
    await delay(2000);

    // 스크롤하며 링크 수집
    let links = new Set();
    let lastCount = 0;
    let stall = 0;

    while (links.size < MAX_ITEMS && stall < 10) {  // 더 많이 스크롤
      const newLinks = await page.$$eval('a[href*="/asset/"]', els => 
        els.map(el => el.href).filter(h => h.includes('/asset/'))
      );
      newLinks.forEach(l => links.add(l));

      process.stdout.write(`\r  수집: ${links.size}개`);

      if (links.size === lastCount) stall++;
      else { stall = 0; lastCount = links.size; }

      if (links.size >= MAX_ITEMS) break;

      await page.evaluate(() => window.scrollBy(0, 1500));  // 더 많이 스크롤
      await delay(400);  // 로딩 대기
    }

    console.log(`\n✅ ${links.size}개 링크 수집 완료`);
    return { links: Array.from(links).slice(0, MAX_ITEMS), context, browser };

  } catch (e) {
    console.error('❌ 링크 수집 실패:', e.message);
    await browser.close();
    return { links: null, context: null, browser: null };
  }
}

async function scrapeWithBrowserTabs(context, links) {
  console.log(`\n🚀 ${links.length}개 병렬 스크래핑 (${CONCURRENCY}개 탭 동시)...`);
  
  const results = [];
  const startTime = Date.now();
  
  // 0.5초마다 창 숨기기 (새 탭이 포커스 가져가는 것 방지)
  const hideInterval = setInterval(minimizeChrome, 500);
  minimizeChrome();  // 즉시 숨기기
  
  for (let i = 0; i < links.length; i += CONCURRENCY) {
    minimizeChrome();  // 각 배치 시작 전 숨기기
    const chunk = links.slice(i, i + CONCURRENCY);
    
    const promises = chunk.map(async (url, j) => {
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await delay(500);
        
        const data = await page.evaluate(() => {
          const title = document.querySelector('h1')?.textContent?.trim();
          if (!title) return null;
          
          let artist = 'Unknown', year = null;
          const h2s = document.querySelectorAll('h2');
          for (const h2 of h2s) {
            const text = h2.textContent.trim();
            if (text.includes('Get the app') || text.includes('Hayward') || text.length > 100) continue;
            const m = text.match(/(\d{4})$/);
            if (m) { year = m[1]; artist = text.replace(/\d{4}$/, '').trim(); }
            else { artist = text; }
            if (artist) break;
          }
          
          const html = document.documentElement.innerHTML;
          const urls = html.match(/https:\/\/lh3\.googleusercontent\.com\/ci\/[A-Za-z0-9_-]+/g) || [];
          const image = urls.length ? [...new Set(urls)].reduce((a, b) => a.length >= b.length ? a : b) + '=w800' : null;
          
          return { title, artist, year, image };
        });
        
        await page.close();
        if (!data || !data.image) return null;
        
        // 필터링은 나중에 update 스크립트에서 함 - 여기서는 모두 수집
        return {
          id: `hayward-gac-${i + j + 1}`,
          title: data.title,
          artist: data.artist,
          year: data.year ? parseInt(data.year) : null,
          image: data.image,
          sourceUrl: url
        };
      } catch (e) {
        await page.close();
        return null;
      }
    });
    
    const chunkResults = await Promise.all(promises);
    chunkResults.forEach(r => { if (r) results.push(r); });
    
    const progress = Math.min(i + CONCURRENCY, links.length);
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = Math.round(progress / elapsed * 60);
    process.stdout.write(`\r  진행: ${progress}/${links.length} | 성공: ${results.length} | ${rate}개/분`);
  }
  
  clearInterval(hideInterval);
  console.log();
  return results;
}

async function main() {
  console.log('='.repeat(50));
  console.log('⚡ Hayward Gallery - 다중 탭 병렬 스크래핑');
  console.log('='.repeat(50));

  const startTime = Date.now();

  // 1. 링크 수집
  const { links, context, browser } = await collectLinks();
  if (!links) {
    console.log('\n❌ 링크 수집 실패');
    process.exit(1);
  }

  // 2. 다중 탭으로 병렬 스크래핑
  const results = await scrapeWithBrowserTabs(context, links);
  
  await browser.close();

  // 3. 저장
  // 중복 이미지 감지 (placeholder 가능성)
  const imageCounts = {};
  results.forEach(r => {
    imageCounts[r.image] = (imageCounts[r.image] || 0) + 1;
  });
  
  // 3번 이상 중복된 이미지는 placeholder로 간주
  const placeholderImages = Object.entries(imageCounts)
    .filter(([_, count]) => count >= 3)
    .map(([url]) => url);
  
  if (placeholderImages.length > 0) {
    console.log(`\n⚠️  ${placeholderImages.length}개 placeholder 이미지 감지됨`);
  }
  
  // placeholder 이미지 제거
  const cleanResults = results.filter(r => !placeholderImages.includes(r.image));
  
  const output = {
    museum: 'Hayward Gallery',
    museumId: 'hayward-gallery',
    collectionName: 'The Collection',
    scrapedAt: new Date().toISOString(),
    totalObjects: cleanResults.length,
    coverImage: cleanResults[0]?.image || null,
    objects: cleanResults
  };

  fs.writeFileSync(JSON_PATH, JSON.stringify(output, null, 2));

  const elapsed = (Date.now() - startTime) / 1000;
  const uniqueImages = new Set(cleanResults.map(r => r.image)).size;

  console.log(`\n✅ 완료! ${cleanResults.length}개 저장 (${results.length - cleanResults.length}개 placeholder 제거)`);
  console.log(`📊 고유 이미지: ${uniqueImages}/${cleanResults.length}`);
  console.log(`⏱️  총 소요 시간: ${elapsed.toFixed(1)}초`);
}

main().catch(console.error);
