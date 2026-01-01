#!/usr/bin/env node
/**
 * Wallace Collection 페이지 구조 분석
 * eMuseumPlus 시스템의 Room 필터 구조 파악
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function analyzeWallace() {
  console.log('🔍 Wallace Collection 페이지 구조 분석\n');
  
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
    // 먼저 메인 페이지로 세션 초기화
    console.log('📍 메인 페이지로 세션 시작...');
    await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await delay(3000);
    
    let title = await page.title();
    console.log(`📄 메인 페이지 제목: ${title}`);
    
    // 세션이 생성된 후 Collection 탭 클릭하거나 검색
    console.log('📍 Collection 섹션 탐색...');
    
    // Collection 링크 찾기
    const collectionLink = await page.$('a:has-text("Collection"), a:has-text("Objects"), a:has-text("Search")');
    if (collectionLink) {
      await collectionLink.click();
      await delay(2000);
    }
    
    // Room 필터 찾기
    console.log('📍 Room 필터 찾는 중...');
    const roomFilter = await page.$('text=Room');
    if (roomFilter) {
      console.log('✅ Room 필터 발견! 클릭...');
      await roomFilter.click();
      await delay(2000);
    }
    
    title = await page.title();
    console.log(`📄 현재 페이지 제목: ${title}`);
    
    // 페이지 HTML 저장
    const html = await page.content();
    fs.writeFileSync(
      path.join(__dirname, '../downloads/wallace-debug.html'),
      html
    );
    console.log('📁 HTML 저장: downloads/wallace-debug.html');
    
    // Room 관련 요소 분석
    console.log('\n📍 Room 필터 분석...');
    
    const roomInfo = await page.evaluate(() => {
      const info = {
        allLinks: [],
        filterSections: [],
        roomLinks: [],
        pageStructure: [],
      };
      
      // 모든 링크 수집
      document.querySelectorAll('a').forEach(a => {
        const href = a.getAttribute('href') || '';
        const text = a.textContent?.trim() || '';
        if (text && href) {
          info.allLinks.push({ text: text.substring(0, 100), href: href.substring(0, 200) });
        }
      });
      
      // Room 텍스트가 포함된 요소들
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      
      let node;
      while (node = walker.nextNode()) {
        const text = node.textContent?.trim();
        if (text && (text.toLowerCase().includes('room') || text.toLowerCase().includes('gallery'))) {
          const parent = node.parentElement;
          info.pageStructure.push({
            text: text.substring(0, 100),
            tagName: parent?.tagName,
            className: parent?.className?.substring(0, 100),
            id: parent?.id,
          });
        }
      }
      
      // 필터 섹션 분석
      document.querySelectorAll('[class*="filter"], [class*="Filter"], .preselectFilterSection').forEach(section => {
        const sectionText = section.textContent?.substring(0, 200);
        info.filterSections.push({
          className: section.className,
          id: section.id,
          text: sectionText,
        });
      });
      
      // Room 관련 링크
      document.querySelectorAll('a').forEach(a => {
        const text = a.textContent?.trim().toLowerCase() || '';
        const href = a.getAttribute('href') || '';
        if (text.includes('room') || text.includes('gallery') || text.includes('west') || text.includes('east') || text.includes('landing')) {
          info.roomLinks.push({
            text: a.textContent?.trim(),
            href: href,
          });
        }
      });
      
      return info;
    });
    
    console.log(`\n발견된 Room 관련 링크: ${roomInfo.roomLinks.length}개`);
    roomInfo.roomLinks.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.text}`);
    });
    
    console.log(`\n필터 섹션: ${roomInfo.filterSections.length}개`);
    
    console.log(`\nRoom/Gallery 텍스트가 있는 요소: ${roomInfo.pageStructure.length}개`);
    roomInfo.pageStructure.slice(0, 20).forEach((p, i) => {
      console.log(`  ${i + 1}. [${p.tagName}] ${p.text}`);
    });
    
    // JSON으로 저장
    fs.writeFileSync(
      path.join(__dirname, '../downloads/wallace-analysis.json'),
      JSON.stringify(roomInfo, null, 2)
    );
    console.log('\n📁 분석 결과 저장: downloads/wallace-analysis.json');
    
    // 스크린샷
    await page.screenshot({ 
      path: path.join(__dirname, '../downloads/wallace-screenshot.png'),
      fullPage: true 
    });
    console.log('📁 스크린샷 저장: downloads/wallace-screenshot.png');
    
    // 30초간 브라우저 유지 (수동 탐색 가능)
    console.log('\n⏳ 30초간 브라우저 유지... 수동 탐색 가능');
    await delay(30000);
    
  } catch (error) {
    console.error('오류:', error);
  } finally {
    await browser.close();
  }
}

analyzeWallace().catch(console.error);
