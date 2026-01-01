#!/usr/bin/env node
/**
 * Wallace Collection 방 페이지 디버그 v2
 * 클릭 후 같은 탭에서 이동 (세션 유지)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DEBUG_DIR = path.join(__dirname, '../downloads');

async function debugRoomPage() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    viewport: { width: 1400, height: 900 },
  });
  
  const page = await context.newPage();
  
  try {
    // Room 모듈 페이지 접속
    console.log('📍 Room 모듈 페이지 접속 중...');
    await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=room&viewType=detailList', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await new Promise(r => setTimeout(r, 3000));
    
    // 현재 페이지 분석 - 이미 작품 목록이 있는지 확인
    console.log('📍 현재 페이지 분석...');
    
    const pageInfo = await page.evaluate(() => {
      const result = {
        url: window.location.href,
        title: document.title,
        allTexts: [],
        allLinks: [],
        listItems: [],
      };
      
      // 모든 li 요소
      document.querySelectorAll('li').forEach(li => {
        const text = li.textContent?.trim();
        if (text && text.length > 5 && text.length < 200) {
          result.listItems.push({
            text: text.substring(0, 100),
            class: li.className,
            hasImage: !!li.querySelector('img'),
            hasLink: !!li.querySelector('a'),
          });
        }
      });
      
      // collection 관련 링크
      document.querySelectorAll('a[href*="collection"], a[href*="Scollection"]').forEach(a => {
        result.allLinks.push({
          text: a.textContent?.trim()?.substring(0, 50),
          href: a.getAttribute('href')?.substring(0, 150),
        });
      });
      
      return result;
    });
    
    console.log('\n📊 페이지 분석 결과:');
    console.log('Title:', pageInfo.title);
    console.log('\n리스트 아이템:', pageInfo.listItems.length, '개');
    pageInfo.listItems.slice(0, 20).forEach(l => console.log(`  - ${l.text.substring(0, 60)}...`));
    console.log('\n컬렉션 링크:', pageInfo.allLinks.length, '개');
    pageInfo.allLinks.slice(0, 10).forEach(l => console.log(`  - ${l.text}`));
    
    // HTML 저장
    const html = await page.content();
    fs.writeFileSync(path.join(DEBUG_DIR, 'wallace-room-main.html'), html);
    
    // 스크린샷
    await page.screenshot({ path: path.join(DEBUG_DIR, 'wallace-room-main.png'), fullPage: true });
    
    // 이제 West Room 필터를 클릭해보기
    console.log('\n📍 West Room 필터 클릭 시도...');
    
    // 필터 섹션에서 West Room 찾기
    const westRoomClicked = await page.evaluate(() => {
      const links = document.querySelectorAll('a');
      for (const link of links) {
        if (link.textContent?.trim() === 'West Room') {
          link.click();
          return true;
        }
      }
      return false;
    });
    
    if (westRoomClicked) {
      console.log('  ✓ West Room 클릭됨');
      await page.waitForLoadState('networkidle');
      await new Promise(r => setTimeout(r, 3000));
      
      // 클릭 후 페이지 분석
      const afterClick = await page.evaluate(() => {
        return {
          url: window.location.href,
          title: document.title,
          bodyText: document.body?.innerText?.substring(0, 500),
        };
      });
      
      console.log('\n클릭 후 상태:');
      console.log('Title:', afterClick.title);
      console.log('URL 변경됨:', afterClick.url !== pageInfo.url);
      
      // 스크린샷
      await page.screenshot({ path: path.join(DEBUG_DIR, 'wallace-after-click.png'), fullPage: true });
      
      // HTML 저장
      const html2 = await page.content();
      fs.writeFileSync(path.join(DEBUG_DIR, 'wallace-after-click.html'), html2);
      
    } else {
      console.log('  ❌ West Room 링크를 찾을 수 없음');
    }
    
    console.log('\n✅ 디버그 완료! downloads 폴더 확인');
    
  } catch (error) {
    console.error('오류:', error);
  } finally {
    await browser.close();
  }
}

debugRoomPage().catch(console.error);
