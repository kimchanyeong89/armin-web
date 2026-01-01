#!/usr/bin/env node
/**
 * Wallace Collection 스크래퍼 v7
 * 매 방마다 새 페이지 로드
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'wallace-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/wallace-v7-progress.json');

const TEST_MODE = process.argv.includes('--test');
const MAX_ROOMS_TEST = 3;

// 방 목록 (S10033=First Floor, S10034=Ground Floor, S10035=Lower Ground Floor)
// URL 패턴: S10033&sp=S{N} 에서 N은 방 번호
const ROOMS = [
  // First Floor (S10033)
  { name: 'West Room', floor: 'S10033', id: 'S2' },
  { name: 'West Gallery I', floor: 'S10033', id: 'S3' },
  { name: 'West Gallery II', floor: 'S10033', id: 'S4' },
  { name: 'West Gallery III', floor: 'S10033', id: 'S5' },
  { name: 'Great Gallery', floor: 'S10033', id: 'S6' },
  { name: 'East Galleries III', floor: 'S10033', id: 'S7' },
  { name: 'East Galleries II', floor: 'S10033', id: 'S8' },
  { name: 'East Galleries I', floor: 'S10033', id: 'S9' },
  { name: 'East Drawing Room', floor: 'S10033', id: 'S10' },
  { name: 'Small Drawing Room', floor: 'S10033', id: 'S11' },
  { name: 'Large Drawing Room', floor: 'S10033', id: 'S12' },
  { name: 'Landing', floor: 'S10033', id: 'S13' },
  { name: 'Oval Drawing Room', floor: 'S10033', id: 'S14' },
  { name: 'The Study', floor: 'S10033', id: 'S15' },
  { name: 'Boudoir', floor: 'S10033', id: 'S16' },
  { name: 'Boudoir Cabinet', floor: 'S10033', id: 'S17' },
  // Ground Floor (S10034)
  { name: 'Armouries Corridor', floor: 'S10034', id: 'S2' },
  { name: 'Arms and Armour I', floor: 'S10034', id: 'S3' },
  { name: 'Arms and Armour II', floor: 'S10034', id: 'S4' },
  { name: 'Arms and Armour III', floor: 'S10034', id: 'S5' },
  { name: 'Arms and Armour IV', floor: 'S10034', id: 'S6' },
  { name: 'Back State Room', floor: 'S10034', id: 'S7' },
  { name: 'Billiard Room', floor: 'S10034', id: 'S8' },
  { name: 'Dining Room', floor: 'S10034', id: 'S9' },
  { name: 'Front State Room', floor: 'S10034', id: 'S10' },
  { name: 'Grand Staircase', floor: 'S10034', id: 'S11' },
  { name: 'Hall', floor: 'S10034', id: 'S12' },
  { name: 'Sixteenth Century Gallery', floor: 'S10034', id: 'S13' },
  { name: 'Smoking Room', floor: 'S10034', id: 'S14' },
  // Lower Ground Floor (S10035)
  { name: 'Porphyry Court', floor: 'S10035', id: 'S2' },
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
  console.log('🏛️ Wallace Collection Permanent Display Scraper v7');
  console.log(TEST_MODE ? '📍 테스트 모드: 첫 3개 방만 스크래핑\n' : '📍 전체 스크래핑 모드\n');
  
  const browser = await chromium.launch({
    headless: true,
    slowMo: 0,
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1400, height: 900 },
  });
  
  const allRooms = [];
  const roomsToScrape = TEST_MODE ? ROOMS.slice(0, MAX_ROOMS_TEST) : ROOMS;
  
  try {
    for (let i = 0; i < roomsToScrape.length; i++) {
      const room = roomsToScrape[i];
      const roomNumber = i + 1;
      
      console.log(`\n🎨 [${roomNumber}/${roomsToScrape.length}] "${room.name}" 스크래핑...`);
      
      // 새 페이지 생성
      const page = await context.newPage();
      
      try {
        // Room 모듈 페이지 접속
        await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=room&viewType=detailList', {
          waitUntil: 'networkidle',
          timeout: 60000,
        });
        await delay(2000);
        
        // 해당 방 필터 클릭
        const roomLinkSelector = `.filterItem a:has-text("${room.name}")`;
        const roomLink = await page.$(roomLinkSelector);
        
        if (roomLink) {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
            roomLink.click(),
          ]);
          await delay(1500);
          
          // 페이지 확인
          const pageTitle = await page.title();
          if (pageTitle.includes('403')) {
            console.log(`  ❌ 403 에러`);
          } else {
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
          }
        } else {
          console.log(`  ⚠️ 방 링크를 찾을 수 없음`);
        }
        
      } catch (err) {
        console.log(`  ❌ 오류: ${err.message.substring(0, 50)}`);
      } finally {
        await page.close();
      }
      
      saveProgress({ rooms: allRooms, lastRoom: roomNumber, lastRoomName: room.name });
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
  const seen = new Set();
  
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
    
    // 중복 제거하면서 추가
    for (const item of items) {
      const key = `${item.title}`;
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
        image: item.image || '',
        accessionNumber: '',
        sourceUrl: item.href ? `https://wallacelive.wallacecollection.org${item.href}` : '',
      });
    }
    
    console.log(`    📄 ${artworks.length}개 작품 발견`);
    
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
