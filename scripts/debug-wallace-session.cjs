#!/usr/bin/env node
/**
 * Wallace HTML 구조 디버깅
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  
  const page = await context.newPage();
  
  try {
    console.log('세션 초기화...');
    await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(3000);
    
    console.log('room 모듈 접속...');
    await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=room&viewType=detailList', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForTimeout(3000);
    
    console.log('페이지 제목:', await page.title());
    console.log('URL:', page.url());
    
    // HTML 저장
    const html = await page.content();
    fs.writeFileSync(path.join(__dirname, '../downloads/wallace-session-html.html'), html);
    console.log('\nHTML 저장됨');
    
    // 필터 확인
    const filters = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.filterItem a')).map(a => a.textContent?.trim());
    });
    console.log('\n필터 목록:', filters.slice(0, 10).join(', '));
    
    // West Gallery I 클릭
    console.log('\nWest Gallery I 클릭...');
    const link = await page.$('.filterItem a:text-is("West Gallery I")');
    if (link) {
      await Promise.all([
        page.waitForLoadState('networkidle'),
        link.click(),
      ]);
      await page.waitForTimeout(3000);
      
      console.log('제목:', await page.title());
      
      // HTML 저장
      const roomHtml = await page.content();
      fs.writeFileSync(path.join(__dirname, '../downloads/wallace-room-html.html'), roomHtml);
      console.log('방 HTML 저장됨');
      
      // 이미지 확인
      const images = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('img')).filter(img => 
          img.src && img.src.includes('http') && img.width > 30 && !img.src.includes('spacer')
        ).map(img => ({
          src: img.src.substring(0, 100),
          width: img.width,
          height: img.height,
          alt: img.alt,
        }));
      });
      console.log('\n이미지:', images.length);
      images.slice(0, 5).forEach(img => console.log(' -', img.width + 'x' + img.height, img.src.substring(0, 60)));
      
      // li 구조
      const lis = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('li')).slice(0, 5).map(li => ({
          hasImg: li.querySelector('img') !== null,
          hasLink: li.querySelector('a') !== null,
          text: li.textContent?.substring(0, 50),
        }));
      });
      console.log('\nLI 요소:', lis.length);
      lis.forEach(li => console.log(' -', li.text));
      
    } else {
      console.log('필터 링크를 찾을 수 없음');
    }
    
  } catch (err) {
    console.error('오류:', err.message);
  } finally {
    await browser.close();
  }
}

main();
