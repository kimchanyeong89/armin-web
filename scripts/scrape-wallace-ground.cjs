#!/usr/bin/env node
/**
 * Wallace Collection - Ground Floor 스크래퍼
 * 사용자 제공 URL 기반으로 Ground Floor와 Lower Ground Floor 방들을 스크래핑
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/wallace-collection.json');

// 층 필터 ID (사용자 제공 URL 기반: sp=S10034, sp=S10035)
const FLOOR_CONFIGS = [
  { name: 'Ground Floor', filterId: '10034' },
  { name: 'Lower Ground Floor', filterId: '10035' },
];

const PLACEHOLDER_SIZE = 13449;

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkPlaceholderBatch(urls) {
  const https = require('https');
  const results = await Promise.all(urls.map(url => {
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
  return results;
}

async function main() {
  console.log('🏛️ Wallace Collection - Ground Floor 스크래퍼\n');
  
  const existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
  const existingRoomCount = existingData.rooms?.length || 0;
  const existingRoomNames = new Set(existingData.rooms.map(r => r.originalName));
  
  console.log(`📂 기존: ${existingRoomCount}개 방, ${existingData.totalArtworks}개 작품\n`);
  
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
  let roomNumber = existingRoomCount;
  
  try {
    // 세션 초기화
    console.log('🔗 세션 초기화...');
    await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await delay(3000);
    
    for (const floorConfig of FLOOR_CONFIGS) {
      console.log(`\n📂 ${floorConfig.name} 스크래핑...`);
      
      // 층 필터 URL로 접속
      const floorUrl = `https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=direct/1/ResultDetailView/preselectFilterSection.$FilterGroupControl.$MpDirectLink&sp=13&sp=Sroom&sp=SfilterDefinition&sp=0&sp=6&sp=3&sp=SdetailView&sp=0&sp=Sdetail&sp=0&sp=T&sp=0&sp=SdetailList&sp=0&sp=S${floorConfig.filterId}&sp=S1`;
      
      await page.goto(floorUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await delay(3000);
      
      // 하위 방 필터들 가져오기
      const roomFilters = await page.evaluate(() => {
        const rooms = [];
        document.querySelectorAll('.filterItem a, a.filterItem').forEach(el => {
          const text = el.textContent?.trim();
          if (text && !text.includes('Floor') && !text.includes('First')) {
            rooms.push(text);
          }
        });
        return rooms;
      });
      
      console.log(`  📋 ${roomFilters.length}개 방 발견: ${roomFilters.slice(0, 5).join(', ')}...`);
      
      for (let i = 0; i < roomFilters.length; i++) {
        const roomName = roomFilters[i];
        
        if (existingRoomNames.has(roomName)) {
          console.log(`  ⏭️ ${roomName} - 이미 존재`);
          continue;
        }
        
        roomNumber++;
        console.log(`\n  [${i+1}/${roomFilters.length}] ${roomName}...`);
        
        try {
          // 층 페이지로 이동
          await page.goto(floorUrl, { waitUntil: 'networkidle', timeout: 30000 });
          await delay(2000);
          
          // JavaScript로 필터 클릭
          const clicked = await page.evaluate((targetRoom) => {
            const links = document.querySelectorAll('.filterItem a, a.filterItem');
            for (const link of links) {
              if (link.textContent?.trim() === targetRoom) {
                link.click();
                return true;
              }
            }
            return false;
          }, roomName);
          
          if (!clicked) {
            console.log(`    ⚠️ 클릭 실패`);
            continue;
          }
          
          await page.waitForLoadState('networkidle', { timeout: 30000 });
          await delay(2500);
          
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
            console.log(`    📷 ${artworks.length}개 작품 발견, 플레이스홀더 체크...`);
            
            const urls = artworks.map(a => a.image);
            const placeholderResults = await checkPlaceholderBatch(urls);
            const validArtworks = artworks.filter((_, idx) => !placeholderResults[idx]);
            
            console.log(`    ✅ ${validArtworks.length}개 유효`);
            
            if (validArtworks.length > 0) {
              existingData.rooms.push({
                id: `room-${roomNumber}`,
                name: `Room ${roomNumber}`,
                originalName: roomName,
                artworks: validArtworks,
              });
              existingRoomNames.add(roomName);
              addedRooms++;
            }
          } else {
            console.log(`    ⚠️ 작품 없음`);
          }
          
        } catch (err) {
          console.log(`    ❌ ${err.message.substring(0, 50)}`);
        }
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
