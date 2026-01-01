#!/usr/bin/env node
/**
 * Wallace Collection 페이지 구조 분석 v2
 * 쿠키 허용 후 eMuseumPlus 탐색
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function analyzeWallace() {
  console.log('🔍 Wallace Collection 페이지 구조 분석 v2\n');
  
  const browser = await chromium.launch({
    headless: false,
    slowMo: 100,
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1400, height: 900 },
  });
  
  const page = await context.newPage();
  
  try {
    // eMuseumPlus 직접 접근 (세션 없이)
    console.log('📍 eMuseumPlus 접속 중...');
    await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus', {
      waitUntil: 'load',
      timeout: 60000,
    });
    await delay(3000);
    
    let title = await page.title();
    console.log(`📄 페이지 제목: ${title}`);
    
    // 쿠키 배너 처리
    try {
      const acceptBtn = await page.$('button:has-text("Accept"), button:has-text("accept"), #accept-cookies, .accept-cookies');
      if (acceptBtn) {
        console.log('🍪 쿠키 허용 클릭...');
        await acceptBtn.click();
        await delay(1000);
      }
    } catch {}
    
    // 페이지 URL 확인
    const currentUrl = page.url();
    console.log(`📍 현재 URL: ${currentUrl}`);
    
    // 스크린샷
    await page.screenshot({ 
      path: path.join(__dirname, '../downloads/wallace-main.png'),
      fullPage: false 
    });
    console.log('📁 스크린샷: downloads/wallace-main.png');
    
    // Room 필터 탐색
    console.log('\n📍 Room 필터 탐색...');
    
    // 먼저 모든 필터 옵션 확인
    const filterInfo = await page.evaluate(() => {
      const info = {
        allText: [],
        links: [],
        selectOptions: [],
        buttons: [],
      };
      
      // 모든 텍스트 노드에서 Room, Gallery 찾기
      const allElements = document.querySelectorAll('*');
      allElements.forEach(el => {
        if (el.children.length === 0) {
          const text = el.textContent?.trim();
          if (text && text.length < 100 && (
            text.toLowerCase().includes('room') || 
            text.toLowerCase().includes('gallery') ||
            text.toLowerCase().includes('west') ||
            text.toLowerCase().includes('east') ||
            text.toLowerCase().includes('ground') ||
            text.toLowerCase().includes('first') ||
            text.toLowerCase().includes('floor')
          )) {
            info.allText.push({
              text,
              tag: el.tagName,
              class: el.className?.substring?.(0, 50),
            });
          }
        }
      });
      
      // 모든 링크
      document.querySelectorAll('a').forEach(a => {
        const href = a.getAttribute('href');
        const text = a.textContent?.trim()?.substring(0, 100);
        if (href && text) {
          info.links.push({ text, href: href.substring(0, 150) });
        }
      });
      
      // select 옵션들
      document.querySelectorAll('select option').forEach(opt => {
        info.selectOptions.push(opt.textContent?.trim());
      });
      
      // 버튼들
      document.querySelectorAll('button, input[type="button"], input[type="submit"]').forEach(btn => {
        info.buttons.push(btn.textContent?.trim() || btn.value);
      });
      
      return info;
    });
    
    console.log(`\n텍스트에서 Room/Gallery 발견: ${filterInfo.allText.length}개`);
    filterInfo.allText.slice(0, 20).forEach((t, i) => {
      console.log(`  ${i + 1}. [${t.tag}] ${t.text}`);
    });
    
    console.log(`\n링크: ${filterInfo.links.length}개`);
    filterInfo.links.slice(0, 20).forEach((l, i) => {
      console.log(`  ${i + 1}. ${l.text} -> ${l.href.substring(0, 80)}`);
    });
    
    if (filterInfo.selectOptions.length > 0) {
      console.log(`\nSelect 옵션: ${filterInfo.selectOptions.length}개`);
      filterInfo.selectOptions.forEach((o, i) => console.log(`  ${i + 1}. ${o}`));
    }
    
    // HTML 저장
    const html = await page.content();
    fs.writeFileSync(
      path.join(__dirname, '../downloads/wallace-v2.html'),
      html
    );
    console.log('\n📁 HTML 저장: downloads/wallace-v2.html');
    
    // JSON 저장
    fs.writeFileSync(
      path.join(__dirname, '../downloads/wallace-v2.json'),
      JSON.stringify(filterInfo, null, 2)
    );
    console.log('📁 분석 결과: downloads/wallace-v2.json');
    
    // Room 필터 클릭 시도
    console.log('\n📍 Room 필터 클릭 시도...');
    const roomLink = await page.$('a:has-text("Room"), text=Room');
    if (roomLink) {
      console.log('✅ Room 링크 발견! 클릭...');
      await roomLink.click();
      await delay(3000);
      
      await page.screenshot({ 
        path: path.join(__dirname, '../downloads/wallace-room-filter.png'),
        fullPage: false 
      });
      console.log('📁 스크린샷: downloads/wallace-room-filter.png');
      
      // 필터 후 옵션 분석
      const roomOptions = await page.evaluate(() => {
        const rooms = [];
        document.querySelectorAll('a').forEach(a => {
          const text = a.textContent?.trim();
          const href = a.getAttribute('href');
          if (text && href && (
            text.toLowerCase().includes('room') ||
            text.toLowerCase().includes('gallery') ||
            text.toLowerCase().includes('west') ||
            text.toLowerCase().includes('east') ||
            text.toLowerCase().includes('ground') ||
            text.toLowerCase().includes('landing')
          )) {
            rooms.push({ text, href });
          }
        });
        return rooms;
      });
      
      console.log(`\nRoom 필터 후 발견된 옵션: ${roomOptions.length}개`);
      roomOptions.forEach((r, i) => console.log(`  ${i + 1}. ${r.text}`));
      
      fs.writeFileSync(
        path.join(__dirname, '../downloads/wallace-rooms.json'),
        JSON.stringify(roomOptions, null, 2)
      );
    } else {
      console.log('❌ Room 링크를 찾지 못함');
    }
    
    // 60초간 브라우저 유지
    console.log('\n⏳ 60초간 브라우저 유지... 수동 탐색 가능');
    await delay(60000);
    
  } catch (error) {
    console.error('오류:', error);
    await page.screenshot({ 
      path: path.join(__dirname, '../downloads/wallace-error.png'),
      fullPage: false 
    });
  } finally {
    await browser.close();
  }
}

analyzeWallace().catch(console.error);
