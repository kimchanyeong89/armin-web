#!/usr/bin/env node
/**
 * Wallace Collection 상세 페이지 분석
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function analyzeDetailPage() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // 샘플 상세 페이지 URL
    const url = 'https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=direct/1/ResultDetailView/result.inline.list.t1.collection_list.$TspTitleLink$1.link&sp=13&sp=Sroom&sp=SfilterDefinition&sp=0&sp=1&sp=3&sp=SdetailView&sp=0&sp=Sdetail&sp=0&sp=T&sp=0&sp=SdetailList&sp=0&sp=F&sp=Scollection&sp=l65432';
    
    console.log('상세 페이지 접속 중...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));
    
    // HTML 저장
    const html = await page.content();
    fs.writeFileSync(path.join(__dirname, '../downloads/wallace-detail.html'), html);
    console.log('HTML 저장됨: downloads/wallace-detail.html');
    
    // 페이지 구조 분석
    const analysis = await page.evaluate(() => {
      const result = {
        title: '',
        allImages: [],
        allTables: [],
        allDivClasses: new Set(),
        allSpanClasses: new Set(),
        textContents: [],
      };
      
      // 제목
      result.title = document.title;
      
      // 모든 이미지
      document.querySelectorAll('img').forEach(img => {
        result.allImages.push({
          src: img.src,
          width: img.width,
          height: img.height,
          alt: img.alt,
          className: img.className,
        });
      });
      
      // 테이블 구조
      document.querySelectorAll('table').forEach((table, idx) => {
        const rows = [];
        table.querySelectorAll('tr').forEach(tr => {
          const cells = [];
          tr.querySelectorAll('th, td').forEach(cell => {
            cells.push({
              tag: cell.tagName,
              text: cell.textContent?.trim().substring(0, 100),
              class: cell.className,
            });
          });
          if (cells.length > 0) rows.push(cells);
        });
        if (rows.length > 0) {
          result.allTables.push({ index: idx, rows: rows.slice(0, 10) });
        }
      });
      
      // DIV 클래스들
      document.querySelectorAll('div[class]').forEach(div => {
        result.allDivClasses.add(div.className);
      });
      
      // 메인 컨텐츠 텍스트
      const mainContent = document.querySelector('.detailView, .detail, .content, .main, #content');
      if (mainContent) {
        result.textContents.push(mainContent.textContent?.substring(0, 2000));
      }
      
      // 라벨-값 쌍 찾기
      document.querySelectorAll('th, dt, .label, strong').forEach(el => {
        const text = el.textContent?.trim();
        if (text && text.length < 50) {
          const nextEl = el.nextElementSibling;
          if (nextEl) {
            result.textContents.push(`${text}: ${nextEl.textContent?.trim().substring(0, 100)}`);
          }
        }
      });
      
      result.allDivClasses = [...result.allDivClasses].slice(0, 30);
      
      return result;
    });
    
    console.log('\n=== 페이지 분석 결과 ===');
    console.log('제목:', analysis.title);
    console.log('\n이미지들:');
    analysis.allImages.forEach((img, i) => {
      console.log(`  ${i + 1}. ${img.src.substring(0, 80)}... (${img.width}x${img.height})`);
    });
    console.log('\n테이블:');
    analysis.allTables.forEach(table => {
      console.log(`  Table ${table.index}:`);
      table.rows.forEach(row => {
        console.log(`    ${row.map(c => `[${c.tag}] ${c.text?.substring(0, 30)}`).join(' | ')}`);
      });
    });
    console.log('\nDIV 클래스들:', analysis.allDivClasses.slice(0, 20));
    console.log('\n텍스트 내용:');
    analysis.textContents.slice(0, 20).forEach(t => console.log(`  - ${t?.substring(0, 100)}`));
    
  } catch (err) {
    console.error('오류:', err.message);
  } finally {
    await browser.close();
  }
}

analyzeDetailPage();
