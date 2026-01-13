/**
 * 국립경주박물관 데이터 enrichment
 * detail API 대신 list API의 코드를 이름으로 변환
 */

const fs = require('fs');
const path = require('path');

const API_KEY = 'd44723b6b598e8f13c9a93d5bcb488219b58fe60bec8d9c7af4ef7fcc199b349';
const BASE_URL = 'http://www.emuseum.go.kr/openapi';
const PAGE_SIZE = 100;

// 국립경주박물관 코드
const MUSEUM_CODE_PREFIX = 'PS01001002';
const MUSEUM_NAME = '국립경주박물관';

// 경주박물관 페이지 범위
const START_PAGE = 2080;
const END_PAGE = 4200;

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const CODES_FILE = path.join(OUTPUT_DIR, 'emuseum-codes.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/gyeongju-enrich-progress.json');

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
  
  // XML 응답인 경우 파싱
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
  
  // 코드를 이름으로 변환
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
    // 코드에서 변환된 정보
    material: material,
    period: nationality,  // nationalityCode가 시대 정보
    category: purpose,
    sizeRange: sizeRange,
    excavationSite: placeLand,
    indexWord: item.indexWord || '',
  };
}

function saveProgress(pageNo, totalPages) {
  const elapsed = (Date.now() - startTime) / 1000;
  
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
    currentPage: pageNo,
    totalPages,
    artworksCollected: allArtworks.length,
    elapsedSeconds: Math.round(elapsed),
    lastUpdate: new Date().toISOString()
  }, null, 2));
}

function saveArtworks() {
  // 12,000개씩 파트 파일로 분할
  const PART_SIZE = 12000;
  const numParts = Math.ceil(allArtworks.length / PART_SIZE);
  
  for (let i = 0; i < numParts; i++) {
    const start = i * PART_SIZE;
    const end = Math.min((i + 1) * PART_SIZE, allArtworks.length);
    const part = allArtworks.slice(start, end);
    
    const partFile = path.join(OUTPUT_DIR, `gyeongju-museum-part${i + 1}.json`);
    fs.writeFileSync(partFile, JSON.stringify(part, null, 2));
  }
  
  log(`💾 ${numParts}개 파트 파일 저장 완료`);
}

async function main() {
  log(`=== ${MUSEUM_NAME} 데이터 수집 (코드 변환 방식) ===`);
  
  loadCodeTable();
  
  const totalPages = END_PAGE - START_PAGE + 1;
  log(`페이지 범위: ${START_PAGE} ~ ${END_PAGE} (${totalPages} 페이지)`);
  
  // 이전 진행 복원
  let startPage = START_PAGE;
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      const progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      if (progress.currentPage > START_PAGE) {
        startPage = progress.currentPage + 1;
        // 기존 파트 파일 로드
        for (let i = 1; i <= 20; i++) {
          const partFile = path.join(OUTPUT_DIR, `gyeongju-museum-part${i}.json`);
          if (fs.existsSync(partFile)) {
            const partData = JSON.parse(fs.readFileSync(partFile, 'utf8'));
            allArtworks.push(...partData);
          }
        }
        log(`이전 진행 복원: ${startPage}페이지부터 재개 (${allArtworks.length}개 수집됨)`);
      }
    } catch (e) {
      log('새로 시작');
    }
  }
  
  for (let pageNo = startPage; pageNo <= END_PAGE; pageNo++) {
    try {
      const pageData = await fetchPage(pageNo);
      const items = pageData.list || [];
      
      // 경주박물관 것만 필터링
      const gyeongjuItems = items.filter(item => 
        item.museumCode && item.museumCode.startsWith(MUSEUM_CODE_PREFIX)
      );
      
      if (gyeongjuItems.length === 0) {
        // 범위 끝에 도달했을 수 있음
        if (pageNo > START_PAGE + 100 && allArtworks.length > 0) {
          log(`📄 페이지 ${pageNo}: 경주박물관 항목 없음 - 완료 가능성`);
          // 3페이지 연속 없으면 종료
          let emptyCount = 0;
          for (let checkPage = pageNo; checkPage < pageNo + 3 && checkPage <= END_PAGE; checkPage++) {
            const checkData = await fetchPage(checkPage);
            const checkItems = (checkData.list || []).filter(item => 
              item.museumCode && item.museumCode.startsWith(MUSEUM_CODE_PREFIX)
            );
            if (checkItems.length === 0) emptyCount++;
            await sleep(200);
          }
          if (emptyCount >= 3) {
            log('3페이지 연속 빈 결과 - 완료');
            break;
          }
        }
        continue;
      }
      
      // 변환 및 저장
      const artworks = gyeongjuItems.map(item => transformArtwork(item));
      allArtworks.push(...artworks);
      
      // 진행 상황
      const pagesProcessed = pageNo - START_PAGE + 1;
      const elapsed = (Date.now() - startTime) / 1000;
      const speed = allArtworks.length / elapsed;
      const eta = Math.round((END_PAGE - pageNo) * 0.3 / 60);
      
      log(`✅ 페이지 ${pageNo}: +${artworks.length}개 (총 ${allArtworks.length.toLocaleString()}개) | 속도: ${speed.toFixed(1)}/초 | ETA: ${eta}분`);
      
      // 50페이지마다 저장
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
  
  // 최종 저장
  saveArtworks();
  
  const totalTime = Math.round((Date.now() - startTime) / 1000 / 60);
  log(`=== 완료! ===`);
  log(`총 ${allArtworks.length.toLocaleString()}개 수집`);
  log(`소요 시간: ${totalTime}분`);
  
  // 샘플 출력
  if (allArtworks.length > 0) {
    log('\n--- 샘플 데이터 ---');
    const sample = allArtworks[0];
    console.log(JSON.stringify(sample, null, 2));
  }
}

main().catch(error => {
  log(`치명적 오류: ${error.message}`);
  saveArtworks();
  process.exit(1);
});
