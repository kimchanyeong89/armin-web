#!/usr/bin/env node
/**
 * Wallace Collection - objectId 기반 상세 정보 추출
 * detailView API 사용
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../public/data/wallace-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/wallace-enrich-progress.json');

const TEST_MODE = process.argv.includes('--test');
const MAX_ITEMS_TEST = 20;
const BATCH_SIZE = 50;
const PARALLEL_PAGES = 3;

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

async function extractDetailFromPage(page, objectId) {
  const url = `https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=collection&objectId=${objectId}&viewType=detailView`;
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await delay(1000);
    
    const info = await page.evaluate(() => {
      const data = { artist: '', year: '', medium: '', dimensions: '', category: '', accessionNumber: '' };
      
      // Wallace 특유의 tspPrefix/tspValue 패턴
      // Artist - .ListArtist 내부 .tspReferenceLink + 년도
      const artistEl = document.querySelector('.ListArtist .tspReferenceLink');
      const artistYearEl = document.querySelector('.ListArtist .tspValue');
      if (artistEl) {
        let artistName = artistEl.textContent?.trim() || '';
        if (artistYearEl) {
          artistName += ' (' + artistYearEl.textContent?.trim() + ')';
        }
        data.artist = artistName;
      }
      
      // Date
      const dateEl = document.querySelector('.ListDatesall .tspValue');
      if (dateEl) data.year = dateEl.textContent?.trim() || '';
      
      // Medium
      const mediumEl = document.querySelector('.ListMaterial .tspValue');
      if (mediumEl) data.medium = mediumEl.textContent?.trim() || '';
      
      // Dimensions (Image size 또는 Object size)
      const sizeEl = document.querySelector('.masse');
      if (sizeEl) {
        const sizeText = sizeEl.textContent?.trim() || '';
        data.dimensions = sizeText.replace(/^(Image size:|Object size:)\s*/i, '');
      }
      
      // Inv (Accession Number)
      const invEl = document.querySelector('.ListMuseumno .tspValue');
      if (invEl) data.accessionNumber = invEl.textContent?.trim() || '';
      
      // Category - Quick find 섹션이나 타입 정보
      const categoryEl = document.querySelector('.objectType .tspValue, .ListObjecttype .tspValue');
      if (categoryEl) data.category = categoryEl.textContent?.trim() || '';
      
      return data;
    });
    
    return info;
  } catch (err) {
    return null;
  }
}

async function main() {
  console.log('🏛️ Wallace Collection - 상세 정보 보완 v2');
  console.log(TEST_MODE ? '📍 테스트 모드\n' : '📍 전체 모드\n');
  
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const progress = loadProgress();
  
  // 정보가 누락된 작품 찾기
  const itemsToProcess = [];
  data.rooms.forEach((room, roomIdx) => {
    room.artworks.forEach((art, artIdx) => {
      if (!art.collectionId) return;
      if (progress.processed[art.id]) return;
      if (art.year && art.medium && art.dimensions && art.artist !== art.title) return;
      
      itemsToProcess.push({ roomIdx, artIdx, art, objectId: art.collectionId });
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
  
  // 여러 페이지 생성
  const pages = await Promise.all(
    Array(PARALLEL_PAGES).fill(0).map(() => context.newPage())
  );
  
  let updated = 0;
  let failed = 0;
  let noData = 0;
  
  try {
    // 세션 초기화 (각 페이지에서)
    console.log('🔗 세션 초기화...');
    await Promise.all(pages.map(page => 
      page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      })
    ));
    await delay(2000);
    
    // 병렬 처리
    for (let i = 0; i < toProcess.length; i += PARALLEL_PAGES) {
      const batch = toProcess.slice(i, i + PARALLEL_PAGES);
      
      if ((i + 1) % 50 === 1 || i === 0) {
        console.log(`\n[${i + 1}/${toProcess.length}] 처리 중... (업데이트: ${updated}, 실패: ${failed})`);
      }
      
      const results = await Promise.all(
        batch.map((item, idx) => extractDetailFromPage(pages[idx], item.objectId))
      );
      
      for (let j = 0; j < batch.length; j++) {
        const { roomIdx, artIdx, art } = batch[j];
        const info = results[j];
        
        if (info && (info.artist || info.year || info.medium || info.dimensions)) {
          // 데이터 업데이트 (기존 값이 없거나 타이틀과 같은 경우에만)
          const artwork = data.rooms[roomIdx].artworks[artIdx];
          
          if (info.artist && (!artwork.artist || artwork.artist === artwork.title)) {
            artwork.artist = info.artist;
          }
          if (info.year && !artwork.year) {
            artwork.year = info.year;
          }
          if (info.medium && !artwork.medium) {
            artwork.medium = info.medium;
          }
          if (info.dimensions && !artwork.dimensions) {
            artwork.dimensions = info.dimensions;
          }
          if (info.category) {
            artwork.category = info.category;
          }
          if (info.accessionNumber && !artwork.accessionNumber) {
            artwork.accessionNumber = info.accessionNumber;
          }
          
          updated++;
          progress.processed[art.id] = { success: true, ...info };
        } else if (info) {
          noData++;
          progress.processed[art.id] = { success: true, noData: true };
        } else {
          failed++;
          progress.processed[art.id] = { success: false };
        }
      }
      
      // 배치마다 저장
      if ((i + PARALLEL_PAGES) % BATCH_SIZE < PARALLEL_PAGES) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        saveProgress(progress);
      }
      
      await delay(300);
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
  console.log(`✅ 완료! ${updated}개 업데이트, ${noData}개 데이터없음, ${failed}개 실패`);
}

main().catch(console.error);
