/**
 * 국립부여박물관 데이터 enrichment
 * 기존 데이터의 ID로 list API를 조회해서 코드 정보를 가져와 변환
 */

const fs = require('fs');
const path = require('path');

const API_KEY = 'd44723b6b598e8f13c9a93d5bcb488219b58fe60bec8d9c7af4ef7fcc199b349';
const BASE_URL = 'http://www.emuseum.go.kr/openapi';
const PAGE_SIZE = 100;

// 국립부여박물관 코드
const MUSEUM_CODE_PREFIX = 'PS01001003';
const MUSEUM_NAME = '국립부여박물관';

const DATA_DIR = path.join(__dirname, '../public/data');
const CODES_FILE = path.join(DATA_DIR, 'emuseum-codes.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/buyeo-enrich-progress.json');

let codeTable = {};
let allArtworks = [];
let startTime = Date.now();

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadCodeTable() {
  if (fs.existsSync(CODES_FILE)) {
    codeTable = JSON.parse(fs.readFileSync(CODES_FILE, 'utf8'));
    log(`코드 테이블 로드: ${Object.keys(codeTable).length}개`);
  } else {
    log('⚠️ 코드 테이블 없음. fetch-emuseum-codes.cjs 먼저 실행하세요.');
    process.exit(1);
  }
}

function getCodeName(code) {
  if (!code) return '';
  return codeTable[code] || '';
}

async function fetchPage(pageNo) {
  const url = `${BASE_URL}/relic/list?serviceKey=${API_KEY}&numOfRows=${PAGE_SIZE}&pageNo=${pageNo}`;
  
  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' }
  });
  
  const text = await response.text();
  
  if (text.startsWith('<?xml') || text.startsWith('<')) {
    return parseXmlList(text);
  }
  
  return JSON.parse(text);
}

function parseXmlList(xml) {
  const items = [];
  const dataRegex = /<data>(.*?)<\/data>/gs;
  let match;
  
  while ((match = dataRegex.exec(xml)) !== null) {
    const dataContent = match[1];
    const item = {};
    
    const itemRegex = /<item key="([^"]+)" value="([^"]*)"/g;
    let itemMatch;
    
    while ((itemMatch = itemRegex.exec(dataContent)) !== null) {
      item[itemMatch[1]] = itemMatch[2];
    }
    
    items.push(item);
  }
  
  return { list: items };
}

function transformArtwork(item) {
  const title = item.nameKr || item.name || item.nameCn || '';
  
  const material = getCodeName(item.materialCode);
  const nationality = getCodeName(item.nationalityCode);
  const purpose = getCodeName(item.purposeCode);
  const sizeRange = getCodeName(item.sizeRangeCode);
  const placeLand = getCodeName(item.placeLandCode);
  
  return {
    id: item.id,
    title: title,
    titleHanja: item.name || '',
    titleChinese: item.nameCn || '',
    artist: 'Unknown',
    museum: item.museumName2 || MUSEUM_NAME,
    museumCode: item.museumCode,
    inventoryNumber: `${item.relicNo || ''}${item.relicSubNo && item.relicSubNo !== '00000' ? '-' + item.relicSubNo : ''}`,
    imageUrl: item.imgUri || '',
    thumbnailUrl: item.imgThumUriL || item.imgThumUriM || item.imgThumUriS || '',
    sourceUrl: `https://www.emuseum.go.kr/detail?relicId=${item.id}`,
    material: material,
    period: nationality,
    category: purpose,
    sizeRange: sizeRange,
    excavationSite: placeLand,
    indexWord: item.indexWord || '',
  };
}

function saveProgress(pageNo, totalPages) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
    currentPage: pageNo,
    totalPages,
    artworksCollected: allArtworks.length,
    elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
    lastUpdate: new Date().toISOString()
  }, null, 2));
}

function saveArtworks() {
  const PART_SIZE = 5000;
  const numParts = Math.ceil(allArtworks.length / PART_SIZE);
  
  for (let i = 0; i < numParts; i++) {
    const start = i * PART_SIZE;
    const end = Math.min((i + 1) * PART_SIZE, allArtworks.length);
    const part = allArtworks.slice(start, end);
    
    const partFile = path.join(DATA_DIR, `buyeo-museum-part${i + 1}.json`);
    fs.writeFileSync(partFile, JSON.stringify(part, null, 2));
  }
  
  log(`💾 ${numParts}개 파트 파일 저장 완료`);
}

