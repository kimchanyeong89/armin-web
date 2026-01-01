#!/usr/bin/env node
/**
 * Wallace Collection - Collection 모듈 직접 접근
 * room 대신 collection 모듈 시도
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    // collection 모듈로 직접 접근
    console.log('🔍 Collection 모듈 접속...');
    await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=collection&viewType=detailList', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    
    await page.waitForTimeout(3000);
    
    // HTML 저장
    const html = await page.content();
    fs.writeFileSync(path.join(__dirname, '../downloads/wallace-collection-module.html'), html);
    
    const pageTitle = await page.title();
    console.log('페이지 제목:', pageTitle);
    console.log('URL:', page.url());
    
    // 이미지 확인
    const images = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img')).filter(img => 
        img.src && img.width > 50 && !img.src.includes('spacer')
      ).map(img => ({
        src: img.src,
        width: img.width,
        height: img.height,
      }));
    });
    
    console.log(`\n이미지: ${images.length}개`);
    images.slice(0, 5).forEach(img => {
      console.log(' -', img.src.substring(0, 100), `(${img.width}x${img.height})`);
    });
    
    // 작품 정보 구조 확인
    const items = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('li').forEach(li => {
        const img = li.querySelector('img');
        const titleLink = li.querySelector('a');
        if (img && titleLink) {
          results.push({
            title: titleLink.textContent?.trim(),
            imgSrc: img.src,
            text: li.textContent?.substring(0, 100),
          });
        }
      });
      return results.slice(0, 3);
    });
    
    console.log('\n샘플 작품:');
    items.forEach(item => {
      console.log(' - 제목:', item.title);
      console.log('   이미지:', item.imgSrc?.substring(0, 80));
      console.log('');
    });
    
  } catch (err) {
    console.error('오류:', err.message);
  } finally {
    await browser.close();
  }
}

main();
