/**
 * Google Arts & Culture 스크래핑 - 개선 버전
 * 
 * 개선 사항:
 * 1. 실패 항목을 별도로 기록 (excluded vs failed)
 * 2. 제외된 항목은 "excluded" 로그에 기록
 * 3. 이미지 로딩 실패 시 재시도 (순차 처리, 5초 타임아웃, 3회 시도)
 * 4. 최종 실패 항목 별도 저장
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const LOG_DIR = path.join(__dirname, '../downloads');
const CONCURRENCY = 12;

// 스크래핑할 3개 갤러리
const GALLERIES = [
  {
    id: 'royal-academy',
    name: 'Royal Academy of Arts',
    slug: 'royal-academy-of-arts',
    url: 'https://artsandculture.google.com/explore/collections/royal-academy-of-arts?c=assets',
    maxItems: 3000,
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
    maxItems: 2000,
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

// 제목 정리 (스크래핑용 - 간단한 버전)
function cleanTitle(title) {
  if (!title) return title;
  return title
    // "(pl.[31]) (1821)", "(pl.[31])" 패턴 제거
    .replace(/\s*\(pl\.?\s*\[?\d+\]?\)\s*\(\d{4}\)\s*$/i, '')
    .replace(/\s*\(pl\.?\s*\[?\d+\]?\)\s*$/i, '')
    .replace(/,\s*pl\.?\s*\[?\d+\]?\s*\(\d{4}\)\s*$/i, '')
    .replace(/,\s*pl\.?\s*\[?\d+\]?\s*$/i, '')
    .replace(/\s*\[Pl\.\s*\d+\]\.?\s*\(\d{4}\)\s*$/i, '')
    .replace(/\s*\[Pl\.\s*\d+\]\s*$/i, '')
    // 끝에 중복된 년도 패턴 제거
    .replace(/,?\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)?\s*\d{4}\.?\s*\(\d{4}\)\s*$/i, '')
    .replace(/\s*\(\d{4}(?:\s*[-–]\s*\d{2,4})?\)\s*$/, '')
    .replace(/\s*,\s*\d{4}(?:\s*[-–]\s*\d{2,4})?\s*$/, '')
    .replace(/\s+\d{4}(?:\s*[-–]\s*\d{2,4})?\s*$/, '')
    .replace(/\s*\(\s*c\.\s*\d{4}(?:\s*[-–]\s*\d{2,4})?\)\s*$/, '')
    .replace(/,?\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\.?\s*$/i, '')
    // "(maker unknown)" 패턴 정리
    .replace(/\s*\(maker\s+unknown\)\s*/gi, ' ')
    .replace(/[,\.]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 작가 이름 정리 (정교한 버전)
function cleanArtist(artist) {
  if (!artist || artist === 'Unknown') return 'Unknown';
  
  // 월 이름만 있는 경우 무효
  const monthOnlyPattern = /^(?:\d{1,2}(?:st|nd|rd|th)?\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{1,2}(?:st|nd|rd|th)?)?$/i;
  if (monthOnlyPattern.test(artist.trim())) return 'Unknown';
  
  // "from the ..." 로 시작하는 경우 Unknown
  if (/^from\s+the\s+/i.test(artist.trim())) return 'Unknown';
  
  // "(maker unknown)" 포함된 경우 Unknown
  if (/\(maker\s+unknown\)/i.test(artist)) return 'Unknown';
  
  // "After unidentified..." 패턴 → Unknown
  if (/^After\s+unidentified/i.test(artist.trim())) return 'Unknown';
  
  return artist
    // 공백 없이 붙은 세기 패턴 분리
    .replace(/(\w)\d{1,2}(?:st|nd|rd|th)?-century.*$/i, '$1')
    // 매체 정보 제거
    .replace(/\s*\d{1,2}(?:st|nd|rd|th)?-century\s+(?:plaster|bronze|marble)\s+cast.*$/i, '')
    .replace(/,?\s*made\s+from\s+.*$/i, '')
    // "Design by X" → "X"
    .replace(/^Design\s+by\s+/i, '')
    .replace(/^Designed\s+by\s+/i, '')
    .replace(/^Photographed\s+by\s+/i, '')
    .replace(/^Published\s+by\s+/i, '')
    .replace(/^Original\s+attributed\s+to\s+/i, '')
    // 날짜 패턴 제거
    .replace(/\s*\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s*$/i, '')
    .replace(/\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?\s*$/i, '')
    // 년도 패턴 제거
    .replace(/\d{4}(?:\s*[-–;\/,]\s*\d{2,4})*\s*$/, '')
    .replace(/c(?:a)?\.?\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)?\s*$/i, '')
    .replace(/c\.\s*\d{4}(?:\s*[-–]\s*\d{2,4})?\s*$/i, '')
    .replace(/c\.\s*$/i, '')
    .replace(/^\s*\d{4}(?:\s*[-–;\/,]\s*\d{2,4})*\s*/, '')
    // 세기 패턴 제거
    .replace(/\s*(?:late|early|mid)?\s*\d{1,2}(?:st|nd|rd|th)\s+century(?:\/early\s+\d{1,2}(?:st|nd|rd|th)\s+century)?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[;\/,\?\.]\s*$/, '')
    .replace(/^\s*[;\/,]\s*/, '')
    .trim() || 'Unknown';
}