// 부여박물관 페이지 범위 찾기
async function findBuyeoPageRange() {
  log('부여박물관 페이지 범위 탐색 중...');
  
  // 이진 탐색으로 시작점 찾기
  let low = 1, high = 28000;
  let startPage = -1;
  
  // 먼저 부여박물관이 있는 대략적인 위치 찾기
  for (const testPage of [1000, 5000, 10000, 15000, 20000, 25000]) {
    const data = await fetchPage(testPage);
    const items = data.list || [];
    const hasBuyeo = items.some(item => item.museumCode && item.museumCode.startsWith(MUSEUM_CODE_PREFIX));
    if (hasBuyeo) {
      log(`페이지 ${testPage}에서 부여박물관 발견`);
      high = testPage;
      break;
    }
    await sleep(200);
  }
  
  // 시작점 찾기 (이진 탐색)
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const data = await fetchPage(mid);
    const items = data.list || [];
    const hasBuyeo = items.some(item => item.museumCode && item.museumCode.startsWith(MUSEUM_CODE_PREFIX));
    
    if (hasBuyeo) {
      high = mid;
    } else {
      low = mid + 1;
    }
    await sleep(100);
  }
  startPage = low;
  
  // 끝점 찾기
  let endPage = startPage;
  for (let page = startPage; page < startPage + 1000; page += 50) {
    const data = await fetchPage(page);
    const items = data.list || [];
    const hasBuyeo = items.some(item => item.museumCode && item.museumCode.startsWith(MUSEUM_CODE_PREFIX));
    if (hasBuyeo) {
      endPage = page + 50;
    } else {
      break;
    }
    await sleep(100);
  }
  
  log(`부여박물관 페이지 범위: ${startPage} ~ ${endPage}`);
  return { startPage, endPage };
}

async function main() {
  log(`=== ${MUSEUM_NAME} 데이터 수집 (코드 변환 방식) ===`);
  
  loadCodeTable();
  
  // 부여박물관 페이지 범위 (직접 지정 - 메타에서 68,091개 = 약 680페이지)
  // emuseum API는 박물관 코드 순서로 정렬되어 있음
  // PS01001001 = 국립중앙박물관 (약 20만개, 페이지 1~2080)
  // PS01001002 = 국립경주박물관 (약 20만개, 페이지 2080~4200)  
  // PS01001003 = 국립부여박물관 (약 6.8만개, 페이지 4200 이후)
  let startPage = 4200;  // 부여박물관 시작 (경주박물관 끝 이후)
  let endPage = 5000;    // 부여박물관 끝 예상 (700페이지 정도)
  
  // 진행 상황 복원
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      const progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      if (progress.currentPage > 1) {
        startPage = progress.currentPage + 1;
        // 기존 파트 파일 로드
        for (let i = 1; i <= 20; i++) {
          const partFile = path.join(DATA_DIR, `buyeo-museum-part${i}.json`);
          if (fs.existsSync(partFile)) {
            try {
              const partData = JSON.parse(fs.readFileSync(partFile, 'utf8'));
              if (Array.isArray(partData) && partData.length > 0 && partData[0].material !== undefined) {
                allArtworks.push(...partData);
              }
            } catch (e) {}
          }
        }
        log(`이전 진행 복원: ${startPage}페이지부터 재개 (${allArtworks.length}개 수집됨)`);
      }
    } catch (e) {
      log('새로 시작');
    }
  }
  
  // 부여박물관이 어디에 있는지 - 직접 지정 (전체 스캔 방식)
  // 모든 페이지를 돌면서 부여박물관만 필터링
  const totalPages = endPage - startPage + 1;
  log(`수집 범위: ${startPage} ~ ${endPage} (${totalPages} 페이지, 부여박물관만 필터링)`);
  
  let emptyCount = 0;
  let lastFoundPage = 0;
  
  for (let pageNo = startPage; pageNo <= endPage; pageNo++) {
    try {
      const pageData = await fetchPage(pageNo);
      const items = pageData.list || [];
      
      const buyeoItems = items.filter(item => 
        item.museumCode && item.museumCode.startsWith(MUSEUM_CODE_PREFIX)
      );
      
      if (buyeoItems.length === 0) {
        emptyCount++;
        // 100페이지 연속 빈 결과면 완료
        if (emptyCount >= 100 && allArtworks.length > 0) {
          log(`100페이지 연속 빈 결과 - 완료`);
          break;
        }
        // 일정 간격으로 진행 상황 표시
        if (pageNo % 100 === 0) {
          log(`📄 페이지 ${pageNo} 스캔 중... (${allArtworks.length}개 수집됨)`);
        }
        continue;
      }
      
      lastFoundPage = pageNo;
      emptyCount = 0;
      
      const artworks = buyeoItems.map(item => transformArtwork(item));
      allArtworks.push(...artworks);
      
      const elapsed = (Date.now() - startTime) / 1000;
      const speed = allArtworks.length / elapsed;
      
      log(`✅ 페이지 ${pageNo}: +${artworks.length}개 (총 ${allArtworks.length.toLocaleString()}개) | 속도: ${speed.toFixed(1)}/초`);
      
      if (pageNo % 50 === 0) {
        saveArtworks();
        saveProgress(pageNo, totalPages);
      }
      
      await sleep(300);
      
    } catch (error) {
      log(`❌ 페이지 ${pageNo} 오류: ${error.message}`);
      saveArtworks();
      saveProgress(pageNo, totalPages);
      await sleep(3000);
    }
  }
  
  saveArtworks();
  
  const totalTime = Math.round((Date.now() - startTime) / 1000 / 60);
  log(`=== 완료! ===`);
  log(`총 ${allArtworks.length.toLocaleString()}개 수집`);
  log(`소요 시간: ${totalTime}분`);
  
  if (allArtworks.length > 0) {
    log('\n--- 샘플 데이터 ---');
    console.log(JSON.stringify(allArtworks[0], null, 2));
  }
}

main().catch(error => {
  log(`치명적 오류: ${error.message}`);
  saveArtworks();
  process.exit(1);
});
