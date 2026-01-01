#!/usr/bin/env node
/**
 * Wallace Collection Permanent Display Scraper v5
 * Room 모듈 페이지 기반 스크래핑
 * URL: https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=room&viewType=detailList
 * 
 * 규칙:
 * - 방 이름 대신 순서대로 1,2,3... 번호 매김
 * - 6가지 아트워크 정보: title, artist, year, medium, dimensions, image
 * 
 * 사용법:
 *   node scripts/scrape-wallace-v5.cjs --test   # 처음 3개 방만
 *   node scripts/scrape-wallace-v5.cjs          # 전체 스크래핑
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'wallace-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/wallace-v5-progress.json');
const DEBUG_DIR = path.join(__dirname, '../downloads');

// 테스트 모드: 처음 3개 방만 스크래핑
const TEST_MODE = process.argv.includes('--test');
const MAX_ROOMS_TEST = 3;

// Room 모듈 시작 URL
const ROOM_MODULE_URL = 'https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=room&viewType=detailList';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanText(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

function extractYear(text) {
  if (!text) return null;
  // c. 1665, about 1800, 1750-1760, probably c. 1746, etc.
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
  console.log('🏛️ Wallace Collection Permanent Display Scraper v5');
  console.log(TEST_MODE ? '📍 테스트 모드: 첫 3개 방만 스크래핑\n' : '📍 전체 스크래핑 모드\n');
  
  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1400, height: 900 },
  });
  
  const page = await context.newPage();
  const allRooms = [];
  
  try {
    // 1. Room 모듈 페이지 접속
    console.log('📍 Room 모듈 페이지 접속 중...');
    await page.goto(ROOM_MODULE_URL, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await delay(3000);
    
    // 스크린샷 저장
    await page.screenshot({ path: path.join(DEBUG_DIR, 'wallace-v5-rooms.png') });
    
    // 2. 모든 방 링크 수집
    console.log('📍 방 목록 수집 중...');
    
    const roomLinks = await page.evaluate(() => {
      const links = [];
      // 방 링크 패턴: S10033 (First Floor), S10034 (Ground Floor), S10035 (Lower Ground Floor)
      const roomAnchors = document.querySelectorAll('a[href*="S10033"], a[href*="S10034"], a[href*="S10035"]');
      
      roomAnchors.forEach(a => {
        const text = a.textContent?.trim();
        const href = a.getAttribute('href');
        // Floor 자체가 아닌 실제 방 링크만 수집
        if (text && href && !text.includes('Floor') && text.length > 2) {
          links.push({ name: text, href });
        }
      });
      
      return links;
    });
    
    console.log(`\n✅ 발견된 방: ${roomLinks.length}개`);
    roomLinks.forEach((r, i) => console.log(`  ${i + 1}. ${r.name}`));
    
    // 3. 각 방 스크래핑
    const roomsToScrape = TEST_MODE ? roomLinks.slice(0, MAX_ROOMS_TEST) : roomLinks;
    
    for (let i = 0; i < roomsToScrape.length; i++) {
      const room = roomsToScrape[i];
      const roomNumber = i + 1;
      
      console.log(`\n🎨 [${roomNumber}/${roomsToScrape.length}] "${room.name}" 스크래핑...`);
      
      // 방 페이지로 이동
      const roomUrl = room.href.startsWith('http') 
        ? room.href 
        : `https://wallacelive.wallacecollection.org${room.href}`;
      
      await page.goto(roomUrl, {
        waitUntil: 'networkidle',
        timeout: 60000,
      });
      await delay(2000);
      
      // 작품 수집
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
      
      saveProgress({ rooms: allRooms, lastRoom: roomNumber, lastRoomName: room.name });
    }
    
  } catch (error) {
    console.error('스크래핑 오류:', error);
  } finally {
    await saveResults(allRooms);
    await browser.close();
  }
}

async function scrapeRoomArtworks(page, roomNumber) {
  const allArtworks = [];
  let pageNum = 1;
  const maxPages = 50;
  
  while (pageNum <= maxPages) {
    console.log(`    📄 페이지 ${pageNum}...`);
    
    // 현재 페이지에서 작품 추출
    const pageArtworks = await extractArtworksFromList(page, roomNumber);
    
    if (pageArtworks.length === 0) {
      break;
    }
    
    allArtworks.push(...pageArtworks);
    
    // 다음 페이지 확인 (페이지네이션)
    const hasNextPage = await page.evaluate(() => {
      // 페이지네이션 링크 찾기
      const nextLinks = document.querySelectorAll('a');
      for (const link of nextLinks) {
        const text = link.textContent?.trim();
        const href = link.getAttribute('href');
        if ((text === '>' || text === 'Next' || text === '»') && href) {
          return true;
        }
      }
      return false;
    });
    
    if (hasNextPage) {
      const nextClicked = await page.evaluate(() => {
        const nextLinks = document.querySelectorAll('a');
        for (const link of nextLinks) {
          const text = link.textContent?.trim();
          if (text === '>' || text === 'Next' || text === '»') {
            link.click();
            return true;
          }
        }
        return false;
      });
      
      if (nextClicked) {
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

async function extractArtworksFromList(page, roomNumber) {
  const artworks = [];
  
  try {
    // 작품 목록 추출
    const items = await page.evaluate(() => {
      const results = [];
      
      // 목록 아이템 찾기 - 다양한 선택자 시도
      const listItems = document.querySelectorAll('.resultItem, .listItem, li.item, .detailList li, ul.collection_list > li');
      
      if (listItems.length === 0) {
        // 대체: 테이블 또는 다른 구조
        const rows = document.querySelectorAll('table tr, .result');
        rows.forEach(row => {
          const titleEl = row.querySelector('a, .title, strong');
          const title = titleEl?.textContent?.trim();
          const href = titleEl?.getAttribute?.('href') || row.querySelector('a')?.getAttribute('href');
          const imgEl = row.querySelector('img');
          const image = imgEl?.src || '';
          
          if (title && title.length > 2) {
            results.push({ title, href, image });
          }
        });
      }
      
      listItems.forEach(item => {
        // 제목과 링크
        const titleLink = item.querySelector('a[href*="collection"]');
        const title = titleLink?.textContent?.trim() || '';
        const href = titleLink?.getAttribute('href') || '';
        
        // 이미지
        const imgEl = item.querySelector('img');
        const image = imgEl?.src || '';
        
        // 작가
        const artistLink = item.querySelector('a[href*="artist"]');
        const artist = artistLink?.textContent?.trim() || '';
        
        // 날짜 (일반적으로 마지막 텍스트)
        const allText = item.textContent || '';
        
        if (title && title.length > 2) {
          results.push({ title, href, image, artist, allText });
        }
      });
      
      return results;
    });
    
    // 수집된 데이터 처리
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // 연도 추출
      const year = extractYear(item.allText);
      
      artworks.push({
        id: `wallace-${roomNumber}-${Date.now()}-${i}`,
        title: cleanText(item.title),
        artist: cleanText(item.artist) || '',
        year: year,
        medium: '',
        dimensions: '',
        description: '',
        image: item.image || '',
        accessionNumber: '',
        sourceUrl: item.href ? (item.href.startsWith('http') ? item.href : `https://wallacelive.wallacecollection.org${item.href}`) : '',
      });
    }
    
    // 상세 정보가 필요하면 첫 몇 개 작품 상세 페이지 방문
    if (artworks.length > 0 && (!artworks[0].medium || !artworks[0].image)) {
      const detailCount = Math.min(artworks.length, 5);
      console.log(`    📷 상세 정보 수집 중 (${detailCount}개)...`);
      
      for (let i = 0; i < detailCount; i++) {
        if (artworks[i].sourceUrl) {
          try {
            await page.goto(artworks[i].sourceUrl, { waitUntil: 'networkidle', timeout: 30000 });
            await delay(1500);
            
            const details = await extractDetailInfo(page);
            Object.assign(artworks[i], {
              title: details.title || artworks[i].title,
              artist: details.artist || artworks[i].artist,
              year: details.year || artworks[i].year,
              medium: details.medium || '',
              dimensions: details.dimensions || '',
              image: details.image || artworks[i].image,
              accessionNumber: details.accessionNumber || '',
              description: details.description || '',
            });
          } catch (err) {
            console.log(`      ⚠️ 상세 정보 수집 실패: ${artworks[i].title}`);
          }
        }
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
      
      const getFieldValue = (label) => {
        // "Label: Value" 형태 또는 dt/dd 구조 찾기
        const dts = document.querySelectorAll('dt, .label, .fieldLabel');
        for (const dt of dts) {
          if (dt.textContent?.toLowerCase().includes(label.toLowerCase())) {
            const dd = dt.nextElementSibling;
            if (dd) return dd.textContent?.trim() || '';
          }
        }
        return '';
      };
      
      // 이미지 추출 (고해상도 우선)
      let image = '';
      const imgSelectors = [
        '.detailImage img',
        '.objectImage img',
        '#objectImage img',
        '.mainImage img',
        'img[src*="MuseumPlus"]',
        'img[src*="image"]',
      ];
      for (const sel of imgSelectors) {
        const img = document.querySelector(sel);
        if (img && img.src) {
          image = img.src;
          break;
        }
      }
      
      // 제목
      const title = getText(['.objectTitle h1', 'h1.title', '.detailTitle', 'h1', '.heading h1']);
      
      // 작가
      let artist = getText(['.artist a', '.creator a', '.maker a', '.artist', '.creator']);
      if (!artist) {
        artist = getFieldValue('Artist') || getFieldValue('Maker') || getFieldValue('Creator');
      }
      
      // 날짜
      let dateText = getText(['.objectDate', '.date', '.dating']);
      if (!dateText) {
        dateText = getFieldValue('Date') || getFieldValue('Dating') || getFieldValue('Year');
      }
      let year = null;
      if (dateText) {
        const yearMatch = dateText.match(/(\d{4})/);
        if (yearMatch) year = parseInt(yearMatch[1], 10);
      }
      
      // 재료/기법
      let medium = getFieldValue('Medium') || getFieldValue('Material') || getFieldValue('Technique');
      if (!medium) {
        medium = getText(['.medium', '.material', '.technique']);
      }
      
      // 크기
      let dimensions = getFieldValue('Dimensions') || getFieldValue('Size') || getFieldValue('Measurements');
      if (!dimensions) {
        dimensions = getText(['.dimensions', '.size', '.measurements']);
      }
      
      // 소장번호
      let accessionNumber = getFieldValue('Museum Number') || getFieldValue('Accession') || getFieldValue('Inventory');
      if (!accessionNumber) {
        accessionNumber = getText(['.accession', '.inventory', '.museumNumber']);
      }
      
      // 설명
      const description = getText(['.description', '.objectDescription', '.notes']);
      
      return {
        title,
        artist,
        year,
        medium,
        dimensions,
        image,
        accessionNumber,
        description,
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
