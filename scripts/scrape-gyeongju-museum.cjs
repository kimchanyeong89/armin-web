/**
 * 국립경주박물관 스크래핑 (e뮤지엄 API)
 * 병렬 처리로 빠른 수집
 */

const fs = require('fs');
const path = require('path');

const API_KEY = 'd44723b6b598e8f13c9a93d5bcb488219b58fe60bec8d9c7af4ef7fcc199b349';
const BASE_URL = 'http://www.emuseum.go.kr/openapi';
const PAGE_SIZE = 100;

// 국립경주박물관 코드 (PS01001002로 시작하는 모든 분관 포함)
const MUSEUM_CODE_PREFIX = 'PS01001002';
const MUSEUM_NAME = '국립경주박물관';

// 병렬 처리 설정
const PARALLEL_DETAIL_COUNT = 20;  // 동시에 20개 상세 API 호출
const PAGE_DELAY = 300;  // 페이지 간 300ms 대기 (빠르게)
const DETAIL_BATCH_DELAY = 100;  // 상세 배치 간 100ms 대기

// 국립경주박물관 페이지 범위 (전체 스캔 결과)
const START_PAGE = 2080;
const END_PAGE = 4200;

const OUTPUT_FILE = path.join(__dirname, '../public/data/gyeongju-museum.json');
const LOG_FILE = path.join(__dirname, '../downloads/gyeongju-scrape.log');
const PROGRESS_FILE = path.join(__dirname, '../downloads/gyeongju-progress.json');

let allArtworks = [];
let startTime = Date.now();

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function saveProgress(pageNo, totalPages) {
  const elapsed = (Date.now() - startTime) / 1000;
  const pagesPerSec = pageNo / elapsed;
  const remaining = (totalPages - pageNo) / pagesPerSec;
  
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
    currentPage: pageNo,
    totalPages,
    artworksCollected: allArtworks.length,
    elapsedSeconds: Math.round(elapsed),
    estimatedRemainingSeconds: Math.round(remaining),
    lastUpdate: new Date().toISOString()
  }, null, 2));
}

async function fetchJSON(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const text = await response.text();
      // XML 응답 체크
      if (text.startsWith('<?xml') || text.startsWith('<')) {
        throw new Error('XML response received');
      }
      
      return JSON.parse(text);
    } catch (error) {
      if (i < retries - 1) {
        await sleep(2000 * (i + 1));
      } else {
        throw error;
      }
    }
  }
}

async function fetchPage(pageNo) {
  const url = `${BASE_URL}/relic/list?serviceKey=${API_KEY}&numOfRows=${PAGE_SIZE}&pageNo=${pageNo}`;
  return fetchJSON(url);
}

async function fetchRelicDetail(relicId) {
  const url = `${BASE_URL}/relic/detail?serviceKey=${API_KEY}&id=${relicId}`;
  return fetchJSON(url);
}

