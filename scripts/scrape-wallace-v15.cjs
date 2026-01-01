#!/usr/bin/env node
/**
 * Wallace Collection 스크래퍼 v15
 * v14 기반 + 상세 페이지에서 artist, year, medium, dimensions 추출
 * 
 * Usage:
 *   node scripts/scrape-wallace-v15.cjs --test    # Test with 3 artworks per room
 *   node scripts/scrape-wallace-v15.cjs           # Full scrape (all artworks)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/wallace-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/wallace-v15-progress.json');

const TEST_MODE = process.argv.includes('--test');
const MAX_ARTWORKS_TEST = 3; // Per room in test mode

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

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { rooms: [], completedRooms: [] };
}

function saveProgress(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

async function scrapeDetailPage(page) {
  // Extract artist, year, medium, dimensions from detail page text
  const bodyText = await page.$eval('body', el => el.innerText);
  const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l);
  
  const result = {
    artist: '',
    year: null,
    medium: '',
    dimensions: '',
    description: '',
    accessionNumber: ''
  };
  
  // Find "Back To List" line - artist/title come after
  const backToListIdx = lines.findIndex(l => l === 'Back To List');
  if (backToListIdx >= 0 && backToListIdx + 1 < lines.length) {
    const artistLine = lines[backToListIdx + 1];
    // Check if it looks like an artist name (contains dates like (1703 - 1770))
    if (artistLine && artistLine.match(/\(\d{4}\s*[-–]\s*\d{4}\)|\(\d{4}\s*[-–]\s*\)|\(\d{4}\)/)) {
      result.artist = artistLine;
    } else if (artistLine && !artistLine.includes(':') && artistLine.length < 100) {
      // Could be artist without dates or a title - check next line pattern
      const nextLine = lines[backToListIdx + 2];
      // If next line also doesn't have colon and isn't a known label, first line is artist
      if (nextLine && !nextLine.match(/^(Date|Medium|Image size|Inv|Location|Description):/)) {
        result.artist = artistLine;
      }
    }
  }
  
  // Extract labeled fields
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1] || '';
    
    if (line === 'Date:' && nextLine) {
      result.year = nextLine;
    } else if (line === 'Medium:' && nextLine) {
      result.medium = nextLine;
    } else if (line.match(/^Image size:$/i) && nextLine) {
      result.dimensions = nextLine;
    } else if (line === 'Inv:' && nextLine) {
      result.accessionNumber = nextLine;
    }
  }
  
  // Get description (first block after labels)
  const descIdx = lines.findIndex(l => l === 'Further Reading');
  if (descIdx > 0) {
    const descStart = descIdx + 1;
    let desc = '';
    for (let i = descStart; i < lines.length && desc.length < 500; i++) {
      if (lines[i].match(/^(Connect with us|Sign up|SIGN UP|The Wallace Collection|Hertford House)/)) break;
      desc += lines[i] + ' ';
    }
    result.description = desc.trim().substring(0, 500);
  }
  
  return result;
}

async function main() {
  console.log('🏛️ Wallace Collection 스크래퍼 v15 (with details)');
  console.log(TEST_MODE ? '📍 테스트 모드\n' : '📍 전체 모드\n');
  
  const progress = loadProgress();
  const allRooms = progress.rooms || [];
  const completedRooms = new Set(progress.completedRooms || []);
  
  for (let roomIdx = 0; roomIdx < ROOMS.length; roomIdx++) {
    const roomName = ROOMS[roomIdx];
    
    if (completedRooms.has(roomName)) {
      console.log(`\n[${roomIdx + 1}/${ROOMS.length}] ${roomName} - ✓ 이미 완료`);
      continue;
    }
    
    console.log(`\n[${roomIdx + 1}/${ROOMS.length}] ${roomName}...`);
    
    // 각 방마다 새 브라우저 생성
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
    
    const room = {
      id: `room-${roomIdx + 1}`,
      name: `Room ${roomIdx + 1}`,
      originalName: roomName,
      artworks: []
    };
    
    try {
      // 세션 초기화
      await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await delay(2000);
      
      // room 모듈 접속
      await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=room&viewType=detailList', {
        waitUntil: 'networkidle',
        timeout: 60000,
      });
      await delay(2000);
      
      // 방 필터 클릭
      const link = await page.$(`.filterItem a:text-is("${roomName}")`);
      if (!link) {
        console.log('  ⚠️ 필터 없음, 스킵');
        await browser.close();
        continue;
      }
      
      await Promise.all([
        page.waitForLoadState('networkidle', { timeout: 30000 }),
        link.click(),
      ]);
      await delay(2000);
      
      // listImg에서 작품 기본 정보 추출
      const artworksList = await page.evaluate(() => {
        const results = [];
        const seen = new Set();
        
        document.querySelectorAll('.listImg').forEach(dt => {
          const link = dt.querySelector('a');
          const img = dt.querySelector('img');
          
          if (!img) return;
          
          const title = img.getAttribute('title') || img.getAttribute('alt') || '';
          const src = img.getAttribute('src') || '';
          const href = link?.getAttribute('href') || '';
          
          const idMatch = href.match(/sp=l(\d+)/);
          const id = idMatch ? idMatch[1] : null;
          
          if (!title || seen.has(title)) return;
          seen.add(title);
          
          results.push({
            id,
            title,
            image: src,
            href
          });
        });
        
        return results;
      });
      
      console.log(`  📦 ${artworksList.length}개 작품 발견`);
      
      const maxArtworks = TEST_MODE ? Math.min(MAX_ARTWORKS_TEST, artworksList.length) : artworksList.length;
      
      // 각 작품 상세 페이지 방문
      for (let artIdx = 0; artIdx < maxArtworks; artIdx++) {
        const artBasic = artworksList[artIdx];
        console.log(`    [${artIdx + 1}/${maxArtworks}] ${artBasic.title.substring(0, 40)}...`);
        
        const artwork = {
          id: `wallace-${roomIdx + 1}-${artBasic.id}-${artIdx}`,
          collectionId: artBasic.id,
          title: artBasic.title,
          artist: '',
          year: null,
          medium: '',
          dimensions: '',
          description: '',
          image: artBasic.image,
          accessionNumber: '',
          sourceUrl: ''
        };
        
        try {
          // 작품 클릭으로 상세 페이지 이동
          const artworkLinks = await page.$$('.listImg a');
          if (artworkLinks[artIdx]) {
            artwork.sourceUrl = await artworkLinks[artIdx].evaluate(a => a.href);
            
            await Promise.all([
              page.waitForLoadState('networkidle', { timeout: 20000 }),
              artworkLinks[artIdx].click(),
            ]);
            await delay(1500);
            
            // 상세 정보 추출
            const details = await scrapeDetailPage(page);
            artwork.artist = details.artist;
            artwork.year = details.year;
            artwork.medium = details.medium;
            artwork.dimensions = details.dimensions;
            artwork.description = details.description;
            artwork.accessionNumber = details.accessionNumber;
            
            console.log(`      ✓ ${artwork.artist || 'Unknown artist'} | ${artwork.year || 'No date'}`);
            
            // 뒤로가기
            await page.goBack({ waitUntil: 'networkidle', timeout: 20000 });
            await delay(1000);
          }
        } catch (detailErr) {
          console.log(`      ⚠️ 상세 오류: ${detailErr.message.substring(0, 50)}`);
          // 복구: 방 페이지로 다시 이동
          try {
            await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=room&viewType=detailList', {
              waitUntil: 'networkidle',
              timeout: 30000,
            });
            await delay(1000);
            
            const link2 = await page.$(`.filterItem a:text-is("${roomName}")`);
            if (link2) {
              await Promise.all([
                page.waitForLoadState('networkidle', { timeout: 30000 }),
                link2.click(),
              ]);
              await delay(1000);
            }
          } catch (recoveryErr) {
            console.log(`      ❌ 복구 실패, 다음 작품으로`);
          }
        }
        
        room.artworks.push(artwork);
      }
      
      allRooms.push(room);
      completedRooms.add(roomName);
      
      // 진행 상황 저장
      saveProgress({
        rooms: allRooms,
        completedRooms: Array.from(completedRooms)
      });
      
      console.log(`  ✅ ${room.artworks.length}개 완료`);
      
    } catch (roomErr) {
      console.log(`  ❌ 방 오류: ${roomErr.message.substring(0, 50)}`);
    } finally {
      await browser.close();
    }
  }
  
  // 결과 저장
  const results = {
    museum: 'The Wallace Collection',
    museumId: 'wallace-collection',
    location: 'London, UK',
    type: 'permanent',
    scrapedAt: new Date().toISOString(),
    totalRooms: allRooms.length,
    totalArtworks: allRooms.reduce((sum, r) => sum + r.artworks.length, 0),
    artworksWithImages: allRooms.reduce((sum, r) => sum + r.artworks.filter(a => a.image).length, 0),
    rooms: allRooms
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  
  console.log('\n=== 완료 ===');
  console.log(`방: ${results.totalRooms}`);
  console.log(`작품: ${results.totalArtworks}`);
  console.log(`이미지: ${results.artworksWithImages}`);
  console.log(`저장: ${OUTPUT_FILE}`);
}

main();