function minimizeChrome() {
  exec(`osascript -e 'tell application "System Events" to set visible of process "Chromium" to false'`);
}

// 링크 수집 (더 철저하게)
async function collectLinks(page, gallery) {
  console.log(`\n🔗 ${gallery.name}: 링크 수집 중...`);
  
  await page.goto(gallery.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await delay(3000);
  
  let links = new Set();
  let lastCount = 0;
  let stall = 0;
  const maxStall = 20; // 더 많이 기다림
  
  while (links.size < gallery.maxItems && stall < maxStall) {
    const newLinks = await page.$$eval('a[href*="/asset/"]', els => 
      els.map(el => el.href).filter(h => h.includes('/asset/'))
    );
    newLinks.forEach(l => links.add(l));
    
    process.stdout.write(`\r  수집: ${links.size}개 (stall: ${stall}/${maxStall})`);
    
    if (links.size === lastCount) stall++;
    else { stall = 0; lastCount = links.size; }
    
    await page.evaluate(() => window.scrollBy(0, 2000));
    await delay(300);
  }
  
  console.log(`\n✅ ${links.size}개 링크 수집 완료`);
  return Array.from(links);
}

// 알려진 placeholder 이미지 URL 패턴 (피해야 할 URL)
const KNOWN_PLACEHOLDER_PATTERNS = [
  'iC3zV1pGjsk_YgaXox-UgkoTOpjFWoa6lHuFjcPdXLDI0cMLo0', // RA 로고
  'g56tQNK9QD9eSxNFSVVfn4nTyP1tiNbej4Zoxk_6D_Jdx-VIxE', // RA 로고 변형
  'IpcRSKiLIBTs8lOp2lkZ_9iwKlr1MUiE_MiQw8wOUu1GVzw7S4', // RA 로고 변형
];

// 작품 상세 정보 스크래핑 (결과 구분: success, excluded, failed)
// waitForRealImage: true면 placeholder가 아닌 실제 이미지가 로드될 때까지 대기
async function scrapeArtwork(context, url, gallery, index, timeout = 15000, waitForRealImage = false) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    
    // waitForRealImage 모드: 실제 이미지가 로드될 때까지 더 오래 대기
    if (waitForRealImage) {
      await delay(2000); // 2초 대기
      // 이미지 요소가 로드될 때까지 기다림
      try {
        await page.waitForSelector('img[src*="lh3.googleusercontent.com"]', { timeout: 5000 });
        await delay(1000); // 이미지 로드 후 추가 대기
      } catch (e) {
        // 타임아웃 무시
      }
    } else {
      await delay(500);
    }
    
    const data = await page.evaluate((galleryName, placeholderPatterns) => {
      const title = document.querySelector('h1')?.textContent?.trim();
      if (!title) return { error: 'no_title' };
      
      let artist = 'Unknown', year = null, medium = null, artworkType = null;
      
      // 1. JSON-LD 구조화 데이터에서 먼저 추출 시도 (가장 정확)
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of jsonLdScripts) {
        try {
          const jsonData = JSON.parse(script.textContent);
          if (jsonData.author?.name && artist === 'Unknown') {
            artist = jsonData.author.name;
          }
          if (jsonData.dateCreated && !year) {
            const yMatch = jsonData.dateCreated.match(/(\d{4})/);
            if (yMatch) year = yMatch[1];
          }
          if (jsonData['@type']) {
            artworkType = jsonData['@type'];
          }
        } catch (e) {}
      }
      
      // 2. h2 태그에서 작가/년도 추출 (JSON-LD가 없는 경우)
      if (artist === 'Unknown') {
        const h2s = document.querySelectorAll('h2');
        for (const h2 of h2s) {
          const text = h2.textContent.trim();
          if (text.includes('Get the app') || text.length > 150) continue;
          if (text.toLowerCase().includes(galleryName.toLowerCase())) continue;
          
          // 월 이름만 있는 경우 스킵 (잘못된 작가 정보)
          const monthOnlyPattern = /^(?:\d{1,2}(?:st|nd|rd|th)?\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{1,2}(?:st|nd|rd|th)?)?$/i;
          if (monthOnlyPattern.test(text)) continue;
          
          // 세기/매체 정보만 있는 경우 스킵
          if (/^\d{1,2}(?:st|nd|rd|th)?[\s-]+century/i.test(text)) continue;
          if (/^(?:plaster|bronze|marble)\s+cast/i.test(text)) continue;
          
          const yearMatch = text.match(/(\d{4})(?:\s*[-–]\s*\d{4})?\s*$/);
          if (yearMatch) {
            if (!year) year = yearMatch[1];
            const possibleArtist = text.replace(/\s*\d{4}(?:\s*[-–]\s*\d{4})?\s*$/, '').trim();
            if (possibleArtist && possibleArtist.length > 2) {
              artist = possibleArtist;
            }
          } else if (text.length > 2 && text.length < 100) {
            artist = text;
          }
          if (artist && artist !== 'Unknown') break;
        }
      }
      
      const html = document.documentElement.innerHTML;
      let urls = html.match(/https:\/\/lh3\.googleusercontent\.com\/ci\/[A-Za-z0-9_-]+/g) || [];
      
      // 중복 제거 후 가장 긴 URL 선택 (일반적으로 실제 이미지)
      const uniqueUrls = [...new Set(urls)];
      const image = uniqueUrls.length ? uniqueUrls.reduce((a, b) => a.length >= b.length ? a : b) + '=w800' : null;
      
      // YouTube 영상 감지 - iframe src에서 YouTube ID 추출
      let youtubeId = null;
      const youtubeIframes = document.querySelectorAll('iframe[src*="youtube.com/embed"]');
      if (youtubeIframes.length > 0) {
        const src = youtubeIframes[0].src;
        const match = src.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
        if (match) youtubeId = match[1];
      }
      // iframe이 없으면 HTML에서 YouTube ID 찾기
      if (!youtubeId) {
        const ytMatch = html.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
        if (ytMatch) youtubeId = ytMatch[1];
      }
      
      return { title, artist, year, image, youtubeId };
    }, gallery.name);
    
    await page.close();
    
    // 타이틀 없음
    if (data.error === 'no_title') {
      return { status: 'failed', reason: 'no_title', url, index };
    }
    
    // 이미지 없음
    if (!data.image) {
      return { status: 'failed', reason: 'no_image', url, index, title: data.title };
    }
    
    // 제외 패턴 체크
    for (const pattern of gallery.excludePatterns) {
      if (pattern.test(data.title)) {
        return { 
          status: 'excluded', 
          reason: pattern.toString(), 
          url, 
          index, 
          title: data.title 
        };
      }
    }
    
    // 성공
    const artwork = {
      id: `${gallery.id}-gac-${index + 1}`,
      title: cleanTitle(data.title),
      artist: cleanArtist(data.artist),
      year: data.year ? parseInt(data.year) : null,
      image: data.image,
      sourceUrl: url
    };
    
    // YouTube 영상인 경우 youtubeId 추가
    if (data.youtubeId) {
      artwork.youtubeId = data.youtubeId;
      artwork.mediaType = 'video';
    }
    
    return {
      status: 'success',
      data: artwork
    };
  } catch (e) {
    await page.close();
    return { status: 'failed', reason: 'error', error: e.message, url, index };
  }
}

