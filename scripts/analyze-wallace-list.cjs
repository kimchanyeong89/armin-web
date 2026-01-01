#!/usr/bin/env node
/**
 * Wallace Collection 목록 페이지 분석
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function analyzeListPage() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    console.log('Room 페이지 접속 중...');
    await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=room&viewType=detailList', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await new Promise(r => setTimeout(r, 3000));
    
    // West Gallery I 클릭
    console.log('West Gallery I 클릭...');
    const roomLink = await page.$('.filterItem a:has-text("West Gallery I")');
    if (roomLink) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
        roomLink.click(),
      ]);
      await new Promise(r => setTimeout(r, 2000));
    }
    
    // HTML 저장
    const html = await page.content();
    fs.writeFileSync(path.join(__dirname, '../downloads/wallace-list.html'), html);
    console.log('HTML 저장됨: downloads/wallace-list.html');
    
    // li 요소들 분석
    const listItems = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll('ul.detailList > li, .resultList li, .collection_list li').forEach((li, idx) => {
        if (idx >= 5) return; // 처음 5개만
        
        const item = {
          html: li.innerHTML.substring(0, 500),
          links: [],
          images: [],
          textContent: li.textContent?.trim().substring(0, 200),
        };
        
        li.querySelectorAll('a').forEach(a => {
          item.links.push({
            text: a.textContent?.trim(),
            href: a.getAttribute('href'),
            class: a.className,
          });
        });
        
        li.querySelectorAll('img').forEach(img => {
          item.images.push({
            src: img.src,
            alt: img.alt,
            class: img.className,
          });
        });
        
        items.push(item);
      });
      return items;
    });
    
    console.log('\n=== 목록 아이템 분석 ===');
    listItems.forEach((item, idx) => {
      console.log(`\n--- 아이템 ${idx + 1} ---`);
      console.log('텍스트:', item.textContent?.substring(0, 150));
      console.log('링크들:');
      item.links.forEach(l => console.log(`  - ${l.text}: ${l.href?.substring(0, 80)}`));
      console.log('이미지:', item.images.length > 0 ? item.images[0].src?.substring(0, 80) : '없음');
    });
    
    // 첫 번째 작품 상세 페이지 클릭
    console.log('\n\n상세 페이지 접속 시도...');
    const firstArtwork = await page.$('ul.detailList > li:first-child a[href*="collection"]');
    if (firstArtwork) {
      const href = await firstArtwork.getAttribute('href');
      console.log('클릭할 링크:', href?.substring(0, 100));
      
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
        firstArtwork.click(),
      ]);
      await new Promise(r => setTimeout(r, 2000));
      
      // 상세 페이지 HTML 저장
      const detailHtml = await page.content();
      fs.writeFileSync(path.join(__dirname, '../downloads/wallace-detail-v2.html'), detailHtml);
      console.log('상세 페이지 HTML 저장됨: downloads/wallace-detail-v2.html');
      
      // 상세 페이지 구조 분석
      const detailInfo = await page.evaluate(() => {
        const info = {
          title: document.title,
          h1: document.querySelector('h1')?.textContent?.trim(),
          tables: [],
          images: [],
        };
        
        // 테이블 데이터
        document.querySelectorAll('table tr').forEach(tr => {
          const th = tr.querySelector('th');
          const td = tr.querySelector('td');
          if (th && td) {
            info.tables.push({
              label: th.textContent?.trim(),
              value: td.textContent?.trim().substring(0, 100),
            });
          }
        });
        
        // 이미지
        document.querySelectorAll('img').forEach(img => {
          if (img.width >= 100 || img.height >= 100) {
            info.images.push({
              src: img.src,
              width: img.width,
              height: img.height,
            });
          }
        });
        
        return info;
      });
      
      console.log('\n=== 상세 페이지 분석 ===');
      console.log('페이지 제목:', detailInfo.title);
      console.log('H1:', detailInfo.h1);
      console.log('테이블 데이터:');
      detailInfo.tables.forEach(t => console.log(`  ${t.label}: ${t.value}`));
      console.log('큰 이미지:', detailInfo.images.length > 0 ? detailInfo.images[0].src?.substring(0, 100) : '없음');
    }
    
  } catch (err) {
    console.error('오류:', err.message);
  } finally {
    await browser.close();
  }
}

analyzeListPage();
