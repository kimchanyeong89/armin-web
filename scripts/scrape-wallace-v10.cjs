#!/usr/bin/env node
/**
 * Wallace Collection 스크래퍼 v10
 * 목록 페이지에서 모든 정보 추출 (상세 페이지 접근 없이)
 * - 제목, 작가, 년도: 텍스트에서 추출
 * - 이미지: 썸네일 URL에서 고해상도로 변환
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'wallace-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/wallace-v10-progress.json');

const TEST_MODE = process.argv.includes('--test');
const MAX_ROOMS_TEST = 3;

// 방 목록
const ROOMS = [
  { name: 'West Room' },
  { name: 'West Gallery I' },
  { name: 'West Gallery II' },
  { name: 'West Gallery III' },
  { name: 'Great Gallery' },
  { name: 'East Galleries III' },
  { name: 'East Galleries II' },
  { name: 'East Galleries I' },
  { name: 'East Drawing Room' },
  { name: 'Small Drawing Room' },
  { name: 'Large Drawing Room' },
  { name: 'Landing' },
  { name: 'Oval Drawing Room' },
  { name: 'The Study' },
  { name: 'Boudoir' },
  { name: 'Boudoir Cabinet' },
  { name: 'Armouries Corridor' },
  { name: 'Arms and Armour I' },
  { name: 'Arms and Armour II' },
  { name: 'Arms and Armour III' },
  { name: 'Arms and Armour IV' },
  { name: 'Back State Room' },
  { name: 'Billiard Room' },
  { name: 'Dining Room' },
  { name: 'Front State Room' },
  { name: 'Grand Staircase' },
  { name: 'Hall' },
  { name: 'Sixteenth Century Gallery' },
  { name: 'Smoking Room' },
  { name: 'Porphyry Court' },
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
  console.log('🏛️ Wallace Collection Permanent Display Scraper v10');
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
      
      const page = await context.newPage();
      
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
          await delay(2000);
          
          // 목록에서 모든 작품 정보 추출
          const artworks = await extractAllArtworks(page, roomNumber);
          
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

async function extractAllArtworks(page, roomNumber) {
  const artworks = [];
  const seen = new Set();
  
  try {
    // 목록에서 모든 작품 정보 추출
    const items = await page.evaluate(() => {
      const results = [];
      
      // li 요소에서 작품 정보 추출
      document.querySelectorAll('li').forEach(li => {
        // 제목 링크 찾기 (TspTitleLink - 제목만 있는 링크)
        const titleLink = li.querySelector('a[href*="TspTitleLink"]');
        if (!titleLink) return;
        
        const title = titleLink.textContent?.trim() || '';
        if (!title || title.length < 2 || title === 'Collection Highlights') return;
        
        // 작가 링크 (Sartist 포함)
        const artistLink = li.querySelector('a[href*="Sartist"]');
        const artist = artistLink ? artistLink.textContent?.trim() : '';
        
        // 이미지 링크 (TspTitleImageLink)
        const imageLink = li.querySelector('a[href*="TspTitleImageLink"]');
        let image = '';
        if (imageLink) {
          const img = imageLink.querySelector('img');
          if (img && img.src) {
            image = img.src;
          }
        }
        
        // 또는 li 안의 img
        if (!image) {
          const img = li.querySelector('img');
          if (img && img.src) {
            image = img.src;
          }
        }
        
        // 텍스트에서 연도/매체 추출
        const allText = li.textContent || '';
        
        // 연도 패턴: 1700, about 1750, c. 1800
        let year = '';
        const yearMatch = allText.match(/(?:about\s*|c\.\s*|circa\s*)?(\d{4})(?:\s*[-–]\s*\d{4})?/);
        if (yearMatch) year = yearMatch[0];
        
        // 매체/재료 (일반적인 패턴)
        let medium = '';
        const mediumPatterns = [
          /oil on canvas/i,
          /oil on panel/i,
          /oil on wood/i,
          /watercolour/i,
          /bronze/i,
          /marble/i,
          /porcelain/i,
          /gilt bronze/i,
          /oak/i,
          /walnut/i,
          /mahogany/i,
          /steel/i,
          /iron/i,
          /silver/i,
          /gold/i,
          /enamel/i,
          /silk/i,
          /wool/i,
          /tapestry/i,
        ];
        for (const pattern of mediumPatterns) {
          const match = allText.match(pattern);
          if (match) {
            medium = match[0];
            break;
          }
        }
        
        // sourceUrl
        const sourceUrl = titleLink.getAttribute('href') || '';
        
        results.push({
          title,
          artist,
          year,
          medium,
          image,
          sourceUrl,
        });
      });
      
      return results;
    });
    
    console.log(`    📄 ${items.length}개 작품 발견`);
    
    // 중복 제거하면서 추가
    for (const item of items) {
      const key = `${item.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      
      artworks.push({
        id: `wallace-${roomNumber}-${Date.now()}-${artworks.length}`,
        title: cleanText(item.title),
        artist: cleanText(item.artist),
        year: extractYear(item.year),
        medium: cleanText(item.medium),
        dimensions: '',
        description: '',
        image: item.image || '',
        accessionNumber: '',
        sourceUrl: item.sourceUrl ? `https://wallacelive.wallacecollection.org${item.sourceUrl}` : '',
      });
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