// 1차 병렬 스크래핑
async function scrapeAllArtworks(context, links, gallery) {
  console.log(`\n🚀 ${gallery.name}: ${links.length}개 1차 스크래핑 (${CONCURRENCY}개 병렬)...`);
  
  const results = { success: [], excluded: [], failed: [] };
  const startTime = Date.now();
  
  const hideInterval = setInterval(minimizeChrome, 500);
  
  for (let i = 0; i < links.length; i += CONCURRENCY) {
    minimizeChrome();
    const chunk = links.slice(i, i + CONCURRENCY);
    
    const promises = chunk.map((url, j) => 
      scrapeArtwork(context, url, gallery, i + j)
    );
    
    const chunkResults = await Promise.all(promises);
    
    for (const r of chunkResults) {
      if (r.status === 'success') results.success.push(r.data);
      else if (r.status === 'excluded') results.excluded.push(r);
      else results.failed.push(r);
    }
    
    const progress = Math.min(i + CONCURRENCY, links.length);
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = Math.round(progress / elapsed * 60);
    process.stdout.write(`\r  진행: ${progress}/${links.length} | 성공: ${results.success.length} | 제외: ${results.excluded.length} | 실패: ${results.failed.length} | ${rate}개/분`);
  }
  
  clearInterval(hideInterval);
  console.log();
  
  return results;
}

