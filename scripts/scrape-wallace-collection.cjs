#!/usr/bin/env node
/**
 * Wallace Collection Permanent Display Scraper
 * eMuseumPlus 시스템 - Playwright 필요 (세션 기반)
 * 
 * 규칙:
 * - 방 이름 대신 순서대로 1,2,3... 번호 매김
 * - 6가지 아트워크 정보: title, artist, year, medium, dimensions, image
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'wallace-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/wallace-progress.json');

// 테스트 모드: 처음 3개 방만 스크래핑
const TEST_MODE = process.argv.includes('--test');
const MAX_ROOMS_TEST = 3;

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanText(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

function extractYear(text) {
  if (!text) return null;
  // Match patterns like "1650", "c. 1650", "about 1650", "1650-1660"
  const match = text.match(/(?:c\.\s*|about\s*|circa\s*)?(\d{4})(?:\s*[-–]\s*\d{4})?/i);
  if (match) {
    const year = parseInt(match[1], 10);
    if (year >= 1000 && year <= 2025) return year;
  }
  return null;
}

async function scrapeWallaceCollection() {
  console.log('🏛️ Wallace Collection Permanent Display Scraper');
  console.log(TEST_MODE ? '📍 테스트 모드: 첫 3개 방만 스크래핑\n' : '📍 전체 스크래핑 모드\n');
  
  const browser = await chromium.launch({
    headless: false,  // eMuseumPlus는 헤드풀이 안정적
    slowMo: 50,
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1400, height: 900 },
  });
  
  const page = await context.newPage();
  const rooms = [];
  
  try {
    // 1. 메인 컬렉션 페이지로 이동
    console.log('📍 Wallace Collection 사이트 접속 중...');
    await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await delay(2000);
    
    // 2. "Room" 필터 섹션 찾기 - Collection 탭에서 Room별로 탐색
    console.log('📍 Room 필터 탐색 중...');
    
    // 먼저 Collection 검색으로 이동
    await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=direct/1/ResultListView/result.t1.collection_list.$TspTitleLink.link&sp=10&sp=Scollection&sp=SfieldValue&sp=0&sp=0&sp=3&sp=SdetailList&sp=0&sp=Sdetail&sp=0&sp=0&sp=T&sp=0&sp=1', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await delay(3000);
    
    // 페이지 내용 확인
    const pageTitle = await page.title();
    console.log(`📄 페이지 제목: ${pageTitle}`);
    
    // Room 필터 찾기 - 사이드바에서 Room 섹션 찾기
    const roomFilterExists = await page.$('text=Room');
    if (roomFilterExists) {
      console.log('✅ Room 필터 발견');
      await roomFilterExists.click();
      await delay(1000);
    }
    
    // 3. Room 리스트 수집
    console.log('📍 방 목록 수집 중...');
    
    // Room 링크들 수집
    const roomLinks = await page.evaluate(() => {
      const links = [];
      // eMuseumPlus의 Room 필터 옵션들 찾기
      const roomElements = document.querySelectorAll('a[href*="Sroom"], a[href*="room"], .filterOption');
      roomElements.forEach(el => {
        const href = el.getAttribute('href');
        const text = el.textContent?.trim();
        if (href && text) {
          links.push({ name: text, href: href });
        }
      });
      return links;
    });
    
    console.log(`발견된 방: ${roomLinks.length}개`);
    
    // Room이 없으면 직접 URL로 접근 시도
    if (roomLinks.length === 0) {
      console.log('📍 Room 필터를 찾지 못함. 직접 URL 탐색 시도...');
      
      // 사용자가 제공한 URL에서 Room 탐색
      await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=direct/1/ResultDetailView/preselectFilterSection.$FilterGroupControl.$MpDirectLink&sp=13&sp=Sroom&sp=SfilterDefinition&sp=0&sp=2&sp=3&sp=SdetailView&sp=0&sp=Sdetail&sp=0&sp=T&sp=0&sp=SdetailList&sp=0&sp=S10033&sp=S1', {
        waitUntil: 'networkidle',
        timeout: 60000,
      });
      await delay(3000);
    }
    
    // 현재 페이지의 모든 Room 옵션 분석
    console.log('📍 Room 필터 옵션 분석 중...');
    const roomOptions = await analyzeRoomFilters(page);
    console.log(`분석된 방 옵션: ${roomOptions.length}개`);
    
    if (roomOptions.length > 0) {
      console.log('방 목록:');
      roomOptions.forEach((r, i) => console.log(`  ${i + 1}. ${r.name}`));
    }
    
    const roomsToProcess = TEST_MODE ? roomOptions.slice(0, MAX_ROOMS_TEST) : roomOptions;
    
    // 4. 각 방별로 작품 수집
    for (let roomIdx = 0; roomIdx < roomsToProcess.length; roomIdx++) {
      const room = roomsToProcess[roomIdx];
      const roomNumber = roomIdx + 1;
      console.log(`\n🎨 [${roomNumber}/${roomsToProcess.length}] ${room.name} 스크래핑 중...`);
      
      try {
        // Room 페이지로 이동
        await page.goto(room.url, {
          waitUntil: 'networkidle',
          timeout: 60000,
        });
        await delay(2000);
        
        // 해당 방의 작품들 수집
        const artworks = await scrapeRoomArtworks(page, roomNumber);
        console.log(`  ✅ ${artworks.length}개 작품 수집됨`);
        
        rooms.push({
          roomNumber,
          originalName: room.name,
          artworks,
        });
        
        // 진행 상황 저장
        saveProgress({ rooms, lastRoom: roomNumber });
        
      } catch (err) {
        console.log(`  ❌ 방 스크래핑 오류: ${err.message}`);
      }
      
      await delay(1500);
    }
    
  } catch (error) {
    console.error('스크래핑 오류:', error);
  } finally {
    // 결과 저장
    await saveResults(rooms);
    await browser.close();
  }
}

async function analyzeRoomFilters(page) {
  // 페이지에서 Room 필터 옵션들을 분석
  const rooms = await page.evaluate(() => {
    const result = [];
    
    // 방법 1: 사이드바 필터 옵션 (eMuseumPlus 스타일)
    const filterSections = document.querySelectorAll('.filterSection, .preselectFilterSection, [class*="filter"]');
    filterSections.forEach(section => {
      const title = section.querySelector('.sectionTitle, h3, h4, strong')?.textContent?.toLowerCase();
      if (title && title.includes('room')) {
        const options = section.querySelectorAll('a, .filterOption, li');
        options.forEach(opt => {
          const link = opt.querySelector('a') || opt;
          const href = link.getAttribute('href');
          const name = link.textContent?.trim();
          if (name && href) {
            result.push({ name, url: href });
          }
        });
      }
    });
    
    // 방법 2: 모든 "Room" 텍스트가 포함된 링크
    if (result.length === 0) {
      document.querySelectorAll('a').forEach(a => {
        const text = a.textContent?.trim();
        const href = a.getAttribute('href');
        if (text && href && 
            (text.toLowerCase().includes('room') || 
             text.toLowerCase().includes('gallery') ||
             text.toLowerCase().includes('west') ||
             text.toLowerCase().includes('east'))) {
          if (!result.find(r => r.name === text)) {
            result.push({ name: text, url: href });
          }
        }
      });
    }
    
    return result;
  });
  
  // URL 정규화
  return rooms.map(r => ({
    ...r,
    url: r.url.startsWith('http') ? r.url : `https://wallacelive.wallacecollection.org${r.url}`,
  }));
}

async function scrapeRoomArtworks(page, roomNumber) {
  const artworks = [];
  let currentPage = 1;
  let hasMore = true;
  
  while (hasMore) {
    // 현재 페이지의 작품 목록 수집
    const pageArtworks = await page.evaluate(() => {
      const items = [];
      
      // eMuseumPlus 결과 리스트 아이템들
      const resultItems = document.querySelectorAll('.resultItem, .object, [class*="result"], tr[class*="row"], .listItem');
      
      resultItems.forEach(item => {
        // 이미지
        const img = item.querySelector('img');
        const image = img ? img.getAttribute('src') : null;
        
        // 제목 (여러 가지 형식 시도)
        const titleEl = item.querySelector('.objectTitle, .title, h3, h4, a[href*="detail"], strong');
        const title = titleEl?.textContent?.trim() || '';
        
        // 아티스트
        const artistEl = item.querySelector('.artist, .creator, [class*="artist"], [class*="creator"]');
        const artist = artistEl?.textContent?.trim() || '';
        
        // 상세 페이지 링크
        const detailLink = item.querySelector('a[href*="detail"], a[href*="Detail"]');
        const detailUrl = detailLink?.getAttribute('href') || '';
        
        if (title || image) {
          items.push({
            title,
            artist,
            image,
            detailUrl,
          });
        }
      });
      
      return items;
    });
    
    // 각 작품의 상세 페이지에서 추가 정보 수집
    for (const artwork of pageArtworks) {
      if (artwork.detailUrl) {
        try {
          const fullUrl = artwork.detailUrl.startsWith('http') 
            ? artwork.detailUrl 
            : `https://wallacelive.wallacecollection.org${artwork.detailUrl}`;
          
          const details = await scrapeArtworkDetail(page, fullUrl);
          artworks.push({
            ...artwork,
            ...details,
            roomNumber,
          });
        } catch (err) {
          // 상세 페이지 실패 시 기본 정보만 사용
          artworks.push({
            ...artwork,
            roomNumber,
          });
        }
      } else {
        artworks.push({
          ...artwork,
          roomNumber,
        });
      }
      
      await delay(500);  // 요청 간 딜레이
    }
    
    // 다음 페이지 확인
    const nextButton = await page.$('a[title="Next"], .next, [class*="next"]');
    if (nextButton && currentPage < 50) {  // 최대 50페이지
      try {
        await nextButton.click();
        await delay(2000);
        currentPage++;
      } catch {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }
  
  return artworks;
}

async function scrapeArtworkDetail(page, url) {
  const originalUrl = page.url();
  
  await page.goto(url, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  await delay(1000);
  
  const details = await page.evaluate(() => {
    const result = {
      title: '',
      artist: '',
      year: null,
      medium: '',
      dimensions: '',
      description: '',
      image: '',
    };
    
    // 제목
    const titleEl = document.querySelector('h1, .objectTitle, .title');
    result.title = titleEl?.textContent?.trim() || '';
    
    // 이미지 (고해상도)
    const mainImg = document.querySelector('.mainImage img, .detailImage img, img[src*="zoom"], img[class*="main"]');
    const ogImage = document.querySelector('meta[property="og:image"]');
    result.image = mainImg?.getAttribute('src') || ogImage?.getAttribute('content') || '';
    
    // 메타데이터 테이블/리스트에서 추출
    const extractFromDL = (labelPattern) => {
      const dlItems = document.querySelectorAll('dt, th, .label, .fieldLabel, tr');
      for (const item of dlItems) {
        const labelText = item.textContent?.toLowerCase() || '';
        if (labelPattern.test(labelText)) {
          const valueEl = item.nextElementSibling || item.querySelector('td, dd, .value');
          return valueEl?.textContent?.trim() || '';
        }
      }
      return '';
    };
    
    result.artist = extractFromDL(/artist|creator|maker|by/i) || result.artist;
    result.medium = extractFromDL(/medium|material|technique/i);
    result.dimensions = extractFromDL(/dimension|size|measurement/i);
    
    // 날짜/년도
    const dateText = extractFromDL(/date|year|period|created/i);
    if (dateText) {
      const yearMatch = dateText.match(/\d{4}/);
      if (yearMatch) result.year = parseInt(yearMatch[0], 10);
    }
    
    // 설명
    const descEl = document.querySelector('.description, .objectDescription, .summary, meta[name="description"]');
    result.description = descEl?.textContent?.trim() || descEl?.getAttribute('content') || '';
    
    return result;
  });
  
  // 원래 페이지로 돌아가기
  await page.goto(originalUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await delay(500);
  
  return details;
}

function saveProgress(data) {
  const dir = path.dirname(PROGRESS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

async function saveResults(rooms) {
  // 결과 형식 변환
  const totalArtworks = rooms.reduce((sum, r) => sum + r.artworks.length, 0);
  
  const collection = {
    museum: 'The Wallace Collection',
    museumId: 'wallace-collection',
    location: 'London, UK',
    type: 'permanent',
    scrapedAt: new Date().toISOString(),
    totalRooms: rooms.length,
    totalArtworks,
    rooms: rooms.map(r => ({
      id: `room-${r.roomNumber}`,
      name: `Room ${r.roomNumber}`,
      originalName: r.originalName,
      artworks: r.artworks.map((a, idx) => ({
        id: `wallace-${r.roomNumber}-${idx + 1}`,
        title: cleanText(a.title),
        artist: cleanText(a.artist),
        year: a.year || extractYear(a.dateText),
        medium: cleanText(a.medium),
        dimensions: cleanText(a.dimensions),
        description: cleanText(a.description),
        image: a.image,
        sourceUrl: a.detailUrl,
      })),
    })),
  };
  
  // 디렉토리 생성
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2));
  console.log(`\n✅ 완료!`);
  console.log(`📊 ${rooms.length}개 방, ${totalArtworks}개 작품 저장됨`);
  console.log(`📁 저장 위치: ${OUTPUT_FILE}`);
}

// 실행
scrapeWallaceCollection().catch(console.error);
