/**
 * British Museum - Google Arts & Culture 스크래핑
 * 
 * 특징:
 * 1. 2D/3D 작품 분류 (조각상, 입체조형물 vs 평면 이미지)
 * 2. 전체 작품 수집
 * 3. Playwright visible browser 사용
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const BASE_URL = 'https://artsandculture.google.com';
const PARTNER_ID = 'the-british-museum';
const JSON_PATH = path.join(__dirname, '../public/data/british-museum-gac-collection.json');
const TARGET_COUNT = 7500;   // 전체 스크래핑
const MAX_LINKS = 7500;      // 링크 수집 (전체)
const CONCURRENCY = 10;      // 동시 탭 개수

// 3D 작품 감지 패턴 (조각상, 입체조형물, 유물 등)
const PATTERNS_3D = [
  // 조각/입체
  /\bsculpture\b/i,
  /\bstatue\b/i,
  /\bstatuette\b/i,
  /\bfigurine\b/i,
  /\bbust\b/i,
  /\brelief\b/i,
  /\bhead of\b/i,
  /\bfigure of\b/i,
  /\bmodel of\b/i,

  // 유물/오브제
  /\bvase\b/i,
  /\bvessel\b/i,
  /\bjar\b/i,
  /\bbowl\b/i,
  /\bcup\b/i,
  /\bplate\b/i,
  /\bdish\b/i,
  /\bpot\b/i,
  /\burn\b/i,
  /\bamphora\b/i,
  /\bkrater\b/i,
  /\bchalice\b/i,
  /\bgoblet\b/i,

  // 무기/도구
  /\bsword\b/i,
  /\bdagger\b/i,
  /\bhelmet\b/i,
  /\bshield\b/i,
  /\barmour\b/i,
  /\barmor\b/i,
  /\baxe\b/i,
  /\bspear\b/i,

  // 장신구/보석
  /\bjewelry\b/i,
  /\bjewellery\b/i,
  /\bnecklace\b/i,
  /\bbracelet\b/i,
  /\bring\b/i,
  /\bearring\b/i,
  /\bbrooch\b/i,
  /\bamulet\b/i,
  /\bpendant\b/i,

  // 건축/석재
  /\bstele\b/i,
  /\bslab\b/i,
  /\btablet\b/i,
  /\bobelisk\b/i,
  /\bpillar\b/i,
  /\bcolumn\b/i,
  /\bsarcophagus\b/i,
  /\bcoffin\b/i,
  /\bmummy\b/i,
  /\bmask\b/i,

  // 기타 입체물
  /\bchess\b/i,
  /\bcoin\b/i,
  /\bmedal\b/i,
  /\bseal\b/i,
  /\bhorn\b/i,
  /\bivory\b/i,
  /\bbox\b/i,
  /\bcasket\b/i,
];

// 2D 작품 감지 패턴 (회화, 드로잉, 판화, 사진 등)
const PATTERNS_2D = [
  /\bpainting\b/i,
  /\bdrawing\b/i,
  /\bsketch\b/i,
  /\bprint\b/i,
  /\bengraving\b/i,
  /\betching\b/i,
  /\blithograph\b/i,
  /\bwoodcut\b/i,
  /\bwoodblock\b/i,
  /\bphotograph\b/i,
  /\bphoto\b/i,
  /\bposter\b/i,
  /\bwatercolour\b/i,
  /\bwatercolor\b/i,
  /\boil on\b/i,
  /\boil painting\b/i,
  /\bportrait of\b/i,
  /\blandscape\b/i,
  /\bseascape\b/i,
  /\bmap\b/i,
  /\bmanuscript\b/i,
  /\bscroll\b/i,
  /\bpapyrus\b/i,
  /\bfresco\b/i,
  /\bmosaic\b/i,
  /\btapestry\b/i,
  /\btextile\b/i,
];

/**
 * 작품 유형 분류 (2D/3D/unknown)
 */