// 2차 재시도: 순차 처리, 5초 타임아웃, 3회 시도
async function retryFailed(context, failed, gallery) {
  if (failed.length === 0) return { recovered: [], stillFailed: [] };
  
  console.log(`\n🔄 ${failed.length}개 실패 항목 재시도 (순차 처리, 5초 타임아웃, 최대 3회)...`);
  
  const recovered = [];
  const stillFailed = [];
  
  for (let i = 0; i < failed.length; i++) {
    const item = failed[i];
    let success = false;
    
    process.stdout.write(`\r  [${i + 1}/${failed.length}] 시도 중: ${item.title || item.url.slice(-30)}...`);
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await scrapeArtwork(context, item.url, gallery, item.index, 5000);
      
      if (result.status === 'success') {
        recovered.push(result.data);
        success = true;
        process.stdout.write(` ✅ (${attempt}차 성공)\n`);
        break;
      } else if (result.status === 'excluded') {
        // 재시도 중 제외 패턴에 걸림
        stillFailed.push({ ...item, finalReason: 'excluded', pattern: result.reason });
        success = true; // 더 이상 시도 안함
        process.stdout.write(` 🚫 제외됨\n`);
        break;
      }
      
      // 실패 - 다음 시도 전 잠시 대기
      if (attempt < 3) {
        await delay(1000);
      }
    }
    
    if (!success) {
      stillFailed.push({ ...item, finalReason: 'max_retries', attempts: 3 });
      process.stdout.write(` ❌ 3회 실패\n`);
    }
  }
  
  console.log(`   ✅ 복구: ${recovered.length}개, 최종 실패: ${stillFailed.length}개`);
  return { recovered, stillFailed };
}

// Placeholder 감지: 동일 이미지가 여러 번 나타나거나 알려진 패턴
function detectPlaceholderUrls(results) {
  const imageCounts = {};
  results.forEach(r => {
    const baseUrl = r.image.replace(/=w\d+$/, '');
    imageCounts[baseUrl] = (imageCounts[baseUrl] || 0) + 1;
  });
  
  // 3번 이상 중복된 이미지 URL = placeholder
  const placeholderUrls = Object.entries(imageCounts)
    .filter(([url, count]) => {
      // 3번 이상 중복
      if (count >= 3) return true;
      // 알려진 placeholder 패턴
      for (const pattern of KNOWN_PLACEHOLDER_PATTERNS) {
        if (url.includes(pattern)) return true;
      }
      return false;
    })
    .map(([url]) => url);
  
  return placeholderUrls;
}

// Placeholder를 가진 작품들을 재시도 대상으로 분리
function separatePlaceholders(results, placeholderUrls) {
  const clean = [];
  const needRetry = [];
  
  for (const r of results) {
    const baseUrl = r.image.replace(/=w\d+$/, '');
    if (placeholderUrls.includes(baseUrl)) {
      needRetry.push({
        url: r.sourceUrl,
        index: parseInt(r.id.split('-').pop()) - 1,
        title: r.title,
        reason: 'placeholder'
      });
    } else {
      clean.push(r);
    }
  }
  
  return { clean, needRetry };
}

// Placeholder 작품 재시도 (병렬, waitForRealImage 모드 사용)
const RETRY_CONCURRENCY = 6; // 재시도 시 병렬 수 (1차보다 적게)

