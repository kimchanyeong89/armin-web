#!/usr/bin/env node
/**
 * Wallace Collection - 누락된 방 개별 스크래핑
 * Arms and Armour I, IV, Smoking Room 전용
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUTPUT_FILE = path.join(__dirname, '../public/data/wallace-collection.json');
const PLACEHOLDER_SIZE = 13449;

// 누락된 방 목록 (방 이름)
const MISSING_ROOMS = [
  'Arms and Armour I',
  'Arms and Armour IV',
  'Smoking Room',
];

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkPlaceholder(url) {
  return new Promise((resolve) => {
    if (!url) { resolve(true); return; }
    const req = https.request(url, { method: 'HEAD', timeout: 8000 }, (res) => {
      const size = parseInt(res.headers['content-length'] || '0', 10);
      resolve(size === PLACEHOLDER_SIZE);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

async function checkPlaceholderBatch(urls) {
  return Promise.all(urls.map(url => checkPlaceholder(url)));
}

async function main() {
  console.log('🏛️ Wallace Collection - 누락된 방 스크래핑\n');
  
  const existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
  const existingRoomNames = new Set(existingData.rooms.map(r => r.originalName));
  
  console.log(`📂 기존: ${existingData.rooms.length}개 방, ${existingData.totalArtworks}개 작품\n`);
  
  const missingToScrape = MISSING_ROOMS.filter(name => !existingRoomNames.has(name));
  if (missingToScrape.length === 0) {
    console.log('✅ 모든 방이 이미 존재합니다.');
    return;
  }
  
  console.log(`🔍 스크래핑할 방: ${missingToScrape.join(', ')}\n`);
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    viewport: { width: 1400, height: 900 },
  });
  
  const page = await context.newPage();
  let addedRooms = 0;
  let roomNumber = existingData.rooms.length;
  
  try {
    // 방 모듈로 직접 접근 (모든 방 나열)
    const roomsUrl = 'https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=room&lang=en';
    console.log('📋 방 목록 페이지 로드...');
    await page.goto(roomsUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await delay(3000);
    
    for (const roomName of missingToScrape) {
      roomNumber++;
      console.log(`\n[${roomName}] 스크래핑 시작...`);
      
      try {
        // 방 목록으로 돌아가기
        await page.goto(roomsUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await delay(2000);
        
        // 방 링크 찾아서 클릭
        const roomLinks = await page.$$('a');
        let clicked = false;
        
        for (const link of roomLinks) {
          const text = await link.textContent();
          if (text && text.trim() === roomName) {
            await link.click();
            clicked = true;
            break;
          }
        }
        
        if (!clicked) {
          // 검색으로 시도
          const searchUrl = `https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=collection&filterName=room&filterValue=${encodeURIComponent(roomName)}`;
          await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
        }
        
        await page.waitForLoadState('networkidle', { timeout: 30000 });
        await delay(3000);
        
        // 작품 추출
        const artworks = await page.evaluate((roomNum) => {
          const results = [];
          const seen = new Set();
          
          document.querySelectorAll('.listImg, dt.listImg').forEach(container => {
            const link = container.querySelector('a');
            const img = container.querySelector('img');
            if (!img) return;
            
            const title = img.getAttribute('title') || img.getAttribute('alt') || '';
            const href = link?.getAttribute('href') || '';
            const idMatch = href.match(/sp=l(\d+)/);
            const id = idMatch ? idMatch[1] : null;
            
            if (!title || seen.has(title)) return;
            seen.add(title);
            
            const image = id 
              ? `https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ImageAsset&module=collection&objectId=${id}&resolution=superImageResolution`
              : '';
            
            results.push({
              id: `wallace-${roomNum}-${id || Date.now()}-${results.length}`,
              collectionId: id,
              title: title.trim(),
              artist: title.trim(),
              year: '',
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
          console.log(`  📷 ${artworks.length}개 작품 발견, 플레이스홀더 체크...`);
          
          const urls = artworks.map(a => a.image);
          const placeholderResults = await checkPlaceholderBatch(urls);
          const validArtworks = artworks.filter((_, idx) => !placeholderResults[idx]);
          
          console.log(`  ✅ ${validArtworks.length}개 유효`);
          
          if (validArtworks.length > 0) {
            existingData.rooms.push({
              id: `room-${roomNumber}`,
              name: `Room ${roomNumber}`,
              originalName: roomName,
              artworks: validArtworks,
            });
            addedRooms++;
          }
        } else {
          console.log(`  ⚠️ 작품 없음 - 대체 방법 시도`);
          
          // 필터 검색으로 시도
          const filterUrl = 'https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=collection&lang=en';
          await page.goto(filterUrl, { waitUntil: 'networkidle', timeout: 30000 });
          await delay(2000);
          
          // 필터에서 방 찾기
          const filterClicked = await page.evaluate((target) => {
            const items = document.querySelectorAll('.filterItem a, a.filterItem, .filterSection a');
            for (const item of items) {
              if (item.textContent?.trim() === target) {
                item.click();
                return true;
              }
            }
            return false;
          }, roomName);
          
          if (filterClicked) {
            await page.waitForLoadState('networkidle', { timeout: 30000 });
            await delay(3000);
            
            const artworks2 = await page.evaluate((roomNum) => {
              const results = [];
              const seen = new Set();
              
              document.querySelectorAll('.listImg, dt.listImg').forEach(container => {
                const link = container.querySelector('a');
                const img = container.querySelector('img');
                if (!img) return;
                
                const title = img.getAttribute('title') || img.getAttribute('alt') || '';
                const href = link?.getAttribute('href') || '';
                const idMatch = href.match(/sp=l(\d+)/);
                const id = idMatch ? idMatch[1] : null;
                
                if (!title || seen.has(title)) return;
                seen.add(title);
                
                const image = id 
                  ? `https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ImageAsset&module=collection&objectId=${id}&resolution=superImageResolution`
                  : '';
                
                results.push({
                  id: `wallace-${roomNum}-${id || Date.now()}-${results.length}`,
                  collectionId: id,
                  title: title.trim(),
                  artist: title.trim(),
                  year: '',
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
            
            if (artworks2.length > 0) {
              console.log(`  📷 대체방법: ${artworks2.length}개 작품 발견`);
              const urls = artworks2.map(a => a.image);
              const placeholderResults = await checkPlaceholderBatch(urls);
              const validArtworks = artworks2.filter((_, idx) => !placeholderResults[idx]);
              
              if (validArtworks.length > 0) {
                existingData.rooms.push({
                  id: `room-${roomNumber}`,
                  name: `Room ${roomNumber}`,
                  originalName: roomName,
                  artworks: validArtworks,
                });
                addedRooms++;
                console.log(`  ✅ ${validArtworks.length}개 유효`);
              }
            }
          }
        }
        
      } catch (err) {
        console.log(`  ❌ ${err.message.substring(0, 60)}`);
      }
    }
    
  } catch (err) {
    console.error('오류:', err.message);
  } finally {
    await browser.close();
  }
  
  // 저장
  const totalArtworks = existingData.rooms.reduce((sum, r) => sum + r.artworks.length, 0);
  existingData.totalRooms = existingData.rooms.length;
  existingData.totalArtworks = totalArtworks;
  existingData.artworksWithImages = totalArtworks;
  existingData.scrapedAt = new Date().toISOString();
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(existingData, null, 2));
  
  console.log('\n' + '='.repeat(50));
  console.log(`✅ 완료! +${addedRooms}개 방`);
  console.log(`🏠 총 ${existingData.rooms.length}개 방 | 🖼️ ${totalArtworks}개 작품`);
}

main().catch(console.error);
