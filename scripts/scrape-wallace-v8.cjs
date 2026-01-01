#!/usr/bin/env node
/**
 * Wallace Collection 스크래퍼 v8
 * 상세 페이지에서 이미지, 작가, 연도, 매체 수집
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'wallace-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/wallace-v8-progress.json');

const TEST_MODE = process.argv.includes('--test');
const ENRICH_ONLY = process.argv.includes('--enrich'); // 상세 정보만 수집
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
  console.log('🏛️ Wallace Collection Permanent Display Scraper v8');
  console.log(TEST_MODE ? '📍 테스트 모드: 첫 3개 방만 스크래핑\n' : '📍 전체 스크래핑 모드\n');
  
  const browser = await chromium.launch({
    headless: true,  // 백그라운드 실행
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
          await delay(1500);
          
          // 작품 목록 추출
          const basicArtworks = await extractBasicArtworks(page, roomNumber);
          console.log(`    📄 ${basicArtworks.length}개 작품 발견`);
          
          // 상세 정보 수집 (처음 20개만)
          const enrichedArtworks = [];
          const toEnrich = basicArtworks.slice(0, 30); // 방당 최대 30개
          
          for (let j = 0; j < toEnrich.length; j++) {
            const artwork = toEnrich[j];
            
            if (artwork.sourceUrl) {
              console.log(`    📷 [${j + 1}/${toEnrich.length}] ${artwork.title.substring(0, 30)}...`);
              
              try {
                const detailPage = await context.newPage();
                await detailPage.goto(artwork.sourceUrl, {
                  waitUntil: 'networkidle',
                  timeout: 30000,
                });
                await delay(1000);
                
                const details = await extractDetailInfo(detailPage);
                
                enrichedArtworks.push({
                  ...artwork,
                  artist: details.artist || artwork.artist,
                  year: details.year || artwork.year,
                  medium: details.medium || artwork.medium,
                  dimensions: details.dimensions || artwork.dimensions,
                  image: details.image || artwork.image,
                  accessionNumber: details.accessionNumber || artwork.accessionNumber,
                });
                
                await detailPage.close();
                await delay(500);
                
              } catch (err) {
                console.log(`      ⚠️ 상세 정보 수집 실패`);
                enrichedArtworks.push(artwork);
              }
            } else {
              enrichedArtworks.push(artwork);
            }
          }
          
          // 나머지 작품들도 추가 (상세 정보 없이)
          enrichedArtworks.push(...basicArtworks.slice(30));
          
          if (enrichedArtworks.length > 0) {
            console.log(`  ✅ ${enrichedArtworks.length}개 작품 수집됨`);
            allRooms.push({
              id: `room-${roomNumber}`,
              name: `Room ${roomNumber}`,
              originalName: room.name,
              artworks: enrichedArtworks,
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

async function extractBasicArtworks(page, roomNumber) {
  const artworks = [];
  const seen = new Set();
  
  try {
    const items = await page.evaluate(() => {
      const results = [];
      
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
        
        // 썸네일 이미지
        const img = li.querySelector('img');
        let image = '';
        if (img && img.src) {
          image = img.src;
        }
        
        // 날짜
        const allText = li.textContent || '';
        let date = '';
        const dateMatch = allText.match(/(?:about\s*|c\.\s*)?(\d{4})(?:\s*[-–]\s*\d{4})?/);
        if (dateMatch) date = dateMatch[0];
        
        results.push({ title, href, artist, date, image });
      });
      
      return results;
    });
    
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
    
  } catch (err) {
    console.log(`    ❌ 추출 오류: ${err.message}`);
  }
  
  return artworks;
}

async function extractDetailInfo(page) {
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
        // 메인 이미지 찾기
        const selectors = [
          '.objImage img',
          '.detailImage img',
          '.image-detail img',
          '.mediaContainer img',
          '#primaryImage img',
          '.mainImage img',
          'img.mainImage',
          '.object-image img',
          'img[src*="image"]',
          '.detail img',
          'img[width="300"]',
          'img[width="400"]',
        ];
        
        for (const sel of selectors) {
          const img = document.querySelector(sel);
          if (img && img.src && !img.src.includes('thumbnail') && !img.src.includes('thumb_')) {
            return img.src;
          }
        }
        
        // 큰 이미지 찾기
        const allImgs = document.querySelectorAll('img');
        for (const img of allImgs) {
          if (img.width >= 200 || img.height >= 200 || 
              (img.src && (img.src.includes('image') || img.src.includes('media')))) {
            return img.src;
          }
        }
        
        return '';
      };
      
      // 필드 값 추출
      const getFieldValue = (labels) => {
        // 라벨로 찾기
        for (const label of labels) {
          const allLabels = document.querySelectorAll('th, label, .label, dt, strong');
          for (const el of allLabels) {
            if (el.textContent?.toLowerCase().includes(label.toLowerCase())) {
              const nextEl = el.nextElementSibling;
              if (nextEl) return nextEl.textContent?.trim() || '';
              
              // 부모의 다음 요소
              const parent = el.closest('tr, .field, .row, dl');
              if (parent) {
                const valueEl = parent.querySelector('td, .value, dd');
                if (valueEl) return valueEl.textContent?.trim() || '';
              }
            }
          }
        }
        return '';
      };
      
      // 제목
      const title = getText(['.objectTitle', 'h1', '.title', '.heading']);
      
      // 작가
      const artist = getText(['.artist a', '.artist', '.creator', '.maker']) ||
                     getFieldValue(['Artist', 'Maker', 'Creator', 'Author', 'By']);
      
      // 날짜
      const dateText = getText(['.date', '.dating', '.objectDate']) ||
                       getFieldValue(['Date', 'Dating', 'Period', 'Year']);
      let year = null;
      if (dateText) {
        const yearMatch = dateText.match(/(\d{4})/);
        if (yearMatch) year = parseInt(yearMatch[1], 10);
      }
      
      // 매체
      const medium = getText(['.medium', '.material', '.technique']) ||
                     getFieldValue(['Medium', 'Material', 'Technique', 'Materials']);
      
      // 크기
      const dimensions = getText(['.dimensions', '.measurements', '.size']) ||
                         getFieldValue(['Dimensions', 'Size', 'Measurements']);
      
      // 소장번호
      const accessionNumber = getText(['.accession', '.inventory', '.objectNumber', '.museumNumber']) ||
                              getFieldValue(['Museum Number', 'Accession', 'Inventory', 'Object Number']);
      
      return {
        title,
        artist,
        year,
        medium,
        dimensions,
        image: getImage(),
        accessionNumber,
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
  const withImages = rooms.reduce((sum, r) => sum + r.artworks.filter(a => a.image).length, 0);
  
  const result = {
    museum: 'The Wallace Collection',
    museumId: 'wallace-collection',
    location: 'London, UK',
    type: 'permanent',
    scrapedAt: new Date().toISOString(),
    totalRooms: rooms.length,
    totalArtworks,
    artworksWithImages: withImages,
    rooms,
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ 스크래핑 완료!');
  console.log(`📁 저장 위치: ${OUTPUT_FILE}`);
  console.log(`🏠 총 ${rooms.length}개 방`);
  console.log(`🖼️ 총 ${totalArtworks}개 작품`);
  console.log(`📷 이미지 있는 작품: ${withImages}개`);
  console.log('='.repeat(50));
}

scrapeWallaceCollection().catch(console.error);