async function retryPlaceholders(context, needRetry, gallery) {
  if (needRetry.length === 0) return { recovered: [], stillFailed: [] };
  
  console.log(`\n🔄 ${needRetry.length}개 placeholder 작품 재시도 (${RETRY_CONCURRENCY}개 병렬, 이미지 대기 모드)...`);
  
  const recovered = [];
  const stillFailed = [];
  const startTime = Date.now();
  
  // 병렬 처리 (RETRY_CONCURRENCY개씩)
  for (let i = 0; i < needRetry.length; i += RETRY_CONCURRENCY) {
    const chunk = needRetry.slice(i, i + RETRY_CONCURRENCY);
    
    const promises = chunk.map(async (item) => {
      // 최대 3회 시도
      for (let attempt = 1; attempt <= 3; attempt++) {
        const result = await scrapeArtwork(context, item.url, gallery, item.index, 10000, true);
        
        if (result.status === 'success') {
          return { success: true, data: result.data };
        }
        
        if (attempt < 3) await delay(1000);
      }
      return { success: false, item };
    });
    
    const results = await Promise.all(promises);
    
    for (const r of results) {
      if (r.success) recovered.push(r.data);
      else stillFailed.push(r.item);
    }
    
    const progress = Math.min(i + RETRY_CONCURRENCY, needRetry.length);
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = Math.round(progress / elapsed * 60);
    process.stdout.write(`\r  재시도: ${progress}/${needRetry.length} | 복구: ${recovered.length} | 실패: ${stillFailed.length} | ${rate}개/분`);
  }
  
  console.log(`\n   ✅ 복구: ${recovered.length}개, 최종 실패: ${stillFailed.length}개`);
  return { recovered, stillFailed };
}

// 대표 이미지 추출
async function getGalleryCoverImage(page, gallery) {
  console.log(`\n🖼️  ${gallery.name}: 대표 이미지 추출...`);
  
  await page.goto(gallery.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await delay(2000);
  
  const coverImage = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    for (const img of imgs) {
      const src = img.src || '';
      if (src.includes('lh3.googleusercontent.com') && img.width > 200) {
        const base = src.split('=')[0];
        return base + '=w1200';
      }
    }
    return null;
  });
  
  if (coverImage) {
    console.log(`   ✅ 대표 이미지 발견`);
  }
  
  return coverImage;
}

// 결과 저장
function saveResults(gallery, results, coverImage, excluded, finalFailed) {
  const outputPath = path.join(OUTPUT_DIR, `${gallery.id}-collection.json`);
  
  const output = {
    galleryId: gallery.id,
    galleryName: gallery.name,
    coverImage,
    scrapedAt: new Date().toISOString(),
    totalObjects: results.length,
    excludedCount: excluded.length,
    failedCount: finalFailed.length,
    objects: results
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`💾 ${outputPath} 저장 완료 (${results.length}개 작품)`);
  
  // 제외/실패 로그 저장
  const logPath = path.join(LOG_DIR, `${gallery.id}-scrape-log.json`);
  const logData = {
    scrapedAt: new Date().toISOString(),
    gallery: gallery.name,
    summary: {
      total: results.length + excluded.length + finalFailed.length,
      success: results.length,
      excluded: excluded.length,
      failed: finalFailed.length
    },
    excluded: excluded.map(e => ({
      title: e.title,
      reason: e.reason,
      url: e.url
    })),
    failed: finalFailed.map(f => ({
      title: f.title,
      reason: f.finalReason,
      url: f.url,
      error: f.error
    }))
  };
  
  fs.writeFileSync(logPath, JSON.stringify(logData, null, 2));
  console.log(`📋 ${logPath} 로그 저장 완료`);
  
  return output;
}

