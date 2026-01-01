#!/usr/bin/env node
/**
 * Wallace Collection Permanent Display Scraper v3
 * eMuseumPlus 시스템 - Room 필터 기반 스크래핑
 * 
 * 규칙:
 * - 방 이름 대신 순서대로 1,2,3... 번호 매김
 * - 6가지 아트워크 정보: title, artist, year, medium, dimensions, image
 * 
 * 사용법:
 *   node scripts/scrape-wallace-v3.cjs --test   # 처음 3개 방만
 *   node scripts/scrape-wallace-v3.cjs          # 전체 스크래핑
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'wallace-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/wallace-v3-progress.json');
const DEBUG_DIR = path.join(__dirname, '../downloads');

// 테스트 모드: 처음 3개 방만 스크래핑
const TEST_MODE = process.argv.includes('--test');
const MAX_ROOMS_TEST = 3;

// 방 목록 (eMuseumPlus에서 확인된 목록)
const ROOM_LIST = [
  'West Room',
  'West Gallery I',
  'West Gallery II',
  'West Gallery III',
  'West Gallery III Staircase',
  'Sixteenth Century Gallery',
  'Back State Room',
  'Billiard Room',
  'Cloakroom',
  'Dining Room',
  'East Drawing Room',
  'East Galleries I',
  'East Galleries II',
  'East Galleries III',
  'East Galleries III Staircase',
  'Exhibition Gallery 2',
  'Front State Room',
  'Great Gallery',
  'Housekeeper\'s Room',
  'Large Drawing Room',
  'Oval Drawing Room',
  'Small Drawing Room',
  'Smoking Room',
  'Smoking Room Corridor',
];

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanText(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

function extractYear(text) {
  if (!text) return null;
  // c. 1665, about 1800, 1750-1760, etc.
  const match = text.match(/(?:c\.\s*|about\s*|circa\s*)?(\d{4})(?:\s*[-–]\s*\d{4})?/i);
  if (match) {
    const year = parseInt(match[1], 10);
    if (year >= 1000 && year <= 2025) return year;
  }
  return null;
}

function saveProgress(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

async function scrapeWallaceCollection() {
  console.log('🏛️ Wallace Collection Permanent Display Scraper v3');
  console.log(TEST_MODE ? '📍 테스트 모드: 첫 3개 방만 스크래핑\n' : '📍 전체 스크래핑 모드\n');
  
  const browser = await chromium.launch({
    headless: false,
    slowMo: 100,
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1400, height: 900 },
  });
  
  const page = await context.newPage();
  const allRooms = [];
  
  try {
    // 1. eMuseumPlus 메인 페이지 접속
    console.log('📍 eMuseumPlus 접속 중...');
    const baseUrl = 'https://wallacelive.wallacecollection.org/eMP/eMuseumPlus';
    await page.goto(baseUrl, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await delay(3000);
    
    // 스크린샷 저장
    await page.screenshot({ path: path.join(DEBUG_DIR, 'wallace-v3-main.png') });
    
    // Room 선택 드롭다운 찾기
    console.log('📍 Room 필터 찾는 중...');
    
    // 먼저 Room 모듈로 이동
    const roomModuleLink = await page.$('a:has-text("Room"), a:has-text("Gallery"), a[href*="room"]');
    if (roomModuleLink) {
      const linkText = await roomModuleLink.textContent();
      console.log(`  Room 모듈 링크 발견: ${cleanText(linkText)}`);
      await roomModuleLink.click();
      await delay(3000);
    }
    
    // Room 검색 URL로 직접 이동
    console.log('📍 Room 검색 페이지로 이동...');
    await page.goto(`${baseUrl}?service=ExternalInterface&module=collection&moduleFunction=showSearchMask`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await delay(3000);
    
    await page.screenshot({ path: path.join(DEBUG_DIR, 'wallace-v3-search.png') });
    
    // 페이지에서 Room 관련 셀렉트 박스 찾기
    const roomSelect = await findRoomSelect(page);
    
    if (!roomSelect) {
      console.log('❌ Room 선택 드롭다운을 찾을 수 없습니다. 대체 방법 시도...');
      
      // 직접 Room URL로 검색 시도
      const roomsToScrape = TEST_MODE ? ROOM_LIST.slice(0, MAX_ROOMS_TEST) : ROOM_LIST;
      
      for (let i = 0; i < roomsToScrape.length; i++) {
        const roomName = roomsToScrape[i];
        const roomNumber = i + 1;
        
        console.log(`\n🎨 [${roomNumber}/${roomsToScrape.length}] "${roomName}" 스크래핑...`);
        
        const artworks = await scrapeRoomBySearch(page, roomName, roomNumber);
        
        if (artworks.length > 0) {
          console.log(`  ✅ ${artworks.length}개 작품 수집됨`);
          allRooms.push({
            id: `room-${roomNumber}`,
            name: `Room ${roomNumber}`,
            originalName: roomName,
            artworks,
          });
        } else {
          console.log(`  ⚠️ 작품을 찾지 못함`);
        }
        
        saveProgress({ rooms: allRooms, lastRoom: roomNumber, lastRoomName: roomName });
        await delay(2000);
      }
    } else {
      // Room 드롭다운이 있으면 각 방 선택해서 검색
      const roomOptions = await roomSelect.$$eval('option', opts => 
        opts.map(o => ({ text: o.textContent?.trim(), value: o.value }))
          .filter(o => o.text && o.value)
      );
      
      console.log(`Room 드롭다운에서 ${roomOptions.length}개 옵션 발견`);
      
      const roomsToScrape = TEST_MODE ? roomOptions.slice(0, MAX_ROOMS_TEST) : roomOptions;
      
      for (let i = 0; i < roomsToScrape.length; i++) {
        const room = roomsToScrape[i];
        const roomNumber = i + 1;
        
        console.log(`\n🎨 [${roomNumber}/${roomsToScrape.length}] "${room.text}" 스크래핑...`);
        
        await roomSelect.selectOption({ value: room.value });
        await delay(500);
        
        // 검색 실행
        const searchBtn = await page.$('input[type="submit"], button[type="submit"], .searchButton, input[value*="Search"]');
        if (searchBtn) {
          await searchBtn.click();
          await delay(3000);
        }
        
        const artworks = await extractArtworksFromResults(page, roomNumber);
        
        console.log(`  ✅ ${artworks.length}개 작품 수집됨`);
        
        allRooms.push({
          id: `room-${roomNumber}`,
          name: `Room ${roomNumber}`,
          originalName: room.text,
          artworks,
        });
        
        saveProgress({ rooms: allRooms, lastRoom: roomNumber });
        
        // 검색 페이지로 돌아가기
        await page.goto(`${baseUrl}?service=ExternalInterface&module=collection&moduleFunction=showSearchMask`, {
          waitUntil: 'networkidle',
          timeout: 60000,
        });
        await delay(2000);
      }
    }
    
  } catch (error) {
    console.error('스크래핑 오류:', error);
  } finally {
    await saveResults(allRooms);
    await browser.close();
  }
}

async function findRoomSelect(page) {
  // 여러 가지 셀렉터 시도
  const selectors = [
    'select[name*="room" i]',
    'select[name*="Room"]',
    'select[id*="room" i]',
    '#filterSectiongroup_11 select',
    '.filterSection select',
  ];
  
  for (const selector of selectors) {
    const select = await page.$(selector);
    if (select) {
      const options = await select.$$eval('option', opts => opts.map(o => o.textContent?.trim()));
      // Room 관련 옵션이 있는지 확인
      const hasRoomOptions = options.some(o => 
        o && (o.includes('Room') || o.includes('Gallery') || o.includes('Drawing'))
      );
      if (hasRoomOptions) {
        console.log(`  Room 셀렉트 발견: ${selector}`);
        return select;
      }
    }
  }
  
  // 모든 셀렉트에서 Room 관련 옵션 찾기
  const allSelects = await page.$$('select');
  for (const select of allSelects) {
    const options = await select.$$eval('option', opts => opts.map(o => o.textContent?.trim()));
    const hasRoomOptions = options.some(o => 
      o && (o.includes('Room') || o.includes('Gallery') || o.includes('Drawing'))
    );
    if (hasRoomOptions) {
      console.log(`  Room 관련 옵션이 있는 셀렉트 발견`);
      return select;
    }
  }
  
  return null;
}

async function scrapeRoomBySearch(page, roomName, roomNumber) {
  const artworks = [];
  const baseUrl = 'https://wallacelive.wallacecollection.org/eMP/eMuseumPlus';
  
  try {
    // Room 이름으로 직접 검색
    const searchUrl = `${baseUrl}?service=ExternalInterface&module=collection&moduleFunction=search&fulltext=${encodeURIComponent(roomName)}`;
    await page.goto(searchUrl, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await delay(3000);
    
    // Room 필터가 있다면 적용
    const roomFilterLink = await page.$(`a:has-text("${roomName}"), option:has-text("${roomName}")`);
    if (roomFilterLink) {
      const tagName = await roomFilterLink.evaluate(el => el.tagName);
      if (tagName === 'OPTION') {
        const select = await roomFilterLink.evaluateHandle(el => el.closest('select'));
        if (select) {
          await select.selectOption({ label: roomName });
          await delay(1000);
          
          // 검색 실행
          const searchBtn = await page.$('input[type="submit"], button[type="submit"]');
          if (searchBtn) {
            await searchBtn.click();
            await delay(3000);
          }
        }
      } else {
        await roomFilterLink.click();
        await delay(3000);
      }
    }
    
    // 결과에서 작품 추출
    const results = await extractArtworksFromResults(page, roomNumber);
    artworks.push(...results);
    
    // 페이지네이션 처리
    let hasNextPage = true;
    let pageNum = 1;
    const maxPages = 50;
    
    while (hasNextPage && pageNum < maxPages) {
      const nextBtn = await page.$('a:has-text("Next"), a:has-text("›"), .paging-next, a[title="Next"]');
      if (nextBtn) {
        const isVisible = await nextBtn.isVisible();
        const isDisabled = await nextBtn.evaluate(el => 
          el.classList.contains('disabled') || 
          el.getAttribute('disabled') ||
          el.getAttribute('aria-disabled') === 'true'
        );
        
        if (isVisible && !isDisabled) {
          await nextBtn.click();
          await delay(2000);
          pageNum++;
          
          const pageResults = await extractArtworksFromResults(page, roomNumber);
          if (pageResults.length === 0) {
            hasNextPage = false;
          } else {
            artworks.push(...pageResults);
          }
        } else {
          hasNextPage = false;
        }
      } else {
        hasNextPage = false;
      }
    }
    
  } catch (err) {
    console.log(`  ❌ 검색 오류: ${err.message}`);
  }
  
  return artworks;
}

async function extractArtworksFromResults(page, roomNumber) {
  const artworks = [];
  
  try {
    // 결과 목록에서 작품 정보 추출
    const items = await page.$$('.resultItem, .listItem, .record, [class*="result"], [class*="item"]');
    
    if (items.length === 0) {
      // 테이블 형태 결과 처리
      const rows = await page.$$('table tr, .resultList tr');
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const artwork = await extractArtworkFromElement(row, roomNumber, i);
        if (artwork && artwork.title) {
          artworks.push(artwork);
        }
      }
    } else {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const artwork = await extractArtworkFromElement(item, roomNumber, i);
        if (artwork && artwork.title) {
          artworks.push(artwork);
        }
      }
    }
    
    // 상세 정보가 필요하면 각 작품 페이지 방문
    if (artworks.length > 0 && !artworks[0].image) {
      console.log(`    📷 상세 정보 수집 중...`);
      
      const links = await page.$$('a[href*="detail"], a[href*="object"], .resultItem a, .listItem a');
      const detailUrls = await Promise.all(
        links.slice(0, 20).map(async link => {
          try {
            return await link.getAttribute('href');
          } catch { return null; }
        })
      );
      
      const uniqueUrls = [...new Set(detailUrls.filter(u => u))];
      
      for (let i = 0; i < Math.min(uniqueUrls.length, artworks.length); i++) {
        try {
          const detailUrl = uniqueUrls[i].startsWith('http') 
            ? uniqueUrls[i] 
            : `https://wallacelive.wallacecollection.org${uniqueUrls[i]}`;
          
          await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 30000 });
          await delay(1500);
          
          const details = await extractDetailPageInfo(page);
          Object.assign(artworks[i], details);
          
        } catch (err) {
          // 무시
        }
      }
    }
    
  } catch (err) {
    console.log(`    ❌ 결과 추출 오류: ${err.message}`);
  }
  
  return artworks;
}

async function extractArtworkFromElement(element, roomNumber, index) {
  try {
    const data = await element.evaluate(el => {
      const getText = (selector) => {
        const node = el.querySelector(selector);
        return node ? node.textContent?.trim() : '';
      };
      
      const getImage = () => {
        const img = el.querySelector('img');
        return img ? img.src : '';
      };
      
      const getLink = () => {
        const a = el.querySelector('a');
        return a ? a.href : '';
      };
      
      // 텍스트 추출
      const allText = el.textContent?.trim() || '';
      const title = getText('.title, .objectTitle, h3, h4, strong, b') || 
                   getText('a') || 
                   allText.split('\n')[0];
      
      const artist = getText('.artist, .creator, .author') || '';
      
      return {
        title,
        artist,
        image: getImage(),
        sourceUrl: getLink(),
        allText,
      };
    });
    
    if (!data.title || data.title.length < 2) return null;
    
    return {
      id: `wallace-${roomNumber}-${Date.now()}-${index}`,
      title: cleanText(data.title),
      artist: cleanText(data.artist),
      year: extractYear(data.allText),
      medium: '',
      dimensions: '',
      description: '',
      image: data.image,
      accessionNumber: '',
      sourceUrl: data.sourceUrl,
    };
    
  } catch (err) {
    return null;
  }
}

async function extractDetailPageInfo(page) {
  try {
    return await page.evaluate(() => {
      const getText = (selectors) => {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) {
            const text = el.textContent?.trim();
            if (text) return text;
          }
        }
        return '';
      };
      
      const getImage = () => {
        const img = document.querySelector('.detailImage img, .objectImage img, .mainImage img, img[src*="image"]');
        return img ? img.src : '';
      };
      
      // 메타데이터 추출
      const title = getText(['.objectTitle', '.title h1', 'h1.title', 'h1']);
      const artist = getText(['.artist', '.creator', '.maker', '[class*="artist"]', '[class*="creator"]']);
      const date = getText(['.date', '.dating', '.objectDate', '[class*="date"]']);
      const medium = getText(['.medium', '.material', '.technique', '[class*="medium"]', '[class*="material"]']);
      const dimensions = getText(['.dimensions', '.measurements', '.size', '[class*="dimension"]']);
      const accession = getText(['.accession', '.inventory', '.objectNumber', '[class*="accession"]', '[class*="inventory"]']);
      
      return {
        title: title || undefined,
        artist: artist || undefined,
        year: date ? parseInt(date.match(/\d{4}/)?.[0]) || null : null,
        medium: medium || undefined,
        dimensions: dimensions || undefined,
        image: getImage() || undefined,
        accessionNumber: accession || undefined,
      };
    });
  } catch (err) {
    return {};
  }
}

async function saveResults(rooms) {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const totalArtworks = rooms.reduce((sum, r) => sum + r.artworks.length, 0);
  
  const result = {
    museum: 'The Wallace Collection',
    museumId: 'wallace-collection',
    location: 'London, UK',
    type: 'permanent',
    scrapedAt: new Date().toISOString(),
    totalRooms: rooms.length,
    totalArtworks,
    rooms,
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ 스크래핑 완료!');
  console.log(`📁 저장 위치: ${OUTPUT_FILE}`);
  console.log(`🏠 총 ${rooms.length}개 방`);
  console.log(`🖼️ 총 ${totalArtworks}개 작품`);
  console.log('='.repeat(50));
}

// 실행
scrapeWallaceCollection().catch(console.error);
