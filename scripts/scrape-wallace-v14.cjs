#!/usr/bin/env node
/**
 * Wallace Collection 스크래퍼 v14
 * listImg 클래스에서 이미지와 제목 추출
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/wallace-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/wallace-v14-progress.json');

const TEST_MODE = process.argv.includes('--test');
const MAX_ROOMS_TEST = 3;

const ROOMS = [
  'West Room', 'West Gallery I', 'West Gallery II', 'West Gallery III',
  'Great Gallery', 'East Galleries III', 'East Galleries II', 'East Galleries I',
  'East Drawing Room', 'Small Drawing Room', 'Large Drawing Room', 'Landing',
  'Oval Drawing Room', 'The Study', 'Boudoir', 'Boudoir Cabinet',
  'Armouries Corridor', 'Arms and Armour I', 'Arms and Armour II', 
  'Arms and Armour III', 'Arms and Armour IV', 'Back State Room',
  'Billiard Room', 'Dining Room', 'Front State Room', 'Grand Staircase',
  'Hall', 'Sixteenth Century Gallery', 'Smoking Room', 'Porphyry Court',
];

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanText(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

function saveProgress(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

async function main() {
  console.log('🏛️ Wallace Collection 스크래퍼 v14');
  console.log(TEST_MODE ? '📍 테스트 모드 (3개 방)\n' : '📍 전체 모드 (30개 방)\n');
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1400, height: 900 },
  });
  
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  
  const page = await context.newPage();
  const allRooms = [];
  const roomsToScrape = TEST_MODE ? ROOMS.slice(0, MAX_ROOMS_TEST) : ROOMS;
  
  try {
    // 세션 초기화
    console.log('🔗 세션 초기화...');
    await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await delay(3000);
    
    // room 모듈 접속
    await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=room&viewType=detailList', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await delay(2000);
    
    for (let i = 0; i < roomsToScrape.length; i++) {
      const roomName = roomsToScrape[i];
      const roomNumber = i + 1;
      
      console.log(`\n[${roomNumber}/${roomsToScrape.length}] ${roomName}...`);
      
      try {
        // 방 필터 클릭 (정확한 텍스트 매칭)
        const link = await page.$(`.filterItem a:text-is("${roomName}")`);
        if (!link) {
          console.log('  ⚠️ 필터 없음');
          continue;
        }
        
        await Promise.all([
          page.waitForLoadState('networkidle', { timeout: 30000 }),
          link.click(),
        ]);
        await delay(2000);
        
        // listImg에서 작품 정보 추출
        const artworks = await page.evaluate((roomNum) => {
          const results = [];
          const seen = new Set();
          
          document.querySelectorAll('.listImg').forEach(dt => {
            const link = dt.querySelector('a');
            const img = dt.querySelector('img');
            
            if (!img) return;
            
            const title = img.getAttribute('title') || img.getAttribute('alt') || '';
            const src = img.getAttribute('src') || '';
            const href = link?.getAttribute('href') || '';
            
            // ID 추출
            const idMatch = href.match(/sp=l(\d+)/);
            const id = idMatch ? idMatch[1] : null;
            
            if (!title || seen.has(title)) return;
            seen.add(title);
            
            // 이미지 URL 구성
            let image = src;
            if (src.startsWith('/')) {
              image = 'https://wallacelive.wallacecollection.org' + src;
            }
            
            results.push({
              id: `wallace-${roomNum}-${id || Date.now()}-${results.length}`,
              collectionId: id,
              title: title.trim(),
              artist: '',
              year: null,
              medium: '',
              dimensions: '',
              description: '',
              image,
              accessionNumber: '',
              sourceUrl: href ? 'https://wallacelive.wallacecollection.org' + href : '',
            });
          });
          
          return results;
        }, roomNumber);
        
        if (artworks.length > 0) {
          console.log(`  ✅ ${artworks.length}개 작품`);
          allRooms.push({
            id: `room-${roomNumber}`,
            name: `Room ${roomNumber}`,
            originalName: roomName,
            artworks,
          });
        } else {
          console.log('  ⚠️ 작품 없음');
        }
        
        saveProgress({ rooms: allRooms });
        
        // 다음 방으로
        await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=room&viewType=detailList', {
          waitUntil: 'networkidle',
          timeout: 30000,
        });
        await delay(1500);
        
      } catch (err) {
        console.log(`  ❌ 오류: ${err.message.substring(0, 50)}`);
      }
    }
    
  } catch (err) {
    console.error('전체 오류:', err.message);
  } finally {
    await browser.close();
  }
  
  // 최종 저장
  const totalArtworks = allRooms.reduce((sum, r) => sum + r.artworks.length, 0);
  const withImages = allRooms.reduce((sum, r) => sum + r.artworks.filter(a => a.image).length, 0);
  
  const result = {
    museum: 'The Wallace Collection',
    museumId: 'wallace-collection',
    location: 'London, UK',
    type: 'permanent',
    scrapedAt: new Date().toISOString(),
    totalRooms: allRooms.length,
    totalArtworks,
    artworksWithImages: withImages,
    rooms: allRooms,
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ 스크래핑 완료!');
  console.log(`📁 ${OUTPUT_FILE}`);
  console.log(`🏠 ${allRooms.length}개 방 | 🖼️ ${totalArtworks}개 작품`);
  console.log(`📷 이미지: ${withImages}개`);
  console.log('='.repeat(50));
}

main().catch(console.error);