// 검증 보고서
function printReport(gallery, results, excluded, failed) {
  const uniqueImages = new Set(results.map(r => r.image)).size;
  const withYear = results.filter(r => r.year).length;
  const unknownArtist = results.filter(r => r.artist === 'Unknown').length;
  
  console.log(`\n📊 ${gallery.name} 최종 보고서:`);
  console.log(`   - 총 작품: ${results.length}개`);
  console.log(`   - 고유 이미지: ${uniqueImages}개`);
  console.log(`   - 연도 정보: ${withYear}개 (${(withYear/results.length*100).toFixed(1)}%)`);
  console.log(`   - Unknown 아티스트: ${unknownArtist}개`);
  console.log(`   - 제외됨: ${excluded.length}개 (필터링 패턴)`);
  console.log(`   - 최종 실패: ${failed.length}개`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('🎨 Google Arts & Culture - 3개 미술관 개선 스크래핑');
  console.log('   Royal Academy | Serpentine | The Courtauld');
  console.log('   - 실패 항목 별도 기록');
  console.log('   - 재시도: 순차 처리, 5초 타임아웃, 3회 시도');
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
  
  const mainPage = await context.newPage();
  
  // CAPTCHA 처리 대기
  console.log('\n⏳ CAPTCHA 페이지 로딩 중...');
  await mainPage.goto('https://artsandculture.google.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await delay(3000);
  
  // 사용자 확인 대기
  console.log('\n' + '⚠️'.repeat(20));
  console.log('🔐 CAPTCHA가 나타나면 브라우저에서 직접 통과해주세요.');
  console.log('   완료되면 여기에서 Enter를 눌러주세요...');
  console.log('⚠️'.repeat(20));
  
  await new Promise(resolve => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.setRawMode(false);
      resolve();
    });
  });
  
  console.log('\n✅ 확인! 스크래핑 시작합니다...');
  
  minimizeChrome();
  
  const allResults = {};
  const totalStartTime = Date.now();
  
  for (const gallery of GALLERIES) {
    console.log('\n' + '━'.repeat(50));
    console.log(`🏛️  ${gallery.name} 스크래핑 시작`);
    console.log('━'.repeat(50));
    
    const startTime = Date.now();
    
    // 1. 링크 수집
    const links = await collectLinks(mainPage, gallery);
    
    // 2. 대표 이미지 추출
    const coverImage = await getGalleryCoverImage(mainPage, gallery);
    
    // 3. 1차 병렬 스크래핑
    const firstPass = await scrapeAllArtworks(context, links, gallery);
    
    // 4. 2차 재시도: 로딩 실패 항목 (순차, 5초 타임아웃, 3회)
    const { recovered: recoveredFailed, stillFailed } = await retryFailed(context, firstPass.failed, gallery);
    
    // 5. 모든 성공 결과 합치기
    let allSuccess = [...firstPass.success, ...recoveredFailed];
    
    // 6. Placeholder 감지 및 재시도 (최대 2라운드)
    let placeholderFinalFailed = [];
    for (let round = 1; round <= 2; round++) {
      const placeholderUrls = detectPlaceholderUrls(allSuccess);
      
      if (placeholderUrls.length === 0) {
        console.log(`✅ Placeholder 없음 - 모든 이미지 정상`);
        break;
      }
      
      console.log(`\n⚠️  ${placeholderUrls.length}개 placeholder URL 감지 (라운드 ${round}/2)`);
      placeholderUrls.forEach(url => {
        const count = allSuccess.filter(r => r.image.replace(/=w\d+$/, '') === url).length;
        console.log(`   - ${count}회 중복: ...${url.slice(-50)}`);
      });
      
      const { clean, needRetry } = separatePlaceholders(allSuccess, placeholderUrls);
      
      if (needRetry.length === 0) break;
      
      // Placeholder 작품들 재시도
      const { recovered: recoveredPlaceholder, stillFailed: placeholderStillFailed } = await retryPlaceholders(context, needRetry, gallery);
      
      // 재시도 성공한 것들 추가
      allSuccess = [...clean, ...recoveredPlaceholder];
      
      // 최종 실패 목록에 추가
      placeholderFinalFailed = placeholderStillFailed.map(f => ({
        ...f,
        finalReason: 'placeholder_retry_failed'
      }));
    }
    
    // 7. 최종 결과
    const finalFailed = [...stillFailed, ...placeholderFinalFailed];
    
    // 8. 저장
    const output = saveResults(gallery, allSuccess, coverImage, firstPass.excluded, finalFailed);
    allResults[gallery.id] = output;
    
    // 9. 보고서
    printReport(gallery, allSuccess, firstPass.excluded, finalFailed);
    
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`⏱️  소요 시간: ${Math.round(elapsed)}초`);
    
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
  
  let totalSuccess = 0, totalExcluded = 0, totalFailed = 0;
  
  for (const gallery of GALLERIES) {
    const result = allResults[gallery.id];
    console.log(`   ${gallery.name}: ${result.totalObjects}개 (제외: ${result.excludedCount}, 실패: ${result.failedCount})`);
    totalSuccess += result.totalObjects;
    totalExcluded += result.excludedCount;
    totalFailed += result.failedCount;
  }
  
  console.log(`\n   📊 총합: ${totalSuccess}개 성공, ${totalExcluded}개 제외, ${totalFailed}개 실패`);
  console.log(`   ⏱️  총 소요 시간: ${Math.round(totalElapsed / 60)}분 ${Math.round(totalElapsed % 60)}초`);
  console.log('\n   📋 각 갤러리별 로그 파일: downloads/<gallery-id>-scrape-log.json');
}

main().catch(console.error);