// 병렬로 상세 정보 가져오기
async function fetchDetailsParallel(items) {
  const results = [];
  
  // PARALLEL_DETAIL_COUNT개씩 배치로 처리
  for (let i = 0; i < items.length; i += PARALLEL_DETAIL_COUNT) {
    const batch = items.slice(i, i + PARALLEL_DETAIL_COUNT);
    
    const batchPromises = batch.map(async (item) => {
      try {
        const detail = await fetchRelicDetail(item.id);
        return { item, detail };
      } catch (error) {
        // 상세 실패해도 기본 정보로 진행
        return { item, detail: null };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // 배치 간 짧은 대기
    if (i + PARALLEL_DETAIL_COUNT < items.length) {
      await sleep(DETAIL_BATCH_DELAY);
    }
  }
  
  return results;
}

function transformArtwork(item, detail = null) {
  const title = item.nameKr || item.name || item.nameCn || '';
  
  const artwork = {
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
  };
  
  if (detail) {
    artwork.description = detail.desc || '';
    artwork.dimensions = detail.sizeInfo || '';
    artwork.dimensionRange = detail.sizeRangeName || '';
    artwork.indexWord = detail.indexWord || '';
    artwork.nationality = detail.nationalityName1 || '';
    artwork.period = detail.nationalityName2 || '';
    artwork.material = detail.materialName1 || '';
    artwork.materialDetail = detail.materialName2 || '';
    artwork.category = detail.purposeName1 || '';
    artwork.subcategory = detail.purposeName2 || '';
    artwork.genre = detail.purposeName3 || '';
    artwork.subgenre = detail.purposeName4 || '';
    artwork.excavationSite = detail.placeLandName1 ? 
      `${detail.placeLandName1}${detail.placeLandName2 ? ' ' + detail.placeLandName2 : ''}` : '';
  }
  
  return artwork;
}

async function main() {
  log(`=== ${MUSEUM_NAME} 스크래핑 시작 ===`);
  log(`병렬 처리: ${PARALLEL_DETAIL_COUNT}개씩`);
  log(`페이지 범위: ${START_PAGE} ~ ${END_PAGE}`);
  
  const totalPages = END_PAGE - START_PAGE + 1;
  const estimatedCount = totalPages * 100;  // 약 21만개 예상
  
  log(`예상 유물: ~${estimatedCount.toLocaleString()}개, ${totalPages} 페이지`);
  
  // 이전 진행 상황 복원
  let startPage = START_PAGE;
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      allArtworks = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      if (fs.existsSync(PROGRESS_FILE)) {
        const progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
        startPage = Math.max(progress.currentPage + 1, START_PAGE);
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
      
      // 경주박물관 것만 필터링 (PS01001002로 시작)
      const gyeongjuItems = items.filter(item => item.museumCode && item.museumCode.startsWith(MUSEUM_CODE_PREFIX));
      
      if (gyeongjuItems.length === 0) {
        // 범위 끝에 도달
        if (pageNo > START_PAGE + 100) {
          log(`📄 페이지 ${pageNo}: 경주박물관 항목 없음 - 완료`);
          break;
        }
        continue;
      }
      
      // 병렬로 상세 정보 수집
      const detailResults = await fetchDetailsParallel(gyeongjuItems);
      
      // 변환 및 저장
      const artworks = detailResults.map(({ item, detail }) => transformArtwork(item, detail));
      allArtworks.push(...artworks);
      
      // 진행 상황 계산
      const elapsed = (Date.now() - startTime) / 1000;
      const speed = allArtworks.length / elapsed;
      const pagesProcessed = pageNo - START_PAGE + 1;
      const totalPagesToProcess = END_PAGE - START_PAGE + 1;
      const eta = Math.round((totalPagesToProcess - pagesProcessed) / (pagesProcessed / elapsed) / 60);
      
      log(`✅ 페이지 ${pageNo} (${pagesProcessed}/${totalPagesToProcess}): +${artworks.length}개 (총 ${allArtworks.length.toLocaleString()}개) | 속도: ${speed.toFixed(1)}/초 | ETA: ${eta}분`);
      
      // 10페이지마다 저장
      if (pageNo % 10 === 0) {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allArtworks, null, 2));
        saveProgress(pageNo, totalPagesToProcess);
        log(`💾 중간 저장 완료`);
      }
      
      await sleep(PAGE_DELAY);
      
    } catch (error) {
      log(`❌ 페이지 ${pageNo} 오류: ${error.message}`);
      // 에러 발생해도 저장 후 계속
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allArtworks, null, 2));
      saveProgress(pageNo, END_PAGE - START_PAGE + 1);
      await sleep(5000);
    }
  }
  
  // 최종 저장
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allArtworks, null, 2));
  
  const totalTime = Math.round((Date.now() - startTime) / 1000 / 60);
  log(`=== 완료! ===`);
  log(`총 ${allArtworks.length.toLocaleString()}개 수집`);
  log(`소요 시간: ${totalTime}분`);
}

main().catch(error => {
  log(`치명적 오류: ${error.message}`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allArtworks, null, 2));
  process.exit(1);
});
