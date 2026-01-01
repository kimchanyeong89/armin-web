#!/usr/bin/env node
/**
 * Wallace Collection - 누락된 3개 방 직접 URL 스크래핑
 * 사용자 제공 URL 기반
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUTPUT_FILE = path.join(__dirname, '../public/data/wallace-collection.json');
const PLACEHOLDER_SIZE = 13449;

// 사용자 제공 3개 방 URL
const ROOM_URLS = [
  {
    name: 'Arms and Armour I',
    url: 'https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=direct/1/ResultDetailView/preselectFilterSection.$FilterGroupControl.$MpDirectLink&sp=13&sp=Sroom&sp=SfilterDefinition&sp=0&sp=1&sp=3&sp=SdetailView&sp=0&sp=Sdetail&sp=0&sp=T&sp=0&sp=SdetailList&sp=0&sp=S10034&sp=S15',
  },
  {
    name: 'Arms and Armour IV',
    url: 'https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=direct/1/ResultDetailView/preselectFilterSection.$FilterGroupControl.$MpDirectLink&sp=13&sp=Sroom&sp=SfilterDefinition&sp=0&sp=2&sp=3&sp=SdetailView&sp=0&sp=Sdetail&sp=0&sp=T&sp=0&sp=SdetailList&sp=0&sp=S10034&sp=S3',
  },
  {
    name: 'Smoking Room',
    url: 'https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=direct/1/ResultDetailView/preselectFilterSection.$FilterGroupControl.$MpDirectLink&sp=13&sp=Sroom&sp=SfilterDefinition&sp=0&sp=3&sp=3&sp=SdetailView&sp=0&sp=Sdetail&sp=0&sp=T&sp=0&sp=SdetailList&sp=0&sp=S10034&sp=S6',
  },
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
  console.log('🏛️ Wallace Collection - 누락된 3개 방 스크래핑\n');
  
  const existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
  const existingRoomNames = new Set(existingData.rooms.map(r => r.originalName));
  
  console.log(`📂 기존: ${existingData.rooms.length}개 방, ${existingData.totalArtworks}개 작품\n`);
  
  const toScrape = ROOM_URLS.filter(r => !existingRoomNames.has(r.name));
  if (toScrape.length === 0) {
    console.log('✅ 모든 방이 이미 존재합니다.');
    return;
  }
  
  console.log(`🔍 스크래핑할 방: ${toScrape.map(r => r.name).join(', ')}\n`);
  
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
    // 세션 초기화 - 메인 페이지 먼저 방문
    console.log('🔗 세션 초기화...');
    await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await delay(3000);
    
    for (const room of toScrape) {
      roomNumber++;
      console.log(`\n[${room.name}] 스크래핑...`);
      
      try {
        // 직접 URL로 접근
        await page.goto(room.url, { waitUntil: 'networkidle', timeout: 60000 });
        await delay(3000);
        
        // 작품 추출 (.listImg 패턴 사용)
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
          
          console.log(`  ✅ ${validArtworks.length}개 유효 (${artworks.length - validArtworks.length}개 플레이스홀더 제거)`);
          
          if (validArtworks.length > 0) {
            existingData.rooms.push({
              id: `room-${roomNumber}`,
              name: `Room ${roomNumber}`,
              originalName: room.name,
              artworks: validArtworks,
            });
            addedRooms++;
          }
        } else {
          console.log(`  ⚠️ 작품 없음`);
        }
        
      } catch (err) {
        console.log(`  ❌ ${err.message.substring(0, 80)}`);
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
