#!/usr/bin/env node
/**
 * Wallace Collection 스크래퍼 v13
 * 단일 브라우저 세션으로 모든 방의 이미지 수집
 * - 브라우저 하나로 세션 유지
 * - 필터 클릭 후 목록에서 이미지 URL 추출
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../downloads/wallace-images-v13.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/wallace-v13-progress.json');

const TEST_MODE = process.argv.includes('--test');
const MAX_ROOMS_TEST = 3;

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

function extractIdFromUrl(url) {
  if (!url) return null;
  const match = url.match(/sp=l(\d+)/);
  return match ? match[1] : null;
}

function saveProgress(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

async function main() {
  console.log('🏛️ Wallace Collection 이미지 스크래퍼 v13');
  console.log(TEST_MODE ? '📍 테스트 모드 (3개 방)\n' : '📍 전체 모드 (30개 방)\n');
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1400, height: 900 },
    javaScriptEnabled: true,
  });
  
  // 봇 탐지 우회
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  
  const page = await context.newPage();
  const allImages = {}; // id -> { image, room }
  const roomsToScrape = TEST_MODE ? ROOMS.slice(0, MAX_ROOMS_TEST) : ROOMS;
  
  try {
    // 먼저 메인 페이지 접속하여 세션 초기화
    console.log('🔗 세션 초기화...');
    await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await delay(3000);
    
    // room 모듈로 이동
    await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=room&viewType=detailList', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await delay(3000);
    
    const pageTitle = await page.title();
    console.log('페이지 제목:', pageTitle);
    
    if (pageTitle.includes('403')) {
      console.log('❌ 403 에러 - 세션 초기화 실패');
      await browser.close();
      return;
    }
    
    for (let i = 0; i < roomsToScrape.length; i++) {
      const roomName = roomsToScrape[i];
      console.log(`\n[${i + 1}/${roomsToScrape.length}] ${roomName}...`);
      
      try {
        // 방 필터 클릭
        const filterSelector = `.filterItem a:text-is("${roomName}")`;
        const roomLink = await page.$(filterSelector);
        
        if (!roomLink) {
          // 다른 선택자 시도
          const altLink = await page.$(`a:has-text("${roomName}")`);
          if (!altLink) {
            console.log('  ⚠️ 방 필터를 찾을 수 없음');
            continue;
          }
          await Promise.all([
            page.waitForLoadState('networkidle', { timeout: 30000 }),
            altLink.click(),
          ]);
        } else {
          await Promise.all([
            page.waitForLoadState('networkidle', { timeout: 30000 }),
            roomLink.click(),
          ]);
        }
        
        await delay(2000);
        
        // 작품 목록에서 이미지 추출
        const items = await page.evaluate(() => {
          const results = [];
          
          // 모든 li 요소 확인
          document.querySelectorAll('li').forEach(li => {
            const links = li.querySelectorAll('a');
            let id = null;
            let image = null;
            
            links.forEach(link => {
              const href = link.getAttribute('href') || '';
              
              // ID 추출
              if (href.includes('sp=l')) {
                const match = href.match(/sp=l(\d+)/);
                if (match) id = match[1];
              }
              
              // 이미지 링크에서 이미지 추출
              if (href.includes('TspTitleImageLink')) {
                const img = link.querySelector('img');
                if (img && img.src && !img.src.includes('spacer')) {
                  image = img.src;
                }
              }
            });
            
            // li 안의 직접 이미지도 확인
            if (!image) {
              const img = li.querySelector('img');
              if (img && img.src && !img.src.includes('spacer') && img.width > 50) {
                image = img.src;
              }
            }
            
            if (id && image) {
              results.push({ id, image });
            }
          });
          
          return results;
        });
        
        console.log(`  📷 ${items.length}개 이미지 수집`);
        
        for (const item of items) {
          allImages[item.id] = { image: item.image, room: roomName };
        }
        
        saveProgress(allImages);
        
        // 다음 방으로 가기 전에 메인 페이지로 돌아가기
        await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=room&viewType=detailList', {
          waitUntil: 'networkidle',
          timeout: 30000,
        });
        await delay(2000);
        
      } catch (err) {
        console.log(`  ❌ 오류: ${err.message.substring(0, 50)}`);
      }
    }
    
  } catch (err) {
    console.error('전체 오류:', err.message);
  } finally {
    await browser.close();
  }
  
  // 결과 저장
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allImages, null, 2));
  console.log(`\n✅ ${Object.keys(allImages).length}개 이미지 저장: ${OUTPUT_FILE}`);
}

main().catch(console.error);
