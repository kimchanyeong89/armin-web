#!/usr/bin/env node
/**
 * Wallace Collection - 목록 페이지에서 이미지 직접 추출
 * 썸네일 이미지 URL 수집 후 제목과 매칭
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../downloads/wallace-images-from-list.json');

const TEST_MODE = process.argv.includes('--test');

const ROOMS = [
  'West Room', 'West Gallery I', 'West Gallery II', 'West Gallery III',
  'Great Gallery', 'East Galleries III', 'East Galleries II', 'East Galleries I',
  'East Drawing Room', 'Small Drawing Room', 'Large Drawing Room', 'Landing',
  'Oval Drawing Room', 'The Study', 'Boudoir', 'Boudoir Cabinet',
  'Armouries Corridor', 'Arms and Armour I', 'Arms and Armour II', 
  'Arms and Armour III', 'Arms and Armour IV', 'Back State Room',
  'Billiard Room', 'Dining Room', 'Front State Room', 'Grand Staircase',
  'Hall', 'Sixteenth Century Gallery', 'Smoking Room', 'Porphyry Court',
];

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🏛️ Wallace Collection 이미지 추출기\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  
  const allImages = {};
  const roomsToScrape = TEST_MODE ? ROOMS.slice(0, 3) : ROOMS;
  
  try {
    for (let i = 0; i < roomsToScrape.length; i++) {
      const roomName = roomsToScrape[i];
      console.log(`[${i + 1}/${roomsToScrape.length}] ${roomName}...`);
      
      const page = await context.newPage();
      
      try {
        await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=room&viewType=detailList', {
          waitUntil: 'networkidle',
          timeout: 60000,
        });
        await delay(2000);
        
        // 방 필터 클릭
        const roomLink = await page.$(`.filterItem a:has-text("${roomName}")`);
        if (!roomLink) {
          console.log(`  ⚠️ 방을 찾을 수 없음`);
          await page.close();
          continue;
        }
        
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
          roomLink.click(),
        ]);
        await delay(2000);
        
        // 목록에서 모든 항목 추출 (이미지 + 제목 + ID)
        const items = await page.evaluate(() => {
          const results = [];
          
          // 각 li에서 정보 추출
          document.querySelectorAll('li').forEach(li => {
            // 이미지 링크 찾기 (TspTitleImageLink)
            const imgLink = li.querySelector('a[href*="TspTitleImageLink"]');
            if (!imgLink) return;
            
            const img = imgLink.querySelector('img');
            if (!img || !img.src) return;
            
            // 제목 링크 찾기
            const titleLink = li.querySelector('a[href*="TspTitleLink"]');
            const title = titleLink?.textContent?.trim();
            
            // URL에서 ID 추출
            const href = titleLink?.getAttribute('href') || imgLink.getAttribute('href') || '';
            const idMatch = href.match(/sp=l(\d+)/);
            const id = idMatch ? idMatch[1] : null;
            
            if (title && id) {
              results.push({
                id,
                title,
                image: img.src,
              });
            }
          });
          
          return results;
        });
        
        console.log(`  📷 ${items.length}개 이미지 추출`);
        
        // ID로 저장
        for (const item of items) {
          if (item.id && item.image) {
            allImages[item.id] = {
              title: item.title,
              image: item.image,
            };
          }
        }
        
      } catch (err) {
        console.log(`  ❌ 오류: ${err.message.substring(0, 40)}`);
      } finally {
        await page.close();
      }
    }
    
  } finally {
    await browser.close();
  }
  
  // 저장
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allImages, null, 2));
  console.log(`\n✅ ${Object.keys(allImages).length}개 이미지 저장: ${OUTPUT_FILE}`);
}

main().catch(console.error);
