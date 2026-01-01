#!/usr/bin/env node
/**
 * Wallace Collection 방 페이지 디버그 v3
 * Playwright의 실제 클릭 사용
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DEBUG_DIR = path.join(__dirname, '../downloads');

async function debugRoomPage() {
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
    // Room 모듈 페이지 접속
    console.log('📍 Room 모듈 페이지 접속 중...');
    await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=room&viewType=detailList', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await new Promise(r => setTimeout(r, 3000));
    
    console.log('📊 현재 페이지 분석 중...');
    
    // 현재 페이지에 이미 작품이 표시되어 있는지 확인
    // (초기 로딩시 기본 방의 작품이 표시될 수 있음)
    const currentWorks = await page.evaluate(() => {
      const works = [];
      
      // 작품 목록 찾기 - TspTitleLink 클래스를 가진 링크들
      document.querySelectorAll('a[href*="Scollection"]').forEach(a => {
        const text = a.textContent?.trim();
        const href = a.getAttribute('href');
        // 메뉴 링크가 아닌 실제 작품 링크
        if (text && text.length > 3 && href && href.includes('l6')) {
          works.push({
            title: text,
            href: href,
          });
        }
      });
      
      return works;
    });
    
    console.log(`\n현재 페이지에 표시된 작품: ${currentWorks.length}개`);
    currentWorks.slice(0, 10).forEach(w => console.log(`  - ${w.title}`));
    
    // 스크린샷
    await page.screenshot({ path: path.join(DEBUG_DIR, 'wallace-v3-initial.png'), fullPage: true });
    
    // HTML 분석
    const html = await page.content();
    fs.writeFileSync(path.join(DEBUG_DIR, 'wallace-v3-initial.html'), html);
    
    // West Room 클릭 (Playwright의 click 사용)
    console.log('\n📍 West Room 클릭 시도 (Playwright click)...');
    
    try {
      // 먼저 West Room 링크 찾기
      const westRoomLink = page.locator('text=West Room').first();
      await westRoomLink.waitFor({ state: 'visible', timeout: 5000 });
      
      // Promise.all로 클릭과 네비게이션 동시 대기
      await Promise.all([
        page.waitForLoadState('networkidle'),
        westRoomLink.click(),
      ]);
      
      await new Promise(r => setTimeout(r, 3000));
      
      const afterTitle = await page.title();
      console.log(`클릭 후 페이지 제목: ${afterTitle}`);
      
      if (afterTitle.includes('403')) {
        console.log('❌ 403 에러 발생');
      } else {
        console.log('✅ 페이지 로드 성공!');
        
        // 작품 목록 다시 확인
        const worksAfterClick = await page.evaluate(() => {
          const works = [];
          document.querySelectorAll('a[href*="Scollection"]').forEach(a => {
            const text = a.textContent?.trim();
            const href = a.getAttribute('href');
            if (text && text.length > 3 && href && href.includes('l6')) {
              works.push({ title: text, href: href });
            }
          });
          return works;
        });
        
        console.log(`\nWest Room 작품: ${worksAfterClick.length}개`);
        worksAfterClick.slice(0, 10).forEach(w => console.log(`  - ${w.title}`));
      }
      
      await page.screenshot({ path: path.join(DEBUG_DIR, 'wallace-v3-after-click.png'), fullPage: true });
      
    } catch (err) {
      console.log(`클릭 오류: ${err.message}`);
    }
    
    console.log('\n✅ 디버그 완료!');
    
  } catch (error) {
    console.error('오류:', error);
  } finally {
    await browser.close();
  }
}

debugRoomPage().catch(console.error);
