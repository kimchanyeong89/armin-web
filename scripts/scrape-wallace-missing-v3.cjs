#!/usr/bin/env node
/**
 * Wallace Collection - 누락된 방 스크래핑 (세션 초기화 후 필터 확장)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUTPUT_FILE = path.join(__dirname, '../public/data/wallace-collection.json');
const PLACEHOLDER_SIZE = 13449;

const MISSING_ROOMS = [
  'Arms and Armour I',
  'Arms and Armour IV',
  'Smoking Room',
];

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkPlaceholderBatch(urls) {
  return Promise.all(urls.map(url => {
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
  }));
}

async function main() {
  console.log('🏛️ Wallace Collection - 누락된 방 스크래핑 v3\n');
  
  const existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
  const existingRoomNames = new Set(existingData.rooms.map(r => r.originalName));
  
  console.log(`📂 기존: ${existingData.rooms.length}개 방, ${existingData.totalArtworks}개 작품\n`);
  
  const toScrape = MISSING_ROOMS.filter(name => !existingRoomNames.has(name));
  if (toScrape.length === 0) {
    console.log('✅ 모든 방이 이미 존재합니다.');
    return;
  }
  
  console.log(`🔍 스크래핑할 방: ${toScrape.join(', ')}\n`);
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1400, height: 900 },
  });
  
  const page = await context.newPage();
  let addedRooms = 0;
  let roomNumber = existingData.rooms.length;
  
  try {
    // 1. 메인 페이지로 세션 초기화
    console.log('🔗 세션 초기화...');
    await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await delay(3000);
    
    // 2. Collection 페이지로 이동
    console.log('📋 컬렉션 페이지...');
    await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=collection&lang=en', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await delay(3000);
    
    // 3. Room 필터 섹션 찾기
    console.log('🔍 필터 확장 중...');
    
    // Room 헤더를 클릭해서 필터 확장
    const roomFilterExpanded = await page.evaluate(() => {
      const headers = document.querySelectorAll('.filterSectionHead, .filterHeader, h3, h4');
      for (const header of headers) {
        if (header.textContent?.toLowerCase().includes('room')) {
          header.click();
          return 'clicked header';
        }
      }
      // 또는 Room 텍스트가 있는 링크 클릭
      const links = document.querySelectorAll('a');
      for (const link of links) {
        if (link.textContent?.trim().toLowerCase() === 'room') {
          link.click();
          return 'clicked link';
        }
      }
      return false;
    });
    
    console.log('  필터 상태:', roomFilterExpanded || '확장 실패');
    await delay(2000);
    
    // Ground Floor 확장
    const groundFloorExpanded = await page.evaluate(() => {
      const items = document.querySelectorAll('.filterItem a, a.filterItem, a');
      for (const item of items) {
        if (item.textContent?.trim() === 'Ground Floor') {
          item.click();
          return true;
        }
      }
      return false;
    });
    
    if (groundFloorExpanded) {
      console.log('  Ground Floor 확장됨');
      await delay(3000);
    }
    
    // 4. 각 방 스크래핑
    for (const roomName of toScrape) {
      roomNumber++;
      console.log(`\n[${roomName}] 스크래핑...`);
      
      try {
        // 필터에서 방 이름 클릭
        const clicked = await page.evaluate((target) => {
          const items = document.querySelectorAll('a');
          for (const item of items) {
            if (item.textContent?.trim() === target) {
              item.click();
              return true;
            }
          }
          return false;
        }, roomName);
        
        if (!clicked) {
          console.log(`  ⚠️ 필터에서 "${roomName}" 찾지 못함`);
          
          // 페이지 갱신 후 재시도
          await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=collection&lang=en', {
            waitUntil: 'networkidle',
            timeout: 30000,
          });
          await delay(2000);
          
          // 다시 시도
          const clicked2 = await page.evaluate((target) => {
            const items = document.querySelectorAll('a');
            for (const item of items) {
              if (item.textContent?.trim() === target) {
                item.click();
                return true;
              }
            }
            return false;
          }, roomName);
          
          if (!clicked2) {
            console.log(`  ❌ 재시도 실패`);
            continue;
          }
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
          console.log(`  📷 ${artworks.length}개 작품`);
          
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
          console.log(`  ⚠️ 작품 없음`);
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
