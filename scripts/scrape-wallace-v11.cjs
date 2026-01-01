#!/usr/bin/env node
/**
 * Wallace Collection 스크래퍼 v11
 * 1. 목록에서 제목 + sourceUrl 추출 
 * 2. 같은 세션 내에서 각 상세페이지 방문하여 이미지/작가/연도 추출
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'wallace-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/wallace-v11-progress.json');

const TEST_MODE = process.argv.includes('--test');
const MAX_ROOMS_TEST = 2;
const MAX_ARTWORKS_PER_ROOM_TEST = 5;

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
  console.log('🏛️ Wallace Collection Permanent Display Scraper v11');
  console.log(TEST_MODE ? '📍 테스트 모드\n' : '📍 전체 스크래핑 모드\n');
  
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
    for (let roomIndex = 0; roomIndex < roomsToScrape.length; roomIndex++) {
      const room = roomsToScrape[roomIndex];
      const roomNumber = roomIndex + 1;
      
      console.log(`\n🎨 [${roomNumber}/${roomsToScrape.length}] "${room.name}" 스크래핑...`);
      
      try {
        // 메인 페이지 접속
        await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=room&viewType=detailList', {
          waitUntil: 'networkidle',
          timeout: 60000,
        });
        await delay(2000);
        
        // 방 필터 클릭
        const roomLink = await page.$(`.filterItem a:has-text("${room.name}")`);
        
        if (!roomLink) {
          console.log(`  ⚠️ 방 링크를 찾을 수 없음`);
          continue;
        }
        
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
          roomLink.click(),
        ]);
        await delay(2000);
        
        // 1. 목록에서 작품 링크들 수집
        const artworkLinks = await page.evaluate(() => {
          const links = [];
          document.querySelectorAll('a[href*="TspTitleLink"]').forEach(a => {
            const title = a.textContent?.trim();
            if (title && title.length > 2 && title !== 'Collection Highlights') {
              links.push({
                title,
                href: a.getAttribute('href'),
              });
            }
          });
          return links;
        });
        
        console.log(`  📋 ${artworkLinks.length}개 작품 링크 발견`);
        
        const artworks = [];
        const linksToProcess = TEST_MODE ? artworkLinks.slice(0, MAX_ARTWORKS_PER_ROOM_TEST) : artworkLinks;
        
        // 2. 각 작품 상세 페이지 방문
        for (let i = 0; i < linksToProcess.length; i++) {
          const link = linksToProcess[i];
          
          try {
            // 목록으로 돌아가기
            await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=room&viewType=detailList', {
              waitUntil: 'networkidle',
              timeout: 30000,
            });
            await delay(1000);
            
            // 같은 방 클릭
            const filterLink = await page.$(`.filterItem a:has-text("${room.name}")`);
            if (filterLink) {
              await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
                filterLink.click(),
              ]);
              await delay(1000);
            }
            
            // 작품 클릭
            const artworkLink = await page.$(`a[href*="TspTitleLink"]:has-text("${link.title}")`);
            if (!artworkLink) continue;
            
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
              artworkLink.click(),
            ]);
            await delay(1500);
            
            // 상세 페이지에서 정보 추출
            const details = await page.evaluate(() => {
              let artist = '', year = '', medium = '', dimensions = '', image = '';
              
              // 이미지
              const mainImg = document.querySelector('.detailImage img, .collectionImage img, img[src*="collection"]');
              if (mainImg) image = mainImg.src;
              
              // 테이블에서 정보 추출
              document.querySelectorAll('table tr').forEach(tr => {
                const th = tr.querySelector('th, td:first-child');
                const td = tr.querySelector('td:last-child');
                if (!th || !td) return;
                
                const label = th.textContent?.trim().toLowerCase();
                const value = td.textContent?.trim();
                
                if (label?.includes('artist') || label?.includes('maker') || label?.includes('author')) {
                  artist = value || '';
                } else if (label?.includes('date') || label?.includes('year')) {
                  year = value || '';
                } else if (label?.includes('material') || label?.includes('medium') || label?.includes('technique')) {
                  medium = value || '';
                } else if (label?.includes('dimension') || label?.includes('size') || label?.includes('measurement')) {
                  dimensions = value || '';
                }
              });
              
              // dl/dt/dd 구조도 확인
              document.querySelectorAll('dl').forEach(dl => {
                const dts = dl.querySelectorAll('dt');
                const dds = dl.querySelectorAll('dd');
                dts.forEach((dt, idx) => {
                  const label = dt.textContent?.trim().toLowerCase();
                  const value = dds[idx]?.textContent?.trim();
                  
                  if (label?.includes('artist') || label?.includes('maker')) {
                    artist = value || '';
                  } else if (label?.includes('date')) {
                    year = value || '';
                  } else if (label?.includes('material') || label?.includes('medium')) {
                    medium = value || '';
                  } else if (label?.includes('dimension')) {
                    dimensions = value || '';
                  }
                });
              });
              
              // 작가 이름 (별도 위치)
              const artistEl = document.querySelector('.artistName, .artist, [class*="artist"]');
              if (artistEl && !artist) artist = artistEl.textContent?.trim() || '';
              
              return { artist, year, medium, dimensions, image };
            });
            
            artworks.push({
              id: `wallace-${roomNumber}-${Date.now()}-${i}`,
              title: link.title,
              artist: cleanText(details.artist),
              year: extractYear(details.year),
              medium: cleanText(details.medium),
              dimensions: cleanText(details.dimensions),
              description: '',
              image: details.image || '',
              accessionNumber: '',
              sourceUrl: link.href ? `https://wallacelive.wallacecollection.org${link.href}` : '',
            });
            
            process.stdout.write(`\r  📸 ${i + 1}/${linksToProcess.length} 완료 (${details.image ? '✓이미지' : '✗이미지'}, ${details.artist ? '✓작가' : '✗작가'})`);
            
          } catch (err) {
            console.log(`\n  ⚠️ 작품 ${i + 1} 오류: ${err.message.substring(0, 30)}`);
          }
        }
        
        console.log('');
        
        if (artworks.length > 0) {
          const withImg = artworks.filter(a => a.image).length;
          const withArtist = artworks.filter(a => a.artist).length;
          console.log(`  ✅ ${artworks.length}개 수집 (이미지: ${withImg}, 작가: ${withArtist})`);
          
          allRooms.push({
            id: `room-${roomNumber}`,
            name: `Room ${roomNumber}`,
            originalName: room.name,
            artworks,
          });
        }
        
      } catch (err) {
        console.log(`  ❌ 방 오류: ${err.message.substring(0, 50)}`);
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
  console.log(`📁 저장: ${OUTPUT_FILE}`);
  console.log(`🏠 ${rooms.length}개 방 | 🖼️ ${totalArtworks}개 작품`);
  console.log(`📷 이미지: ${withImages}개 | 🎨 작가: ${withArtist}개`);
  console.log('='.repeat(50));
}

scrapeWallaceCollection().catch(console.error);
