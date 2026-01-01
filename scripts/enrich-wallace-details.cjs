#!/usr/bin/env node
/**
 * Wallace Collection - 작품 상세 정보 보완
 * 누락된 year, medium, dimensions, artist 정보 추출
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../public/data/wallace-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/wallace-details-progress.json');

const TEST_MODE = process.argv.includes('--test');
const MAX_ITEMS_TEST = 10;
const BATCH_SIZE = 20;

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch {
    return { processed: {} };
  }
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function extractDetailInfo(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await delay(1500);
    
    const info = await page.evaluate(() => {
      const data = { artist: '', year: '', medium: '', dimensions: '', category: '' };
      
      // dt/dd 패턴에서 추출
      document.querySelectorAll('dt').forEach(dt => {
        const dd = dt.nextElementSibling;
        if (!dd || dd.tagName !== 'DD') return;
        
        const label = dt.textContent?.trim().toLowerCase() || '';
        const value = dd.textContent?.trim() || '';
        
        if (label.includes('artist') || label.includes('maker')) {
          data.artist = value;
        } else if (label.includes('date') || label.includes('year')) {
          data.year = value;
        } else if (label.includes('medium') || label.includes('material') || label.includes('technique')) {
          data.medium = value;
        } else if (label.includes('dimension') || label.includes('size') || label.includes('measurement')) {
          data.dimensions = value;
        } else if (label.includes('object') || label.includes('type') || label.includes('category')) {
          data.category = value;
        }
      });
      
      // 테이블 패턴
      document.querySelectorAll('tr').forEach(tr => {
        const cells = tr.querySelectorAll('td, th');
        if (cells.length < 2) return;
        
        const label = cells[0].textContent?.trim().toLowerCase() || '';
        const value = cells[1].textContent?.trim() || '';
        
        if (label.includes('artist') || label.includes('maker')) {
          if (!data.artist) data.artist = value;
        } else if (label.includes('date') || label.includes('year')) {
          if (!data.year) data.year = value;
        } else if (label.includes('medium') || label.includes('material')) {
          if (!data.medium) data.medium = value;
        } else if (label.includes('dimension') || label.includes('size')) {
          if (!data.dimensions) data.dimensions = value;
        } else if (label.includes('object') || label.includes('type')) {
          if (!data.category) data.category = value;
        }
      });
      
      // .field 클래스 패턴
      document.querySelectorAll('.field, .detail-field').forEach(field => {
        const label = field.querySelector('.label, .field-label')?.textContent?.toLowerCase() || '';
        const value = field.querySelector('.value, .field-value')?.textContent?.trim() || '';
        
        if (label.includes('artist') && !data.artist) data.artist = value;
        if (label.includes('date') && !data.year) data.year = value;
        if (label.includes('medium') && !data.medium) data.medium = value;
        if (label.includes('dimension') && !data.dimensions) data.dimensions = value;
      });
      
      return data;
    });
    
    return info;
  } catch (err) {
    console.log(`    ❌ ${err.message.substring(0, 40)}`);
    return null;
  }
}

async function main() {
  console.log('🏛️ Wallace Collection - 상세 정보 보완');
  console.log(TEST_MODE ? '📍 테스트 모드\n' : '📍 전체 모드\n');
  
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const progress = loadProgress();
  
  // 정보가 누락된 작품 찾기
  const itemsToProcess = [];
  data.rooms.forEach((room, roomIdx) => {
    room.artworks.forEach((art, artIdx) => {
      if (!art.sourceUrl) return;
      if (progress.processed[art.id]) return;
      if (art.year && art.medium && art.dimensions) return; // 이미 정보 있음
      
      itemsToProcess.push({ roomIdx, artIdx, art });
    });
  });
  
  console.log(`📋 처리할 작품: ${itemsToProcess.length}개`);
  
  if (itemsToProcess.length === 0) {
    console.log('✅ 모든 작품이 처리되었습니다.');
    return;
  }
  
  const toProcess = TEST_MODE ? itemsToProcess.slice(0, MAX_ITEMS_TEST) : itemsToProcess;
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1400, height: 900 },
  });
  
  const page = await context.newPage();
  let updated = 0;
  let failed = 0;
  
  try {
    // 세션 초기화
    console.log('🔗 세션 초기화...');
    await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await delay(3000);
    
    for (let i = 0; i < toProcess.length; i++) {
      const { roomIdx, artIdx, art } = toProcess[i];
      
      if ((i + 1) % 10 === 0 || i === 0) {
        console.log(`\n[${i + 1}/${toProcess.length}] 처리 중...`);
      }
      
      const info = await extractDetailInfo(page, art.sourceUrl);
      
      if (info) {
        // 데이터 업데이트
        if (info.artist) data.rooms[roomIdx].artworks[artIdx].artist = info.artist;
        if (info.year) data.rooms[roomIdx].artworks[artIdx].year = info.year;
        if (info.medium) data.rooms[roomIdx].artworks[artIdx].medium = info.medium;
        if (info.dimensions) data.rooms[roomIdx].artworks[artIdx].dimensions = info.dimensions;
        if (info.category) data.rooms[roomIdx].artworks[artIdx].category = info.category;
        
        updated++;
        progress.processed[art.id] = { success: true, ...info };
      } else {
        failed++;
        progress.processed[art.id] = { success: false };
      }
      
      // 배치마다 저장
      if ((i + 1) % BATCH_SIZE === 0) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        saveProgress(progress);
        console.log(`  💾 저장 (${updated} 업데이트, ${failed} 실패)`);
      }
      
      await delay(500);
    }
    
  } catch (err) {
    console.error('오류:', err.message);
  } finally {
    await browser.close();
  }
  
  // 최종 저장
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  saveProgress(progress);
  
  console.log('\n' + '='.repeat(50));
  console.log(`✅ 완료! ${updated}개 업데이트, ${failed}개 실패`);
}

main().catch(console.error);
