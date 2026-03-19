/**
 * Leopold Museum Parallel Detail Scraper (Recovered)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const VALID_IDS_FILE = path.join(__dirname, '../downloads/leopold-valid-ids.json');
const OUTPUT_FILE = path.join(__dirname, '../public/data/leopold-museum-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/leopold-museum-parallel-progress.json');
const LOG_FILE = path.join(__dirname, '../downloads/leopold-parallel-run.log');

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (e) {}
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 진행 상황 로드
function loadProgress() {
  // 1. 결과 파일에서 로드 (가장 확실함)
  try {
    if (fs.existsSync(OUTPUT_FILE)) {
      const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      if (data.artworks && data.artworks.length > 0) {
        const processedIds = data.artworks.map(a => {
            const match = a.id.match(/leopold-(\d+)/);
            return match ? parseInt(match[1]) : null;
        }).filter(id => id !== null);
        
        log(`📂 기존 데이터 ${data.artworks.length}개 로드됨 (처리된 ID ${processedIds.length}개)`);
        return { artworks: data.artworks, processedIds };
      }
    }
  } catch (e) {
    log(`⚠️ 파일 로드 오류: ${e.message}`);
  }

  return { artworks: [], processedIds: [] };
}

function saveProgress(artworks) {
  try {
    const output = {
      museum: 'Leopold Museum',
      collection: 'Leopold Museum Collection',
      artworks: artworks,
      total: artworks.length,
      scrapedAt: new Date().toISOString()
    };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    
    // Progress 파일도 업데이트
    const processedIds = artworks.map(a => parseInt(a.id.replace('leopold-', ''))).filter(n => !isNaN(n));
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ artworks, processedIds }, null, 2));
    
  } catch (e) {
    log(`⚠️ 저장 오류: ${e.message}`);
  }
}

async function scrapeDetail(page, id) {
  const url = `https://onlinecollection.leopoldmuseum.org/en/object/${id}`;
  
  // 최대 3번 재시도
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // 대기 시간 점진적 증가
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForLoadState('load');
      await sleep(2000 * attempt); // 2초, 4초, 6초 대기
      
      // 유효성 체크
      const isValid = await page.evaluate(() => {
        const h1 = document.querySelector('h1');
        if (!h1) return false;
        const title = h1.textContent.trim();
        if (title.includes('Seite nicht gefunden') || title.includes('Page not found')) return false;
        return true;
      });
      
      if (!isValid) return null;
      
      // 메타데이터 추출
      const metadata = await page.evaluate(() => {
        // ... (내용 동일)
        const data = {};
        data.originalUrl = window.location.href;
        
        const bodyText = document.body.textContent || '';
        const h1 = document.querySelector('h1');
        data.title = h1 ? h1.textContent.trim() : '';
        
        const dateMatch = data.title.match(/,\s*(\d{4})/);
        if (dateMatch) data.date = dateMatch[1];
        
        const objDataIdx = bodyText.lastIndexOf('Object data');
        const objDataSection = objDataIdx !== -1 ? bodyText.substring(objDataIdx, objDataIdx + 1000) : bodyText;
        
        const extract = (start, endMarkers) => {
          const sIdx = objDataSection.indexOf(start);
          if (sIdx === -1) return null;
          let eIdx = -1;
          for (const marker of endMarkers) {
            const idx = objDataSection.indexOf(marker, sIdx);
            if (idx !== -1 && (eIdx === -1 || idx < eIdx)) eIdx = idx;
          }
          if (eIdx !== -1) return objDataSection.substring(sIdx + start.length, eIdx).trim();
          return null;
        };
        
        data.objectType = extract('Category', ['Material', 'Dimensions']);
        data.medium = extract('Material', ['Dimensions', 'Credit']);
        if (data.medium) data.medium = data.medium.replace(/[:\s\u200b]*\/[:\s]*technique/i, '').trim();
        data.dimensions = extract('Dimensions', ['Credit', 'Artists', 'Artist/author']);
        data.artist = extract('Artist/author', ['GND', 'Title']);
        if (!data.artist) data.artist = extract('Artists', ['(', 'Title']);
        
        // 이미지 (필터링 적용)
        const imgEl = document.querySelector('img[src*=".jpg"], img[src*=".png"]');
        if (imgEl) {
          let src = imgEl.src || imgEl.getAttribute('data-src');
          if (src && !src.includes('default.jpg') && !src.includes('logo') && !src.includes('icon')) {
            if (src && !src.startsWith('http')) {
              src = 'https://onlinecollection.leopoldmuseum.org' + (src.startsWith('/') ? '' : '/') + src;
            }
            data.imageUrl = src;
          }
        }
        
        if (!data.imageUrl) return null;
        
        return data;
      });
      
      if (!metadata) return null; // 이미지 없음 등
      
      return {
        id: `leopold-${id}`,
        name: metadata.title,
        artist: metadata.artist || 'Unknown',
        date: metadata.date || '',
        image: metadata.imageUrl || '',
        medium: metadata.medium || '',
        dimension: metadata.dimensions || '',
        category: metadata.objectType || '',
        objectType: metadata.objectType || '',
        type: (metadata.objectType || '').match(/Painting|Drawing|Print|Photo/i) ? '2D' : '3D',
        sourceUrl: url,
        originalUrl: url
      };
      
    } catch (e) {
      log(`⚠️ 실패 (ID ${id}, 시도 ${attempt}/3): ${e.message}`);
      if (attempt === 3) return null; // 3번 실패 시 포기
      await sleep(3000);
      try { await page.reload(); } catch(err) {} // 새로고침 시도
    }
  }
}

async function main() {
  log('🚀 Leopold Museum 상세 수집 시작 (재작성 버전)');
  
  if (!fs.existsSync(VALID_IDS_FILE)) {
    log('❌ ID 파일 없음');
    return;
  }
  const validIdsData = JSON.parse(fs.readFileSync(VALID_IDS_FILE, 'utf8'));
  const allIds = validIdsData.ids || [];
  
  const progress = loadProgress();
  const processedSet = new Set(progress.processedIds);
  const targetIds = allIds.filter(id => !processedSet.has(id));
  
  log(`총 ID: ${allIds.length}, 이미 수집됨: ${processedSet.size}, 남은 작업: ${targetIds.length}`);
  
  if (targetIds.length === 0) {
    log('✨ 모든 작업 완료!');
    return;
  }
  
  let browser = null;
  let page = null;

  // 브라우저 초기화 함수
  const initBrowser = async () => {
    if (browser) await browser.close().catch(() => {});
    browser = await chromium.launch({ 
      headless: true, 
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    });
    page = await browser.newPage();
  };

  await initBrowser();
  
  let artworks = progress.artworks || [];
  
  for (let i = 0; i < targetIds.length; i++) {
    const id = targetIds[i];
    
    // 브라우저 상태 체크 및 복구
    if (!browser.isConnected() || page.isClosed()) {
        log('♻️ 브라우저 재연결 중...');
        await initBrowser();
    }

    const art = await scrapeDetail(page, id);
    
    if (art) {
      artworks.push(art);
      // log(`✅ 수집 성공: ${art.name} (ID: ${id}) | 총 ${artworks.length}개`);
      saveProgress(artworks);
    } 
    
    // 10개마다 메모리 정리를 위해 새 페이지 (선택사항이나 안정성 도움됨)
    if (i % 50 === 0 && i > 0) {
        await page.close();
        page = await browser.newPage();
    }

    // 진행률 로그 (10개 단위)
    if (i % 10 === 0) {
         const percent = Math.round((i / targetIds.length) * 100);
         // log(`진행률: ${percent}% (${i}/${targetIds.length})`);
    }
  }
  
  await browser.close();
  log('✨ 종료');
}

main().catch(console.error);
