#!/usr/bin/env node
/**
 * Wallace Collection 방 페이지 디버그
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
    
    // 첫 번째 방 (West Room) 클릭
    console.log('📍 West Room 클릭...');
    const westRoomLink = await page.$('a:has-text("West Room")');
    if (westRoomLink) {
      await westRoomLink.click();
      await new Promise(r => setTimeout(r, 3000));
      
      // 스크린샷
      await page.screenshot({ path: path.join(DEBUG_DIR, 'wallace-west-room.png') });
      
      // HTML 저장
      const html = await page.content();
      fs.writeFileSync(path.join(DEBUG_DIR, 'wallace-west-room.html'), html);
      
      // 페이지 구조 분석
      const structure = await page.evaluate(() => {
        const result = {
          url: window.location.href,
          title: document.title,
          lists: [],
          links: [],
          images: [],
        };
        
        // 리스트 요소
        document.querySelectorAll('ul, ol, .list, .resultList').forEach(list => {
          const items = list.querySelectorAll('li, .item');
          if (items.length > 0) {
            result.lists.push({
              class: list.className,
              id: list.id,
              itemCount: items.length,
              sampleText: items[0]?.textContent?.substring(0, 100)?.trim(),
            });
          }
        });
        
        // 링크
        document.querySelectorAll('a').forEach(a => {
          const text = a.textContent?.trim();
          const href = a.getAttribute('href') || '';
          if (text && text.length > 2 && href.includes('collection')) {
            result.links.push({ text: text.substring(0, 50), href: href.substring(0, 100) });
          }
        });
        
        // 이미지
        document.querySelectorAll('img').forEach(img => {
          if (img.src && !img.src.includes('icon') && !img.src.includes('logo')) {
            result.images.push(img.src.substring(0, 100));
          }
        });
        
        return result;
      });
      
      console.log('\n📊 페이지 구조:');
      console.log('URL:', structure.url);
      console.log('Title:', structure.title);
      console.log('\n리스트:', structure.lists.length, '개');
      structure.lists.forEach(l => console.log(`  - ${l.class || l.id}: ${l.itemCount}개 아이템`));
      console.log('\n컬렉션 링크:', structure.links.length, '개');
      structure.links.slice(0, 10).forEach(l => console.log(`  - ${l.text}`));
      console.log('\n이미지:', structure.images.length, '개');
      
      fs.writeFileSync(path.join(DEBUG_DIR, 'wallace-room-structure.json'), JSON.stringify(structure, null, 2));
      
    } else {
      console.log('❌ West Room 링크를 찾을 수 없음');
    }
    
    console.log('\n✅ 디버그 완료! downloads 폴더 확인');
    
  } catch (error) {
    console.error('오류:', error);
  } finally {
    await browser.close();
  }
}

debugRoomPage().catch(console.error);
