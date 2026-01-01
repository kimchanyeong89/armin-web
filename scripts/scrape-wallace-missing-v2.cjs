#!/usr/bin/env node
/**
 * Wallace Collection - URL 직접 검색으로 누락된 방 스크래핑
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUTPUT_FILE = path.join(__dirname, '../public/data/wallace-collection.json');
const PLACEHOLDER_SIZE = 13449;

// 누락된 방들의 검색 URL (전체 컬렉션에서 fulltext 검색)
const ROOM_SEARCH_CONFIGS = [
  { name: 'Arms and Armour I', search: 'Arms+Armour+I' },
  { name: 'Arms and Armour IV', search: 'Arms+Armour+IV' },
  { name: 'Smoking Room', search: 'Smoking+Room' },
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
  console.log('🏛️ Wallace Collection - 누락된 방 URL 검색 스크래핑\n');
  
  const existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
  const existingRoomNames = new Set(existingData.rooms.map(r => r.originalName));
  
  console.log(`📂 기존: ${existingData.rooms.length}개 방, ${existingData.totalArtworks}개 작품\n`);
  
  const toScrape = ROOM_SEARCH_CONFIGS.filter(c => !existingRoomNames.has(c.name));
  if (toScrape.length === 0) {
    console.log('✅ 모든 방이 이미 존재합니다.');
    return;
  }
  
  const browser = await chromium.launch({
    headless: false, // 디버깅용 headful
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
    // 메인 컬렉션 페이지로 접속
    console.log('🔗 메인 페이지 접속...');
    await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=collection&lang=en', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await delay(3000);
    
    for (const config of toScrape) {
      roomNumber++;
      console.log(`\n[${config.name}] 스크래핑...`);
      
      try {
        // 필터 섹션 확장 시도 (Ground Floor 클릭)
        await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=collection&lang=en', {
          waitUntil: 'networkidle',
          timeout: 30000,
        });
        await delay(2000);
        
        // Room 필터 섹션 찾아서 확장
        const expanded = await page.evaluate(() => {
          // Ground Floor 섹션 클릭해서 확장
          const sections = document.querySelectorAll('.filterItem, .filterSection');
          for (const section of sections) {
            if (section.textContent?.includes('Ground Floor')) {
              const toggle = section.querySelector('.toggle, .expand, a');
              if (toggle) { toggle.click(); return true; }
              section.click();
              return true;
            }
          }
          return false;
        });
        
        if (expanded) await delay(2000);
        
        // 방 필터 클릭
        const filterClicked = await page.evaluate((roomName) => {
          const allLinks = document.querySelectorAll('a');
          for (const link of allLinks) {
            const text = link.textContent?.trim();
            if (text === roomName) {
              link.click();
              return true;
            }
          }
          return false;
        }, config.name);
        
        if (filterClicked) {
          await page.waitForLoadState('networkidle', { timeout: 30000 });
          await delay(3000);
        } else {
          console.log('  ⚠️ 필터 클릭 실패, 다음으로...');
          continue;
        }
        
        // 작품 추출
        const artworks = await page.evaluate((roomNum) => {
          const results = [];
          const seen = new Set();
          
          document.querySelectorAll('.listImg, dt.listImg, .resultItem').forEach(container => {
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
          console.log(`  📷 ${artworks.length}개 작품 발견`);
          
          const urls = artworks.map(a => a.image);
          const placeholderResults = await checkPlaceholderBatch(urls);
          const validArtworks = artworks.filter((_, idx) => !placeholderResults[idx]);
          
          console.log(`  ✅ ${validArtworks.length}개 유효`);
          
          if (validArtworks.length > 0) {
            existingData.rooms.push({
              id: `room-${roomNumber}`,
              name: `Room ${roomNumber}`,
              originalName: config.name,
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
