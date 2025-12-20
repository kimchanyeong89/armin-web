/**
 * Google Arts & Culture - 3개 미술관 연속 스크래핑
 * Royal Academy of Arts, Serpentine Gallery, The Courtauld
 * 
 * - 한번의 CAPTCHA 해결 후 3개 연속 스크래핑
 * - placeholder 이미지 자동 감지/재스크래핑
 * - 누락 없는 완전 수집
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { exec } = require('child_process');

const BASE_URL = 'https://artsandculture.google.com';
const OUTPUT_DIR = path.join(__dirname, '../public/data');
const CONCURRENCY = 12;

// 스크래핑할 3개 갤러리
const GALLERIES = [
  {
    id: 'royal-academy',
    name: 'Royal Academy of Arts',
    slug: 'royal-academy-of-arts',
    url: 'https://artsandculture.google.com/explore/collections/royal-academy-of-arts?c=assets',
    maxItems: 2000,
    excludePatterns: [
      /installation view/i,
      /exhibition view/i,
      /gallery view/i,
      /archive photo/i,
      /photograph of/i,
      /private view/i,
      /press clipping/i,
      /catalogue for/i,
      /building exterior/i,
      /royal academy schools/i,
      /admission ticket/i,
    ]
  },
  {
    id: 'serpentine-gallery',
    name: 'Serpentine Galleries',
    slug: 'serpentine-gallery',
    url: 'https://artsandculture.google.com/explore/collections/serpentine-gallery?c=assets',
    maxItems: 1500,
    excludePatterns: [
      /installation view/i,
      /exhibition view/i,
      /gallery view/i,
      /press release/i,
      /poster for/i,
      /invitation/i,
      /building exterior/i,
      /pavilion exterior/i,
    ]
  },
  {
    id: 'courtauld-gallery',
    name: 'The Courtauld Gallery',
    slug: 'the-courtauld',
    url: 'https://artsandculture.google.com/explore/collections/the-courtauld?c=assets',
    maxItems: 3000,
    excludePatterns: [
      /gallery view/i,
      /installation view/i,
      /exhibition guide/i,
      /building exterior/i,
      /somerset house/i,
    ]
  }
];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// 제목에서 년도 제거 (별도 필드가 있으므로)
function cleanTitle(title) {
  if (!title) return title;
  // 끝에 4자리 연도 제거
  return title.replace(/\s*\(\d{4}\)\s*$/, '')
              .replace(/\s*,\s*\d{4}\s*$/, '')
              .replace(/\s+\d{4}\s*$/, '')
              .trim();
}

// macOS에서 Chromium 창 숨기기
function minimizeChrome() {
  exec(`osascript -e '
    tell application "System Events"
      set visible of process "Chromium" to false
    end tell
  '`);
}

// Chromium 창 보이기
function showChrome() {
  exec(`osascript -e '
    tell application "System Events"
      set visible of process "Chromium" to true
      set frontmost of process "Chromium" to true
    end tell
  '`);
}

async function askUser(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(question, () => { rl.close(); r(); }));
}

// 페이지에서 작품 링크 수집
async function collectLinks(page, gallery) {
  console.log(`\n📡 ${gallery.name}: 링크 수집 중...`);
  
  await page.goto(gallery.url, {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  
  // CAPTCHA 체크
  if (page.url().includes('/sorry/')) {
    showChrome();
    console.log('\n⚠️  CAPTCHA 감지! 브라우저에서 해결해주세요...');
    await askUser('   해결 후 엔터 키를 누르세요...');
    await page.goto(gallery.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  
  minimizeChrome();
  await delay(2000);
  
  let links = new Set();
  let lastCount = 0;
  let stall = 0;
  const maxStall = 15;
  
  while (links.size < gallery.maxItems && stall < maxStall) {
    const newLinks = await page.$$eval('a[href*="/asset/"]', els => 
      els.map(el => el.href).filter(h => h.includes('/asset/'))
    );
    newLinks.forEach(l => links.add(l));
    
    process.stdout.write(`\r  수집: ${links.size}개`);
    
    if (links.size === lastCount) stall++;
    else { stall = 0; lastCount = links.size; }
    
    await page.evaluate(() => window.scrollBy(0, 1500));
    await delay(400);
  }
  
  console.log(`\n✅ ${links.size}개 링크 수집 완료`);
  return Array.from(links);
}

// 작품 상세 정보 스크래핑
async function scrapeArtwork(context, url, gallery, index) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await delay(500);
    
    const data = await page.evaluate((galleryName) => {
      const title = document.querySelector('h1')?.textContent?.trim();
      if (!title) return null;
      
      let artist = 'Unknown', year = null;
      
      // h2 태그에서 아티스트/연도 추출
      const h2s = document.querySelectorAll('h2');
      for (const h2 of h2s) {
        const text = h2.textContent.trim();
        if (text.includes('Get the app') || text.length > 150) continue;
        if (text.toLowerCase().includes(galleryName.toLowerCase())) continue;
        
        // 연도 추출 (끝에 4자리 숫자)
        const yearMatch = text.match(/(\d{4})(?:\s*[-–]\s*\d{4})?\s*$/);
        if (yearMatch) {
          year = yearMatch[1];
          artist = text.replace(/\s*\d{4}(?:\s*[-–]\s*\d{4})?\s*$/, '').trim();
        } else {
          artist = text;
        }
        if (artist && artist !== 'Unknown') break;
      }
      
      // 이미지 URL 추출
      const html = document.documentElement.innerHTML;
      const urls = html.match(/https:\/\/lh3\.googleusercontent\.com\/ci\/[A-Za-z0-9_-]+/g) || [];
      const image = urls.length ? [...new Set(urls)].reduce((a, b) => a.length >= b.length ? a : b) + '=w800' : null;
      
      return { title, artist, year, image };
    }, gallery.name);
    
    await page.close();
    
    if (!data || !data.image) return null;
    
    // 비작품 필터링
    for (const pattern of gallery.excludePatterns) {
      if (pattern.test(data.title)) return null;
    }
    
    return {
      id: `${gallery.id}-gac-${index + 1}`,
      title: cleanTitle(data.title),
      artist: data.artist,
      year: data.year ? parseInt(data.year) : null,
      image: data.image,
      sourceUrl: url
    };
  } catch (e) {
    await page.close();
    return null;
  }
}

// 병렬 스크래핑
async function scrapeAllArtworks(context, links, gallery) {
  console.log(`\n🚀 ${gallery.name}: ${links.length}개 병렬 스크래핑 (${CONCURRENCY}개 탭)...`);
  
  const results = [];
  const failed = [];
  const startTime = Date.now();
  
  const hideInterval = setInterval(minimizeChrome, 500);
  
  for (let i = 0; i < links.length; i += CONCURRENCY) {
    minimizeChrome();
    const chunk = links.slice(i, i + CONCURRENCY);
    
    const promises = chunk.map((url, j) => 
      scrapeArtwork(context, url, gallery, i + j)
        .then(r => {
          if (r) results.push(r);
          else failed.push({ url, index: i + j });
          return r;
        })
    );
    
    await Promise.all(promises);
    
    const progress = Math.min(i + CONCURRENCY, links.length);
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = Math.round(progress / elapsed * 60);
    process.stdout.write(`\r  진행: ${progress}/${links.length} | 성공: ${results.length} | ${rate}개/분`);
  }
  
  clearInterval(hideInterval);
  console.log();
  
  return { results, failed };
}

// placeholder 이미지 감지 및 제거
function detectPlaceholders(results) {
  const imageCounts = {};
  results.forEach(r => {
    imageCounts[r.image] = (imageCounts[r.image] || 0) + 1;
  });
  
  // 3번 이상 중복된 이미지는 placeholder로 간주
  const placeholderImages = Object.entries(imageCounts)
    .filter(([_, count]) => count >= 3)
    .map(([url]) => url);
  
  if (placeholderImages.length > 0) {
    console.log(`⚠️  ${placeholderImages.length}개 placeholder 이미지 감지됨`);
  }
  
  return results.filter(r => !placeholderImages.includes(r.image));
}

// 실패한 항목 재시도
async function retryFailed(context, failed, gallery, maxRetries = 3) {
  if (failed.length === 0) return [];
  
  console.log(`\n🔄 ${failed.length}개 실패 항목 재시도...`);
  
  let toRetry = failed;
  let recovered = [];
  
  for (let retry = 0; retry < maxRetries && toRetry.length > 0; retry++) {
    console.log(`   시도 ${retry + 1}/${maxRetries}: ${toRetry.length}개`);
    
    const results = [];
    const stillFailed = [];
    
    for (const item of toRetry) {
      const result = await scrapeArtwork(context, item.url, gallery, item.index);
      if (result) results.push(result);
      else stillFailed.push(item);
      await delay(200);
    }
    
    recovered = recovered.concat(results);
    toRetry = stillFailed;
    
    if (stillFailed.length > 0) {
      await delay(2000);
    }
  }
  
  console.log(`   ✅ ${recovered.length}개 복구 완료, ${toRetry.length}개 최종 실패`);
  return recovered;
}

// 미술관 정보에서 대표 이미지 추출
async function getGalleryCoverImage(page, gallery) {
  console.log(`\n🖼️  ${gallery.name}: 대표 이미지 추출...`);
  
  await page.goto(gallery.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await delay(2000);
  
  const coverImage = await page.evaluate((galleryName) => {
    // 헤더 영역에서 대표 이미지 찾기
    const imgs = Array.from(document.querySelectorAll('img'));
    
    // 배경 이미지나 큰 헤더 이미지 찾기
    for (const img of imgs) {
      const src = img.src || '';
      const alt = (img.alt || '').toLowerCase();
      
      // Google 아이콘이나 작은 이미지 제외
      if (src.includes('googleusercontent.com/ci/') && 
          !src.includes('=s') && 
          img.naturalWidth > 200) {
        // 기관 관련 이미지 우선
        if (alt.includes(galleryName.toLowerCase().split(' ')[0])) {
          return src.split('=')[0] + '=w1200';
        }
      }
    }
    
    // 첫 번째 큰 이미지 반환
    for (const img of imgs) {
      const src = img.src || '';
      if (src.includes('googleusercontent.com/ci/') && img.naturalWidth > 300) {
        return src.split('=')[0] + '=w1200';
      }
    }
    
    return null;
  }, gallery.name);
  
  return coverImage;
}

// 결과 저장
function saveResults(gallery, results, coverImage) {
  const outputPath = path.join(OUTPUT_DIR, `${gallery.id}-collection.json`);
  
  const output = {
    museum: gallery.name,
    museumId: gallery.id,
    collectionName: 'The Collection',
    scrapedAt: new Date().toISOString(),
    totalObjects: results.length,
    coverImage: coverImage || (results[0]?.image || null),
    objects: results
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`💾 ${outputPath} 저장 완료`);
  
  return output;
}

// 검증 보고서
function printReport(gallery, results) {
  const uniqueImages = new Set(results.map(r => r.image)).size;
  const withYear = results.filter(r => r.year).length;
  const unknownArtist = results.filter(r => r.artist === 'Unknown').length;
  
  console.log(`\n📊 ${gallery.name} 최종 보고서:`);
  console.log(`   - 총 작품: ${results.length}개`);
  console.log(`   - 고유 이미지: ${uniqueImages}개`);
  console.log(`   - 연도 정보: ${withYear}개 (${(withYear/results.length*100).toFixed(1)}%)`);
  console.log(`   - Unknown 아티스트: ${unknownArtist}개`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('🎨 Google Arts & Culture - 3개 미술관 연속 스크래핑');
  console.log('   Royal Academy | Serpentine | The Courtauld');
  console.log('='.repeat(60));
  
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--window-position=100,100',
      '--window-size=900,700'
    ]
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 900, height: 700 }
  });
  
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  
  const mainPage = await context.newPage();
  
  // 첫 번째 갤러리로 이동하여 CAPTCHA 확인
  console.log('\n🌐 첫 번째 갤러리로 이동하여 CAPTCHA 확인...');
  await mainPage.goto(GALLERIES[0].url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  
  if (mainPage.url().includes('/sorry/')) {
    showChrome();
    console.log('\n' + '='.repeat(50));
    console.log('⚠️  CAPTCHA 감지!');
    console.log('   브라우저에서 CAPTCHA를 해결해주세요.');
    console.log('   해결 후 엔터 키를 누르면 3개 갤러리를 연속 스크래핑합니다.');
    console.log('='.repeat(50));
    await askUser('\n   준비되면 엔터...');
  }
  
  minimizeChrome();
  
  const allResults = {};
  const totalStartTime = Date.now();
  
  // 3개 갤러리 순차 스크래핑
  for (const gallery of GALLERIES) {
    console.log('\n' + '━'.repeat(50));
    console.log(`🏛️  ${gallery.name} 스크래핑 시작`);
    console.log('━'.repeat(50));
    
    const startTime = Date.now();
    
    // 1. 링크 수집
    const links = await collectLinks(mainPage, gallery);
    
    // 2. 대표 이미지 추출
    const coverImage = await getGalleryCoverImage(mainPage, gallery);
    
    // 3. 작품 스크래핑
    const { results, failed } = await scrapeAllArtworks(context, links, gallery);
    
    // 4. 실패 항목 재시도
    const recovered = await retryFailed(context, failed, gallery);
    const allArtworks = [...results, ...recovered];
    
    // 5. placeholder 제거
    const cleanResults = detectPlaceholders(allArtworks);
    
    // 6. 저장
    const output = saveResults(gallery, cleanResults, coverImage);
    allResults[gallery.id] = output;
    
    // 7. 보고서
    printReport(gallery, cleanResults);
    
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`⏱️  소요 시간: ${Math.round(elapsed)}초`);
    
    // 다음 갤러리 전 대기
    if (gallery !== GALLERIES[GALLERIES.length - 1]) {
      console.log('\n⏳ 3초 후 다음 갤러리로 이동...');
      await delay(3000);
    }
  }
  
  await browser.close();
  
  // 최종 요약
  const totalElapsed = (Date.now() - totalStartTime) / 1000;
  console.log('\n' + '='.repeat(60));
  console.log('🎉 전체 스크래핑 완료!');
  console.log('='.repeat(60));
  
  for (const gallery of GALLERIES) {
    const result = allResults[gallery.id];
    console.log(`   ${gallery.name}: ${result.totalObjects}개`);
  }
  
  const totalArtworks = Object.values(allResults).reduce((sum, r) => sum + r.totalObjects, 0);
  console.log(`\n   📊 총 작품 수: ${totalArtworks}개`);
  console.log(`   ⏱️  총 소요 시간: ${Math.round(totalElapsed / 60)}분 ${Math.round(totalElapsed % 60)}초`);
}

main().catch(console.error);
