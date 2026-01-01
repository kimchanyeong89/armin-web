#!/usr/bin/env node
/**
 * Wallace Collection Permanent Display Scraper v4
 * eMuseumPlus 시스템 - Location 필터 기반 스크래핑
 * 
 * 규칙:
 * - 방 이름 대신 순서대로 1,2,3... 번호 매김
 * - 6가지 아트워크 정보: title, artist, year, medium, dimensions, image
 * 
 * 사용법:
 *   node scripts/scrape-wallace-v4.cjs --test   # 처음 3개 방만
 *   node scripts/scrape-wallace-v4.cjs          # 전체 스크래핑
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'wallace-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/wallace-v4-progress.json');
const DEBUG_DIR = path.join(__dirname, '../downloads');

// 테스트 모드: 처음 3개 방만 스크래핑
const TEST_MODE = process.argv.includes('--test');
const MAX_ROOMS_TEST = 3;

// Location (방) 목록 - HTML에서 추출 (value와 이름)
const LOCATIONS = [
  { value: '6', name: 'Back State Room' },
  { value: '7', name: 'Billiard Room' },
  { value: '11', name: 'Dining Room' },
  { value: '12', name: 'East Drawing Room' },
  { value: '13', name: 'East Galleries I' },
  { value: '14', name: 'East Galleries II' },
  { value: '15', name: 'East Galleries III' },
  { value: '19', name: 'Front State Room' },
  { value: '21', name: 'Great Gallery' },
  { value: '23', name: "Housekeeper's Room" },
  { value: '25', name: 'Large Drawing Room' },
  { value: '29', name: 'Oval Drawing Room' },
  { value: '31', name: 'Sixteenth Century Gallery' },
  { value: '32', name: 'Small Drawing Room' },
  { value: '33', name: 'Smoking Room' },
  { value: '34', name: 'Smoking Room Corridor' },
  { value: '37', name: 'West Gallery I' },
  { value: '38', name: 'West Gallery II' },
  { value: '39', name: 'West Gallery III' },
  { value: '41', name: 'West Room' },
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
  console.log('🏛️ Wallace Collection Permanent Display Scraper v4');
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
    // 1. eMuseumPlus 검색 페이지 접속
    console.log('📍 eMuseumPlus 검색 페이지 접속 중...');
    const baseUrl = 'https://wallacelive.wallacecollection.org/eMP/eMuseumPlus';
    await page.goto(baseUrl, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await delay(3000);
    
    // 스크린샷 저장
    await page.screenshot({ path: path.join(DEBUG_DIR, 'wallace-v4-main.png') });
    
    const locationsToScrape = TEST_MODE ? LOCATIONS.slice(0, MAX_ROOMS_TEST) : LOCATIONS;
    
    for (let i = 0; i < locationsToScrape.length; i++) {
      const location = locationsToScrape[i];
      const roomNumber = i + 1;
      
      console.log(`\n🎨 [${roomNumber}/${locationsToScrape.length}] "${location.name}" 스크래핑...`);
      
      // 검색 페이지로 이동
      await page.goto(baseUrl, {
        waitUntil: 'networkidle',
        timeout: 60000,
      });
      await delay(2000);
      
      // Location 드롭다운 찾기 및 선택
      const locationSelect = await page.$('#field_10365');
      if (locationSelect) {
        await locationSelect.selectOption({ value: location.value });
        await delay(500);
        console.log(`  ✓ Location 선택됨: ${location.name}`);
      } else {
        console.log(`  ⚠️ Location 드롭다운을 찾을 수 없음`);
        continue;
      }
      
      // 이미지 필터는 스킵 (visible하지 않을 수 있음)
      
      // 검색 버튼 클릭
      const searchBtn = await page.$('.startButton input[type="submit"], input.submit, button[type="submit"]');
      if (searchBtn) {
        await searchBtn.click();
        console.log('  ✓ 검색 실행...');
        await delay(4000);
      } else {
        // form submit 시도
        await page.keyboard.press('Enter');
        await delay(4000);
      }
      
      // 결과 페이지 스크린샷
      await page.screenshot({ path: path.join(DEBUG_DIR, `wallace-v4-room-${roomNumber}.png`) });
      
      // 작품 수집
      const artworks = await scrapeAllPages(page, roomNumber);
      
      if (artworks.length > 0) {
        console.log(`  ✅ ${artworks.length}개 작품 수집됨`);
        allRooms.push({
          id: `room-${roomNumber}`,
          name: `Room ${roomNumber}`,
          originalName: location.name,
          artworks,
        });
      } else {
        console.log(`  ⚠️ 작품을 찾지 못함`);
      }
      
      saveProgress({ rooms: allRooms, lastRoom: roomNumber, lastRoomName: location.name });
    }
    
  } catch (error) {
    console.error('스크래핑 오류:', error);
  } finally {
    await saveResults(allRooms);
    await browser.close();
  }
}

async function scrapeAllPages(page, roomNumber) {
  const allArtworks = [];
  let pageNum = 1;
  const maxPages = 50;
  
  while (pageNum <= maxPages) {
    console.log(`    📄 페이지 ${pageNum}...`);
    
    // 현재 페이지에서 작품 추출
    const pageArtworks = await extractArtworksFromPage(page, roomNumber);
    
    if (pageArtworks.length === 0 && pageNum === 1) {
      // 첫 페이지에서 결과 없음 - 상세 페이지일 수 있음
      const detailArtwork = await extractSingleArtwork(page, roomNumber);
      if (detailArtwork) {
        allArtworks.push(detailArtwork);
      }
      break;
    }
    
    allArtworks.push(...pageArtworks);
    
    // 다음 페이지 확인
    const nextBtn = await page.$('a.elementNavigatorNext, a[title*="Next"], .paging a:has-text(">")');
    if (nextBtn) {
      const isDisabled = await nextBtn.evaluate(el => {
        const classList = el.classList.toString();
        return classList.includes('disabled') || 
               el.getAttribute('disabled') !== null ||
               el.getAttribute('href') === '#' ||
               !el.getAttribute('href');
      });
      
      if (!isDisabled) {
        await nextBtn.click();
        await delay(2000);
        pageNum++;
      } else {
        break;
      }
    } else {
      break;
    }
  }
  
  return allArtworks;
}

async function extractArtworksFromPage(page, roomNumber) {
  const artworks = [];
  
  try {
    // 결과 목록 찾기
    const items = await page.$$('.resultItem, .listItem, .detailList .item, table.resultTable tr');
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      const data = await item.evaluate(el => {
        // 이미지 URL
        const img = el.querySelector('img');
        const image = img ? img.src : '';
        
        // 링크
        const link = el.querySelector('a');
        const sourceUrl = link ? link.href : '';
        
        // 텍스트 추출
        const titleEl = el.querySelector('.objectTitle, .title, h3, h4, strong, a');
        const title = titleEl ? titleEl.textContent?.trim() : '';
        
        const artistEl = el.querySelector('.artist, .creator, .maker');
        const artist = artistEl ? artistEl.textContent?.trim() : '';
        
        const dateEl = el.querySelector('.date, .dating');
        const date = dateEl ? dateEl.textContent?.trim() : '';
        
        return { title, artist, date, image, sourceUrl };
      });
      
      if (data.title && data.title.length > 2) {
        artworks.push({
          id: `wallace-${roomNumber}-${Date.now()}-${i}`,
          title: cleanText(data.title),
          artist: cleanText(data.artist),
          year: extractYear(data.date) || extractYear(data.title),
          medium: '',
          dimensions: '',
          description: '',
          image: data.image,
          accessionNumber: '',
          sourceUrl: data.sourceUrl,
        });
      }
    }
    
    // 목록이 없으면 테이블/그리드 형태 시도
    if (artworks.length === 0) {
      const links = await page.$$('a[href*="detail"]');
      
      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        
        const data = await link.evaluate(el => {
          const text = el.textContent?.trim() || '';
          const href = el.href || '';
          const img = el.querySelector('img') || el.closest('tr, .item, .result')?.querySelector('img');
          const image = img ? img.src : '';
          
          return { title: text, sourceUrl: href, image };
        });
        
        if (data.title && data.title.length > 2 && data.sourceUrl.includes('detail')) {
          artworks.push({
            id: `wallace-${roomNumber}-${Date.now()}-${i}`,
            title: cleanText(data.title),
            artist: '',
            year: null,
            medium: '',
            dimensions: '',
            description: '',
            image: data.image,
            accessionNumber: '',
            sourceUrl: data.sourceUrl,
          });
        }
      }
    }
    
    // 상세 정보 수집 (처음 10개만)
    if (artworks.length > 0 && !artworks[0].artist) {
      console.log(`    📷 상세 정보 수집 중 (${Math.min(artworks.length, 10)}개)...`);
      
      for (let i = 0; i < Math.min(artworks.length, 10); i++) {
        if (artworks[i].sourceUrl) {
          try {
            await page.goto(artworks[i].sourceUrl, { waitUntil: 'networkidle', timeout: 30000 });
            await delay(1500);
            
            const details = await extractDetailInfo(page);
            Object.assign(artworks[i], {
              title: details.title || artworks[i].title,
              artist: details.artist || artworks[i].artist,
              year: details.year || artworks[i].year,
              medium: details.medium || artworks[i].medium,
              dimensions: details.dimensions || artworks[i].dimensions,
              image: details.image || artworks[i].image,
              accessionNumber: details.accessionNumber || artworks[i].accessionNumber,
            });
          } catch (err) {
            // 무시
          }
        }
      }
    }
    
  } catch (err) {
    console.log(`    ❌ 페이지 추출 오류: ${err.message}`);
  }
  
  return artworks;
}

async function extractSingleArtwork(page, roomNumber) {
  try {
    const details = await extractDetailInfo(page);
    if (details.title) {
      return {
        id: `wallace-${roomNumber}-${Date.now()}`,
        ...details,
      };
    }
  } catch (err) {
    // 무시
  }
  return null;
}

async function extractDetailInfo(page) {
  try {
    return await page.evaluate(() => {
      const getText = (selectors) => {
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          for (const el of els) {
            const text = el.textContent?.trim();
            if (text && text.length > 0) return text;
          }
        }
        return '';
      };
      
      const getFieldValue = (label) => {
        // "Label: Value" 형태 찾기
        const allText = document.body.innerText || '';
        const regex = new RegExp(`${label}[:\\s]+([^\\n]+)`, 'i');
        const match = allText.match(regex);
        return match ? match[1].trim() : '';
      };
      
      // 이미지 추출
      const imgEl = document.querySelector('.detailImage img, .objectImage img, #primaryImage img, .mainImage img, .image img');
      const image = imgEl ? imgEl.src : '';
      
      // 제목
      const title = getText(['.objectTitle', 'h1.title', '.detailTitle', 'h1', '.heading']);
      
      // 작가
      const artist = getText(['.artist', '.creator', '.maker', '.author']) || 
                    getFieldValue('Artist') || 
                    getFieldValue('Maker') ||
                    getFieldValue('Creator');
      
      // 날짜
      const dateText = getText(['.date', '.dating', '.objectDate']) || 
                       getFieldValue('Date') ||
                       getFieldValue('Dating');
      let year = null;
      if (dateText) {
        const yearMatch = dateText.match(/(\d{4})/);
        if (yearMatch) year = parseInt(yearMatch[1], 10);
      }
      
      // 재료/기법
      const medium = getText(['.medium', '.material', '.technique']) ||
                    getFieldValue('Medium') ||
                    getFieldValue('Material') ||
                    getFieldValue('Technique');
      
      // 크기
      const dimensions = getText(['.dimensions', '.measurements', '.size']) ||
                        getFieldValue('Dimensions') ||
                        getFieldValue('Size');
      
      // 소장번호
      const accessionNumber = getText(['.accession', '.inventory', '.objectNumber', '.museumNumber']) ||
                              getFieldValue('Museum Number') ||
                              getFieldValue('Accession') ||
                              getFieldValue('Inventory');
      
      return {
        title,
        artist,
        year,
        medium,
        dimensions,
        image,
        accessionNumber,
        description: '',
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
