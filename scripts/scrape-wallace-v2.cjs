#!/usr/bin/env node
/**
 * Wallace Collection Permanent Display Scraper v2
 * eMuseumPlus 시스템 - Room 필터 기반 스크래핑
 * 
 * 규칙:
 * - 방 이름 대신 순서대로 1,2,3... 번호 매김
 * - 6가지 아트워크 정보: title, artist, year, medium, dimensions, image
 * 
 * 사용법:
 *   node scripts/scrape-wallace-v2.cjs --test   # 처음 3개 방만
 *   node scripts/scrape-wallace-v2.cjs          # 전체 스크래핑
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'wallace-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/wallace-progress.json');

// 테스트 모드: 처음 3개 방만 스크래핑
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
  const match = text.match(/(?:c\.\s*|about\s*|circa\s*)?(\d{4})(?:\s*[-–]\s*\d{4})?/i);
  if (match) {
    const year = parseInt(match[1], 10);
    if (year >= 1000 && year <= 2025) return year;
  }
  return null;
}

async function scrapeWallaceCollection() {
  console.log('🏛️ Wallace Collection Permanent Display Scraper v2');
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
  const rooms = [];
  
  try {
    // 1. eMuseumPlus 메인 페이지 접속
    console.log('📍 eMuseumPlus 접속 중...');
    await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await delay(2000);
    
    const title = await page.title();
    console.log(`📄 페이지 제목: ${title}`);
    
    // 2. Room 드롭다운에서 모든 방 목록 추출
    console.log('📍 Room 필터 옵션 수집 중...');
    
    const roomOptions = await page.evaluate(() => {
      const options = [];
      // Room select 옵션 찾기
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        const opts = select.querySelectorAll('option');
        for (const opt of opts) {
          const text = opt.textContent?.trim();
          const value = opt.value;
          if (text && value && (
            text.includes('Room') ||
            text.includes('Gallery') ||
            text.includes('Drawing Room') ||
            text.includes('State Room') ||
            text.includes('Landing') ||
            text.includes('Staircase')
          )) {
            options.push({ name: text, value });
          }
        }
      }
      return options;
    });
    
    console.log(`\n발견된 방: ${roomOptions.length}개`);
    roomOptions.forEach((r, i) => console.log(`  ${i + 1}. ${r.name}`));
    
    // 3. 실제로 방에서 사용되는 Room 필터로 검색
    // Gallery by Gallery 링크 클릭
    console.log('\n📍 Gallery by Gallery 탐색...');
    
    const galleryLink = await page.$('a:has-text("Gallery by Gallery"), a:has-text("Explore by Gallery")');
    if (galleryLink) {
      await galleryLink.click();
      await delay(3000);
      
      // 페이지에서 방 목록 추출
      const galleryRooms = await page.evaluate(() => {
        const rooms = [];
        document.querySelectorAll('a').forEach(a => {
          const text = a.textContent?.trim();
          const href = a.getAttribute('href');
          if (text && href && (
            text.includes('Room') ||
            text.includes('Gallery') ||
            text.includes('Drawing Room') ||
            text.includes('State Room') ||
            text.includes('Landing') ||
            text.includes('Staircase') ||
            text.includes('West ') ||
            text.includes('East ')
          )) {
            rooms.push({ name: text, href });
          }
        });
        return rooms;
      });
      
      if (galleryRooms.length > 0) {
        console.log(`Gallery 페이지에서 발견된 방: ${galleryRooms.length}개`);
        
        const roomsToProcess = TEST_MODE ? galleryRooms.slice(0, MAX_ROOMS_TEST) : galleryRooms;
        
        for (let i = 0; i < roomsToProcess.length; i++) {
          const room = roomsToProcess[i];
          const roomNumber = i + 1;
          console.log(`\n🎨 [${roomNumber}/${roomsToProcess.length}] ${room.name} 스크래핑...`);
          
          const artworks = await scrapeRoomByLink(page, room.href, roomNumber);
          console.log(`  ✅ ${artworks.length}개 작품 수집됨`);
          
          rooms.push({
            roomNumber,
            originalName: room.name,
            artworks,
          });
          
          saveProgress({ rooms, lastRoom: roomNumber });
          await delay(1500);
        }
      }
    }
    
    // Gallery 링크가 없으면 Room 필터로 검색
    if (rooms.length === 0 && roomOptions.length > 0) {
      console.log('\n📍 Room 필터로 검색 시도...');
      
      const roomsToProcess = TEST_MODE ? roomOptions.slice(0, MAX_ROOMS_TEST) : roomOptions;
      
      for (let i = 0; i < roomsToProcess.length; i++) {
        const room = roomsToProcess[i];
        const roomNumber = i + 1;
        console.log(`\n🎨 [${roomNumber}/${roomsToProcess.length}] ${room.name} 스크래핑...`);
        
        const artworks = await scrapeRoomByFilter(page, room.name, room.value, roomNumber);
        console.log(`  ✅ ${artworks.length}개 작품 수집됨`);
        
        rooms.push({
          roomNumber,
          originalName: room.name,
          artworks,
        });
        
        saveProgress({ rooms, lastRoom: roomNumber });
        await delay(1500);
      }
    }
    
  } catch (error) {
    console.error('스크래핑 오류:', error);
  } finally {
    await saveResults(rooms);
    await browser.close();
  }
}

async function scrapeRoomByLink(page, href, roomNumber) {
  const artworks = [];
  
  try {
    const fullUrl = href.startsWith('http') ? href : `https://wallacelive.wallacecollection.org${href}`;
    await page.goto(fullUrl, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await delay(2000);
    
    // 작품 목록 페이지에서 모든 작품 수집
    let hasNextPage = true;
    let pageNum = 1;
    
    while (hasNextPage && pageNum <= 100) {
      console.log(`    📄 페이지 ${pageNum}...`);
      
      const pageArtworks = await extractArtworksFromList(page, roomNumber);
      artworks.push(...pageArtworks);
      
      // 다음 페이지 확인
      const nextBtn = await page.$('a:has-text("Next"), a:has-text(">"), .paging a.next');
      if (nextBtn) {
        const isDisabled = await nextBtn.evaluate(el => 
          el.classList.contains('disabled') || el.getAttribute('disabled')
        );
        if (!isDisabled) {
          await nextBtn.click();
          await delay(2000);
          pageNum++;
        } else {
          hasNextPage = false;
        }
      } else {
        hasNextPage = false;
      }
    }
    
  } catch (err) {
    console.log(`  ❌ 방 스크래핑 오류: ${err.message}`);
  }
  
  return artworks;
}

async function scrapeRoomByFilter(page, roomName, roomValue, roomNumber) {
  const artworks = [];
  
  try {
    // 메인 검색 페이지로 이동
    await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=collection&moduleFunction=search', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await delay(2000);
    
    // Room 드롭다운에서 해당 방 선택
    const roomSelect = await page.$('select[name*="room"], select[name*="Room"]');
    if (roomSelect) {
      await roomSelect.selectOption({ label: roomName });
      await delay(500);
    } else {
      // select가 없으면 모든 select에서 시도
      const selects = await page.$$('select');
      for (const select of selects) {
        const options = await select.$$eval('option', opts => 
          opts.map(o => ({ text: o.textContent?.trim(), value: o.value }))
        );
        const hasRoom = options.find(o => o.text === roomName);
        if (hasRoom) {
          await select.selectOption({ label: roomName });
          await delay(500);
          break;
        }
      }
    }
    
    // 검색 버튼 클릭
    const searchBtn = await page.$('input[type="submit"], button[type="submit"], input[value="Search"], button:has-text("Search")');
    if (searchBtn) {
      await searchBtn.click();
      await delay(3000);
    }
    
    // 결과 페이지에서 작품 수집
    let hasNextPage = true;
    let pageNum = 1;
    
    while (hasNextPage && pageNum <= 100) {
      console.log(`    📄 페이지 ${pageNum}...`);
      
      const pageArtworks = await extractArtworksFromList(page, roomNumber);
      artworks.push(...pageArtworks);
      
      // 다음 페이지
      const nextBtn = await page.$('a:has-text("Next"), a:has-text(">"), .paging a.next');
      if (nextBtn) {
        const isDisabled = await nextBtn.evaluate(el => 
          el.classList.contains('disabled') || el.getAttribute('disabled')
        );
        if (!isDisabled) {
          await nextBtn.click();
          await delay(2000);
          pageNum++;
        } else {
          hasNextPage = false;
        }
      } else {
        hasNextPage = false;
      }
    }
    
  } catch (err) {
    console.log(`  ❌ 방 스크래핑 오류: ${err.message}`);
  }
  
  return artworks;
}

async function extractArtworksFromList(page, roomNumber) {
  // 리스트에서 상세 페이지 링크 추출
  const detailLinks = await page.evaluate(() => {
    const links = [];
    // eMuseumPlus 결과 리스트의 링크들
    document.querySelectorAll('a[href*="detail"], a[href*="Detail"], .resultItem a, .object a').forEach(a => {
      const href = a.getAttribute('href');
      if (href && !links.includes(href)) {
        links.push(href);
      }
    });
    // 이미지 링크도 확인
    document.querySelectorAll('a img, .thumbnail a').forEach(el => {
      const a = el.closest('a') || el;
      const href = a.getAttribute ? a.getAttribute('href') : null;
      if (href && !links.includes(href)) {
        links.push(href);
      }
    });
    return links;
  });
  
  const artworks = [];
  
  for (const link of detailLinks) {
    const artwork = await scrapeArtworkDetail(page, link, roomNumber);
    if (artwork) {
      artworks.push(artwork);
      console.log(`      ✓ ${artwork.title?.substring(0, 50)}...`);
    }
    await delay(500);
  }
  
  return artworks;
}

async function scrapeArtworkDetail(page, link, roomNumber) {
  const originalUrl = page.url();
  
  try {
    const fullUrl = link.startsWith('http') ? link : `https://wallacelive.wallacecollection.org${link}`;
    await page.goto(fullUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await delay(1000);
    
    const details = await page.evaluate(() => {
      const result = {
        title: '',
        artist: '',
        year: null,
        medium: '',
        dimensions: '',
        description: '',
        image: '',
        accessionNumber: '',
      };
      
      // 제목 - 여러 선택자 시도
      const titleSelectors = ['h1', '.objectTitle', '.title', '#objectTitle'];
      for (const sel of titleSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          result.title = el.textContent?.trim() || '';
          if (result.title) break;
        }
      }
      
      // 이미지
      const imgSelectors = [
        'img.mainImage', 
        '.detailImage img', 
        '#mainImage', 
        'img[src*="zoom"]',
        '.objectImage img',
        'meta[property="og:image"]'
      ];
      for (const sel of imgSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          result.image = el.getAttribute('src') || el.getAttribute('content') || '';
          if (result.image) break;
        }
      }
      
      // 메타데이터 테이블에서 추출
      const extractField = (patterns) => {
        // 테이블 행에서 찾기
        const rows = document.querySelectorAll('tr, dt, .field, .attribute');
        for (const row of rows) {
          const label = row.querySelector('th, dt, .label, .fieldLabel');
          const value = row.querySelector('td, dd, .value, .fieldValue');
          if (label && value) {
            const labelText = label.textContent?.toLowerCase() || '';
            for (const pattern of patterns) {
              if (labelText.includes(pattern)) {
                return value.textContent?.trim() || '';
              }
            }
          }
        }
        return '';
      };
      
      result.artist = extractField(['artist', 'creator', 'maker', 'by']);
      result.medium = extractField(['medium', 'material', 'technique']);
      result.dimensions = extractField(['dimension', 'size', 'measurement']);
      result.accessionNumber = extractField(['accession', 'inventory', 'number', 'object number']);
      
      // 날짜/년도
      const dateText = extractField(['date', 'year', 'period', 'created']);
      if (dateText) {
        const match = dateText.match(/\d{4}/);
        if (match) result.year = parseInt(match[0], 10);
      }
      
      // 설명
      const descSelectors = ['.description', '.objectDescription', 'meta[name="description"]'];
      for (const sel of descSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          result.description = el.textContent?.trim() || el.getAttribute('content') || '';
          if (result.description) break;
        }
      }
      
      return result;
    });
    
    // 원래 페이지로 돌아가기
    await page.goto(originalUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(500);
    
    // 유효한 작품인지 확인 (제목 또는 이미지가 있어야 함)
    if (!details.title && !details.image) {
      return null;
    }
    
    return {
      id: `wallace-${roomNumber}-${Date.now()}`,
      ...details,
      sourceUrl: link,
    };
    
  } catch (err) {
    // 오류 시 원래 페이지로 돌아가기 시도
    try {
      await page.goto(originalUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch {}
    return null;
  }
}

function saveProgress(data) {
  const dir = path.dirname(PROGRESS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

async function saveResults(rooms) {
  const totalArtworks = rooms.reduce((sum, r) => sum + r.artworks.length, 0);
  
  const collection = {
    museum: 'The Wallace Collection',
    museumId: 'wallace-collection',
    location: 'London, UK',
    type: 'permanent',
    scrapedAt: new Date().toISOString(),
    totalRooms: rooms.length,
    totalArtworks,
    rooms: rooms.map(r => ({
      id: `room-${r.roomNumber}`,
      name: `Room ${r.roomNumber}`,
      originalName: r.originalName,
      artworks: r.artworks.map((a, idx) => ({
        id: `wallace-${r.roomNumber}-${idx + 1}`,
        title: cleanText(a.title),
        artist: cleanText(a.artist),
        year: a.year,
        medium: cleanText(a.medium),
        dimensions: cleanText(a.dimensions),
        description: cleanText(a.description),
        image: a.image,
        accessionNumber: a.accessionNumber,
        sourceUrl: a.sourceUrl,
      })),
    })),
  };
  
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2));
  console.log(`\n✅ 완료!`);
  console.log(`📊 ${rooms.length}개 방, ${totalArtworks}개 작품 저장됨`);
  console.log(`📁 저장 위치: ${OUTPUT_FILE}`);
}

scrapeWallaceCollection().catch(console.error);
