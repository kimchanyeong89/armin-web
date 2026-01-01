#!/usr/bin/env node
/**
 * Wallace Collection 스크래퍼 v6
 * 세션 유지하면서 필터 클릭으로 방 이동
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'wallace-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/wallace-v6-progress.json');
const DEBUG_DIR = path.join(__dirname, '../downloads');

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
  const match = text.match(/(?:c\.\s*|about\s*|circa\s*|probably\s*c?\.\s*)?(\d{4})(?:\s*[-–]\s*\d{4})?/i);
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
  console.log('🏛️ Wallace Collection Permanent Display Scraper v6');
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
    // Room 모듈 페이지 접속
    console.log('📍 Room 모듈 페이지 접속 중...');
    await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=room&viewType=detailList', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await delay(3000);
    
    // 방 목록 수집 (필터 영역에서)
    console.log('📍 방 목록 수집 중...');
    
    const rooms = await page.evaluate(() => {
      const roomList = [];
      // 필터 아이템들에서 방 정보 추출
      document.querySelectorAll('.filterItem a').forEach(a => {
        const text = a.textContent?.trim();
        const href = a.getAttribute('href');
        // Floor 자체는 제외, 실제 방만 수집
        if (text && href && !text.includes('Floor') && text.length > 2) {
          roomList.push({ name: text, href });
        }
      });
      return roomList;
    });
    
    console.log(`\n✅ 발견된 방: ${rooms.length}개`);
    rooms.slice(0, 10).forEach((r, i) => console.log(`  ${i + 1}. ${r.name}`));
    if (rooms.length > 10) console.log(`  ... 그 외 ${rooms.length - 10}개`);
    
    // 각 방 스크래핑
    const roomsToScrape = TEST_MODE ? rooms.slice(0, MAX_ROOMS_TEST) : rooms;
    
    for (let i = 0; i < roomsToScrape.length; i++) {
      const room = roomsToScrape[i];
      const roomNumber = i + 1;
      
      console.log(`\n🎨 [${roomNumber}/${roomsToScrape.length}] "${room.name}" 스크래핑...`);
      
      // 해당 방 필터 링크 클릭 (waitForNavigation 사용)
      try {
        // 링크 찾아서 클릭
        const linkSelector = `.filterItem a:has-text("${room.name}")`;
        
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
          page.click(linkSelector),
        ]);
        
        await delay(2000);
        
        // 페이지 확인
        const pageTitle = await page.title();
        if (pageTitle.includes('403')) {
          console.log(`  ❌ 403 에러 - 건너뜀`);
          
          // 메인 페이지로 돌아가기
          await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=room&viewType=detailList', {
            waitUntil: 'networkidle',
            timeout: 60000,
          });
          await delay(2000);
          continue;
        }
        
        // 작품 수집
        const artworks = await extractArtworks(page, roomNumber);
        
        if (artworks.length > 0) {
          console.log(`  ✅ ${artworks.length}개 작품 수집됨`);
          allRooms.push({
            id: `room-${roomNumber}`,
            name: `Room ${roomNumber}`,
            originalName: room.name,
            artworks,
          });
        } else {
          console.log(`  ⚠️ 작품을 찾지 못함`);
        }
        
        saveProgress({ rooms: allRooms, lastRoom: roomNumber, lastRoomName: room.name });
        
      } catch (err) {
        console.log(`  ❌ 오류: ${err.message.substring(0, 50)}`);
        
        // 메인 페이지로 돌아가기
        try {
          await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=room&viewType=detailList', {
            waitUntil: 'networkidle',
            timeout: 60000,
          });
          await delay(2000);
        } catch (e) {
          // 무시
        }
      }
    }
    
  } catch (error) {
    console.error('스크래핑 오류:', error);
  } finally {
    await saveResults(allRooms);
    await browser.close();
  }
}

async function extractArtworks(page, roomNumber) {
  const artworks = [];
  
  try {
    // 작품 목록 추출
    const items = await page.evaluate(() => {
      const results = [];
      
      // 작품 목록 아이템 찾기 (li 요소 기준)
      document.querySelectorAll('li').forEach(li => {
        // 작품 링크 찾기
        const titleLink = li.querySelector('a[href*="Scollection"][href*="l6"]');
        if (!titleLink) return;
        
        const title = titleLink.textContent?.trim();
        const href = titleLink.getAttribute('href');
        
        if (!title || title.length < 2) return;
        
        // 작가 링크
        const artistLink = li.querySelector('a[href*="Sartist"]');
        const artist = artistLink ? artistLink.textContent?.trim() : '';
        
        // 이미지
        const img = li.querySelector('img');
        let image = '';
        if (img && img.src) {
          image = img.src;
        }
        
        // 날짜 추출 (텍스트에서)
        const allText = li.textContent || '';
        let date = '';
        // 연도 패턴: 1700, about 1750, c. 1800, 1750 - 1760
        const dateMatch = allText.match(/(?:about\s*|c\.\s*)?(\d{4})(?:\s*[-–]\s*\d{4})?/);
        if (dateMatch) date = dateMatch[0];
        
        results.push({ title, href, artist, date, image });
      });
      
      return results;
    });
    
    // 중복 제거
    const seen = new Set();
    for (const item of items) {
      const key = `${item.title}-${item.artist}`;
      if (seen.has(key)) continue;
      seen.add(key);
      
      artworks.push({
        id: `wallace-${roomNumber}-${Date.now()}-${artworks.length}`,
        title: cleanText(item.title),
        artist: cleanText(item.artist),
        year: extractYear(item.date),
        medium: '',
        dimensions: '',
        description: '',
        image: item.image,
        accessionNumber: '',
        sourceUrl: item.href ? `https://wallacelive.wallacecollection.org${item.href}` : '',
      });
    }
    
    console.log(`    📄 ${artworks.length}개 작품 발견`);
    
    // 페이지네이션 확인
    let pageNum = 1;
    while (pageNum < 50) {
      const hasNext = await page.evaluate(() => {
        const nextLinks = document.querySelectorAll('a');
        for (const link of nextLinks) {
          const text = link.textContent?.trim();
          if (text === '>' || text === '»') {
            return true;
          }
        }
        return false;
      });
      
      if (!hasNext) break;
      
      try {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }),
          page.click('a:has-text(">"), a:has-text("»")'),
        ]);
        pageNum++;
        
        // 추가 작품 수집
        const moreItems = await page.evaluate(() => {
          const results = [];
          document.querySelectorAll('a[href*="Scollection"][href*="l6"]').forEach(a => {
            const title = a.textContent?.trim();
            const href = a.getAttribute('href');
            if (title && title.length > 2) {
              const parent = a.closest('li') || a.closest('tr');
              let artist = '';
              let date = '';
              let image = '';
              if (parent) {
                const artistLink = parent.querySelector('a[href*="Sartist"]');
                if (artistLink) artist = artistLink.textContent?.trim() || '';
                const img = parent.querySelector('img');
                if (img) image = img.src || '';
                const allText = parent.textContent || '';
                const dateMatch = allText.match(/\d{4}/);
                if (dateMatch) date = dateMatch[0];
              }
              results.push({ title, href, artist, date, image });
            }
          });
          return results;
        });
        
        for (const item of moreItems) {
          const key = `${item.title}-${item.artist}`;
          if (seen.has(key)) continue;
          seen.add(key);
          
          artworks.push({
            id: `wallace-${roomNumber}-${Date.now()}-${artworks.length}`,
            title: cleanText(item.title),
            artist: cleanText(item.artist),
            year: extractYear(item.date),
            medium: '',
            dimensions: '',
            description: '',
            image: item.image,
            accessionNumber: '',
            sourceUrl: item.href ? `https://wallacelive.wallacecollection.org${item.href}` : '',
          });
        }
        
        console.log(`    📄 페이지 ${pageNum}: +${moreItems.length}개`);
        await delay(1000);
        
      } catch (err) {
        break;
      }
    }
    
  } catch (err) {
    console.log(`    ❌ 추출 오류: ${err.message}`);
  }
  
  return artworks;
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

scrapeWallaceCollection().catch(console.error);
