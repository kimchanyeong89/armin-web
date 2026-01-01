#!/usr/bin/env node
/**
 * Wallace Collection 스크래퍼 v9
 * 세션 유지하면서 상세 페이지 클릭으로 접근
 * 작가, 제목, 년도, 매체, 디멘션, 이미지 수집
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'wallace-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/wallace-v9-progress.json');

const TEST_MODE = process.argv.includes('--test');
const MAX_ROOMS_TEST = 3;

// 방 목록
const ROOMS = [
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
  const match = text.match(/(?:c\.\s*|about\s*|circa\s*|probably\s*)?(\d{4})(?:\s*[-–]\s*\d{4})?/i);
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
  console.log('🏛️ Wallace Collection Permanent Display Scraper v9');
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
  
  // 단일 페이지로 세션 유지
  const page = await context.newPage();
  
  try {
    for (let i = 0; i < roomsToScrape.length; i++) {
      const room = roomsToScrape[i];
      const roomNumber = i + 1;
      
      console.log(`\n🎨 [${roomNumber}/${roomsToScrape.length}] "${room.name}" 스크래핑...`);
      
      try {
        // Room 페이지 접속
        await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=room&viewType=detailList', {
          waitUntil: 'networkidle',
          timeout: 60000,
        });
        await delay(2000);
        
        // 방 필터 클릭
        const roomLink = await page.$(`.filterItem a:has-text("${room.name}")`);
        
        if (roomLink) {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
            roomLink.click(),
          ]);
          await delay(1500);
          
          // 작품 목록에서 각 작품의 상세 정보 수집
          const artworks = await scrapeRoomArtworks(page, roomNumber);
          
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
        } else {
          console.log(`  ⚠️ 방 링크를 찾을 수 없음`);
        }
        
      } catch (err) {
        console.log(`  ❌ 오류: ${err.message.substring(0, 50)}`);
      }
      
      saveProgress({ rooms: allRooms, lastRoom: roomNumber, lastRoomName: room.name });
    }
    
  } catch (error) {
    console.error('스크래핑 오류:', error);
  } finally {
    await page.close();
    await saveResults(allRooms);
    await browser.close();
  }
}

async function scrapeRoomArtworks(page, roomNumber) {
  const artworks = [];
  const seen = new Set();
  
  try {
    // 작품 목록의 모든 링크 수집
    const artworkLinks = await page.$$eval('li a[href*="Scollection"][href*="l6"]', links => 
      links.map(a => ({
        title: a.textContent?.trim() || '',
        href: a.getAttribute('href') || '',
      }))
    );
    
    console.log(`    📄 ${artworkLinks.length}개 작품 발견`);
    
    // 각 작품 상세 페이지 방문
    const toProcess = artworkLinks.slice(0, 50); // 방당 최대 50개
    
    for (let i = 0; i < toProcess.length; i++) {
      const link = toProcess[i];
      
      if (seen.has(link.title)) continue;
      seen.add(link.title);
      
      console.log(`    📷 [${i + 1}/${toProcess.length}] ${link.title.substring(0, 35)}...`);
      
      try {
        // 목록 페이지에서 해당 링크 클릭
        const artworkLink = await page.$(`a[href*="${link.href.split('&sp=l')[1]}"]`);
        
        if (artworkLink) {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }),
            artworkLink.click(),
          ]);
          await delay(1000);
          
          // 상세 정보 추출
          const details = await extractDetailInfo(page);
          
          artworks.push({
            id: `wallace-${roomNumber}-${Date.now()}-${artworks.length}`,
            title: details.title || link.title,
            artist: details.artist || '',
            year: details.year,
            medium: details.medium || '',
            dimensions: details.dimensions || '',
            description: '',
            image: details.image || '',
            accessionNumber: details.accessionNumber || '',
            sourceUrl: page.url(),
          });
          
          // 뒤로 가기
          await page.goBack({ waitUntil: 'networkidle', timeout: 20000 });
          await delay(500);
        }
        
      } catch (err) {
        // 오류 시 목록 페이지로 복귀 시도
        try {
          await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=room&viewType=detailList', {
            waitUntil: 'networkidle',
            timeout: 30000,
          });
          await delay(1000);
        } catch { }
      }
    }
    
  } catch (err) {
    console.log(`    ❌ 추출 오류: ${err.message}`);
  }
  
  return artworks;
}

async function extractDetailInfo(page) {
  try {
    return await page.evaluate(() => {
      const result = {
        title: '',
        artist: '',
        year: null,
        medium: '',
        dimensions: '',
        image: '',
        accessionNumber: '',
      };
      
      // 제목 - h1 또는 .objectTitle
      const titleEl = document.querySelector('.objectTitle, h1, .title');
      if (titleEl) result.title = titleEl.textContent?.trim() || '';
      
      // 테이블에서 필드 추출
      document.querySelectorAll('table tr').forEach(tr => {
        const th = tr.querySelector('th');
        const td = tr.querySelector('td');
        
        if (th && td) {
          const label = th.textContent?.trim().toLowerCase() || '';
          const value = td.textContent?.trim() || '';
          
          if (label.includes('artist') || label.includes('maker') || label.includes('creator')) {
            result.artist = value;
          } else if (label.includes('date') || label.includes('dating')) {
            const yearMatch = value.match(/(\d{4})/);
            if (yearMatch) result.year = parseInt(yearMatch[1], 10);
          } else if (label.includes('medium') || label.includes('material') || label.includes('technique')) {
            result.medium = value;
          } else if (label.includes('dimension') || label.includes('size') || label.includes('measurement')) {
            result.dimensions = value;
          } else if (label.includes('museum number') || label.includes('accession') || label.includes('inventory')) {
            result.accessionNumber = value;
          }
        }
      });
      
      // 이미지 - 가장 큰 이미지 찾기
      let maxArea = 0;
      document.querySelectorAll('img').forEach(img => {
        const area = (img.naturalWidth || img.width) * (img.naturalHeight || img.height);
        if (area > maxArea && img.src && !img.src.includes('icon') && !img.src.includes('logo')) {
          maxArea = area;
          result.image = img.src;
        }
      });
      
      // 작가가 링크로 되어있는 경우
      if (!result.artist) {
        const artistLink = document.querySelector('a[href*="artist"], .artist a');
        if (artistLink) result.artist = artistLink.textContent?.trim() || '';
      }
      
      return result;
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
  const withImages = rooms.reduce((sum, r) => sum + r.artworks.filter(a => a.image).length, 0);
  const withArtist = rooms.reduce((sum, r) => sum + r.artworks.filter(a => a.artist).length, 0);
  
  const result = {
    museum: 'The Wallace Collection',
    museumId: 'wallace-collection',
    location: 'London, UK',
    type: 'permanent',
    scrapedAt: new Date().toISOString(),
    totalRooms: rooms.length,
    totalArtworks,
    artworksWithImages: withImages,
    artworksWithArtist: withArtist,
    rooms,
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ 스크래핑 완료!');
  console.log(`📁 저장 위치: ${OUTPUT_FILE}`);
  console.log(`🏠 총 ${rooms.length}개 방`);
  console.log(`🖼️ 총 ${totalArtworks}개 작품`);
  console.log(`📷 이미지 있는 작품: ${withImages}개`);
  console.log(`🎨 작가 있는 작품: ${withArtist}개`);
  console.log('='.repeat(50));
}

scrapeWallaceCollection().catch(console.error);