function classifyArtworkType(title, description = '') {
  const text = `${title} ${description}`.toLowerCase();

  // 3D 패턴 확인
  for (const pattern of PATTERNS_3D) {
    if (pattern.test(text)) return '3D';
  }

  // 2D 패턴 확인
  for (const pattern of PATTERNS_2D) {
    if (pattern.test(text)) return '2D';
  }

  // British Museum은 대부분 3D 유물이므로 기본값은 unknown
  return 'unknown';
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// OS 감지
const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';

// Chromium 창 숨기기 (OS별 처리)
function minimizeChrome() {
  if (isMac) {
    exec(`osascript -e '
      tell application "System Events"
        set visible of process "Chromium" to false
      end tell
    '`);
  }
  // Windows/Linux에서는 아무것도 안 함 (창이 보이는 상태로 유지)
}

// Chromium 창 보이기 (CAPTCHA용)
function showChrome() {
  if (isMac) {
    exec(`osascript -e '
      tell application "System Events"
        set visible of process "Chromium" to true
        set frontmost of process "Chromium" to true
      end tell
    '`);
  }
  // Windows/Linux에서는 이미 보이는 상태
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

  // OS에 맞는 User-Agent 사용
  const userAgent = isWindows 
    ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  const context = await browser.newContext({
    userAgent,
    viewport: { width: 800, height: 600 }
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/explore/collections/${PARTNER_ID}?c=assets`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // CAPTCHA 체크
    if (page.url().includes('/sorry/')) {
      showChrome();
      console.log('\n⚠️  CAPTCHA 감지! 브라우저에서 해결해주세요...');
      const readline = require('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      await new Promise(r => rl.question('   해결 후 엔터...', () => { rl.close(); r(); }));
      await page.goto(`${BASE_URL}/explore/collections/${PARTNER_ID}?c=assets`);
    }

    // 페이지 로드 후 창 숨기기
    console.log('🔽 창 숨기는 중...');
    minimizeChrome();
    await delay(500);
    minimizeChrome();

    await delay(2000);

    // 커버 이미지 추출 (파트너 페이지 대표 이미지)
    let coverImage = null;
    try {
      const partnerImages = await page.$$eval('img[src*="lh3.googleusercontent.com"]', imgs =>
        imgs.map(img => img.src).filter(src => src.includes('/ci/'))
      );
      if (partnerImages.length > 0) {
        coverImage = partnerImages[0].replace(/=w\d+/, '=w800');
      }
    } catch (e) {
      console.log('⚠️ 커버 이미지 추출 실패');
    }

    // 스크롤하며 링크 수집 (충분히 많이)
    let links = new Set();
    let lastCount = 0;
    let stall = 0;

    while (links.size < MAX_LINKS && stall < 20) {
      const newLinks = await page.$$eval('a[href*="/asset/"]', els =>
        els.map(el => el.href).filter(h => h.includes('/asset/'))
      );
      newLinks.forEach(l => links.add(l));

      process.stdout.write(`\r  수집: ${links.size}개`);

      if (links.size === lastCount) stall++;
      else { stall = 0; lastCount = links.size; }

      if (links.size >= MAX_LINKS) break;

      await page.evaluate(() => window.scrollBy(0, 1500));
      await delay(400);
    }

    console.log(`\n✅ ${links.size}개 링크 수집 완료`);
    return { links: Array.from(links), coverImage, context, browser };

  } catch (e) {
    console.error('❌ 링크 수집 실패:', e.message);
    await browser.close();
    return { links: null, coverImage: null, context: null, browser: null };
  }
}

// 단일 작품 스크래핑 (재시도 포함)
async function scrapeOneArtwork(context, url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await delay(1500);

      const data = await page.evaluate(() => {
        const title = document.querySelector('h1')?.textContent?.trim();
        if (!title) return null;

        let artist = 'Unknown', year = null, description = '';

        const detailsList = document.querySelectorAll('li.XD0Pkb');
        for (const li of detailsList) {
          const label = li.querySelector('.PUhAff')?.textContent?.trim();
          const value = li.textContent?.replace(label, '').trim();
          if (label === 'Creator:' || label === 'Artist:') {
            artist = value || 'Unknown';
          }
          if (label === 'Date Created:' || label === 'Date:') {
            const yearMatch = value?.match(/(-?\d{3,4})/);
            if (yearMatch) {
              const parsed = parseInt(yearMatch[1]);
              year = parsed < 0 ? `${Math.abs(parsed)} BC` : parsed.toString();
            }
          }
        }

        if (artist === 'Unknown') {
          const artistSpan = document.querySelector('h2.SThaNc .QIJnJ a');
          if (artistSpan) artist = artistSpan.textContent?.trim() || 'Unknown';
        }
        if (!year) {
          const dateSpan = document.querySelector('h2.SThaNc .QtzOu');
          if (dateSpan) {
            const dateText = dateSpan.textContent?.trim();
            const yearMatch = dateText?.match(/(-?\d{3,4})/);
            if (yearMatch) {
              const parsed = parseInt(yearMatch[1]);
              year = parsed < 0 ? `${Math.abs(parsed)} BC` : parsed.toString();
            }
          }
        }

        const descEl = document.querySelector('[data-e2e="description"]') ||
          document.querySelector('p[class*="description"]');
        if (descEl) description = descEl.textContent?.trim() || '';

        let image = null;
        const artworkImg = document.querySelector('img.pmK5Xc[alt]');
        if (artworkImg) {
          let src = artworkImg.src || artworkImg.getAttribute('src');
          if (src) {
            if (src.startsWith('//')) src = 'https:' + src;
            image = src.replace(/=.*$/, '') + '=w800';
          }
        }
        if (!image) {
          const mainImgs = document.querySelectorAll('img.XkWAb-LmsqOc');
          for (const img of mainImgs) {
            const style = img.getAttribute('style') || '';
            const widthMatch = style.match(/width:\s*(\d+)px/);
            if (widthMatch && parseInt(widthMatch[1]) > 500) {
              let src = img.src;
              if (src && src.includes('/ci/')) {
                image = src.replace(/=.*$/, '') + '=w800';
                break;
              }
            }
          }
        }
        if (!image) {
          const html = document.documentElement.innerHTML;
          const urls = html.match(/https:\/\/lh3\.googleusercontent\.com\/ci\/[A-Za-z0-9_-]+/g) || [];
          const uniqueUrls = [...new Set(urls)];
          const excludePatterns = [
            'S9UmXMpi82NK0N5Rw', 'QAnGvTSvY-4jcYFsH', 'Sert5cWS5rpIFPxfL',
            'QGhrBaDtpX0drg9gR', 'RPbMPWkTYOZeNeB8f', 'TJo320t-DECDnuenw',
            'SnJmGx4puvvCHiDK0', 'RIs35WL017yubssKr', 'TuJf7RbhoCB7Raf1o',
          ];
          const filtered = uniqueUrls.filter(u => !excludePatterns.some(p => u.includes(p)));
          if (filtered.length > 0) {
            image = filtered.reduce((a, b) => a.length >= b.length ? a : b) + '=w800';
          }
        }

        return { title, artist, year, description, image };
      });

      await page.close();
      return { success: true, data, url };
    } catch (e) {
      await page.close();
      if (attempt === maxRetries) {
        return { success: false, data: null, url };
      }
      await delay(1000 * attempt);  // 점점 길게 대기
    }
  }
  return { success: false, data: null, url };
}

async function scrapeWithBrowserTabs(context, links, targetCount) {
  console.log(`\n🚀 ${links.length}개 링크에서 작품 수집 시작...`);

  const results = [];
  const usedImages = new Set();  // 중복 이미지 체크
  const processedUrls = new Set();  // 처리 완료된 URL
  const failedUrls = [];  // 실패한 URL (재시도용)
  const startTime = Date.now();

  const hideInterval = setInterval(minimizeChrome, 500);
  minimizeChrome();

  // 결과 처리 함수
  const processResult = (result) => {
    if (!result.success || !result.data || !result.data.image) {
      if (!result.success) failedUrls.push(result.url);
      return false;
    }

    const data = result.data;
    if (usedImages.has(data.image)) return false;  // 중복 이미지 스킵

    usedImages.add(data.image);
    const artworkType = classifyArtworkType(data.title, data.description);

    let cleanTitle = data.title
      .replace(/\s*\(\d{3,4}\s*BC?\)$/i, '')
      .replace(/\s*\(-?\d{3,4}\/-?\d{0,4}\)$/i, '')
      .replace(/\s*,\s*\d{3,4}\s*BC?$/i, '')
      .replace(/\s*\d{3,4}\s*BC?$/i, '')
      .trim();

    let yearValue = data.year;
    if (yearValue && !String(yearValue).includes('BC')) {
      const parsed = parseInt(String(yearValue).replace(/\D/g, ''));
      yearValue = isNaN(parsed) ? null : parsed;
    }

    results.push({
      id: `bm-gac-${results.length + 1}`,
      title: cleanTitle,
      artist: data.artist === 'Additional Items' ? 'Unknown' : data.artist,
      year: yearValue,
      image: data.image,
      type: artworkType,
      sourceUrl: ''
    });
    return true;
  };

  // 1차 스크래핑: 모든 링크 처리
  let linkIndex = 0;
  while (linkIndex < links.length) {
    minimizeChrome();

    const batchSize = Math.min(CONCURRENCY, links.length - linkIndex);
    const chunk = links.slice(linkIndex, linkIndex + batchSize);
    linkIndex += batchSize;

    const promises = chunk.map(url => {
      processedUrls.add(url);
      return scrapeOneArtwork(context, url, 2);  // 2번 재시도
    });

    const chunkResults = await Promise.all(promises);
    chunkResults.forEach(processResult);

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = Math.round(linkIndex / elapsed * 60);
    process.stdout.write(`\r  1차: ${linkIndex}/${links.length} | 성공: ${results.length} | 실패: ${failedUrls.length} | ${rate}개/분    `);
  }

  console.log();

  // 2차 재시도: 실패한 링크들 재처리 (최대 3라운드)
  let retryRound = 0;
  while (failedUrls.length > 0 && retryRound < 3) {
    retryRound++;
    const toRetry = [...failedUrls];
    failedUrls.length = 0;  // 비우기

    console.log(`\n🔄 ${retryRound}차 재시도: ${toRetry.length}개...`);

    let retryIndex = 0;
    while (retryIndex < toRetry.length) {
      minimizeChrome();

      const batchSize = Math.min(CONCURRENCY, toRetry.length - retryIndex);
      const chunk = toRetry.slice(retryIndex, retryIndex + batchSize);
      retryIndex += batchSize;

      const promises = chunk.map(url => scrapeOneArtwork(context, url, 3));  // 3번 재시도
      const chunkResults = await Promise.all(promises);
      chunkResults.forEach(processResult);

      process.stdout.write(`\r  재시도: ${retryIndex}/${toRetry.length} | 성공: ${results.length} | 남은 실패: ${failedUrls.length}    `);
    }
    console.log();
  }

  clearInterval(hideInterval);

  if (failedUrls.length > 0) {
    console.log(`\n⚠️  최종 실패: ${failedUrls.length}개 (재시도 후에도 실패)`);
  }

  console.log(`\n✅ 총 ${results.length}개 작품 수집 완료`);
  return results;
}

async function main() {
  console.log('='.repeat(60));
  console.log('🏛️  British Museum - Google Arts & Culture 스크래핑');
  console.log(`   (2D/3D 분류 포함, 전체 작품 수집)`);
  console.log('='.repeat(60));

  const startTime = Date.now();

  // 1. 링크 수집 (모두)
  const { links, coverImage, context, browser } = await collectLinks();
  if (!links) {
    console.log('\n❌ 링크 수집 실패');
    process.exit(1);
  }

  // 2. 모든 링크 스크래핑 (재시도 포함)
  const results = await scrapeWithBrowserTabs(context, links, links.length);

  await browser.close();

  // 3. 통계 (이미 중복 제거됨)
  const stats = {
    total: results.length,
    type2D: results.filter(r => r.type === '2D').length,
    type3D: results.filter(r => r.type === '3D').length,
    typeUnknown: results.filter(r => r.type === 'unknown').length,
  };

  // 4. 저장
  const output = {
    museum: 'British Museum',
    museumId: 'british-museum',
    collectionName: 'The Collection',
    partnerUrl: `${BASE_URL}/partner/${PARTNER_ID}`,
    scrapedAt: new Date().toISOString(),
    totalObjects: results.length,
    coverImage: coverImage || results[0]?.image || null,
    stats: stats,
    objects: results
  };

  fs.writeFileSync(JSON_PATH, JSON.stringify(output, null, 2));

  const elapsed = (Date.now() - startTime) / 1000;

  console.log('\n' + '='.repeat(60));
  console.log('✅ 완료!');
  console.log(`📊 총 작품: ${results.length}개`);
  console.log(`   - 2D (회화/사진 등): ${stats.type2D}개`);
  console.log(`   - 3D (조각/유물 등): ${stats.type3D}개`);
  console.log(`   - 미분류: ${stats.typeUnknown}개`);
  console.log(`⏱️  총 소요 시간: ${elapsed.toFixed(1)}초`);
  console.log(`💾 저장: ${JSON_PATH}`);
  console.log('='.repeat(60));
}

main().catch(console.error);
