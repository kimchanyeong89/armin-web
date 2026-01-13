/**
 * 국립중앙박물관 - 누락된 페이지만 다시 스크래핑
 * HTTP 500 에러로 실패한 페이지들을 재시도
 */

const fs = require('fs');
const path = require('path');

// 누락된 페이지 목록 (로그에서 추출)
const MISSING_PAGES = [
  770, 820, 870, 920, 922, 970, 1020, 1070, 1082, 1120,
  1170, 1220, 1265, 1270, 1320, 1361, 1411, 1430, 1461, 1511,
  1561, 1611, 1613, 1661, 1711, 1761, 1790, 1854, 1904, 1954,
  1971, 2004, 2054
];

const API_KEY = 'd44723b6b598e8f13c9a93d5bcb488219b58fe60bec8d9c7af4ef7fcc199b349';
const BASE_URL = 'http://www.emuseum.go.kr/openapi';
const PAGE_SIZE = 100;

const OUTPUT_FILE = path.join(__dirname, '../public/data/national-museum-korea-missing.json');
const LOG_FILE = path.join(__dirname, '../downloads/nmk-missing-scrape.log');

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJSON(url) {
  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}

async function fetchPage(pageNo, retryCount = 0) {
  const url = `${BASE_URL}/relic/list?serviceKey=${API_KEY}&numOfRows=${PAGE_SIZE}&pageNo=${pageNo}`;
  
  try {
    const data = await fetchJSON(url);
    
    if (data.resultCode && data.resultCode !== '0000') {
      throw new Error(`API 오류: ${data.resultCode} - ${data.resultMsg}`);
    }
    
    return data;
  } catch (error) {
    if (retryCount < 5) {
      log(`⚠️ 페이지 ${pageNo} 재시도 ${retryCount + 1}/5: ${error.message}`);
      await sleep(30000); // 30초 대기 후 재시도
      return fetchPage(pageNo, retryCount + 1);
    }
    throw error;
  }
}

async function fetchRelicDetail(relicId) {
  const url = `${BASE_URL}/relic/detail?serviceKey=${API_KEY}&id=${relicId}`;
  return fetchJSON(url);
}

function transformArtwork(item, detail = null) {
  const title = item.nameKr || item.name || item.nameCn || '';
  
  const artwork = {
    id: item.id,
    title: title,
    titleHanja: item.name || '',
    titleChinese: item.nameCn || '',
    artist: 'Unknown',
    museum: item.museumName2 || '국립중앙박물관',
    museumCode: item.museumCode,
    inventoryNumber: `${item.relicNo || ''}${item.relicSubNo && item.relicSubNo !== '00000' ? '-' + item.relicSubNo : ''}`,
    nationality: '',
    period: '',
    material: '',
    technique: '',
    dimensions: '',
    category: '',
    subcategory: '',
    genre: '',
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
  log('=== 국립중앙박물관 누락 페이지 스크래핑 시작 ===');
  log(`누락된 페이지 수: ${MISSING_PAGES.length}`);
  
  const allItems = [];
  let successCount = 0;
  let failCount = 0;
  
  for (const pageNo of MISSING_PAGES) {
    try {
      log(`📄 페이지 ${pageNo} 가져오는 중...`);
      
      const data = await fetchPage(pageNo);
      
      if (data && data.list && data.list.length > 0) {
        // 국립중앙박물관(PS01001001) 작품만 필터링
        const filtered = data.list.filter(item => 
          item.museumCode2 === 'PS01001001'
        );
        
        log(`  페이지 ${pageNo}: ${data.list.length}개 중 국중박 ${filtered.length}개`);
        
        // 각 작품의 상세 정보 가져오기
        for (const item of filtered) {
          try {
            await sleep(100);
            const detail = await fetchRelicDetail(item.id);
            const artwork = transformArtwork(item, detail);
            allItems.push(artwork);
          } catch (err) {
            // 상세 정보 실패 시 기본 정보만 저장
            const artwork = transformArtwork(item);
            allItems.push(artwork);
          }
        }
        
        log(`✅ 페이지 ${pageNo}: ${filtered.length}개 작품 수집 완료`);
        successCount++;
      } else {
        log(`⚠️ 페이지 ${pageNo}: 데이터 없음`);
      }
      
      // API 부하 방지를 위한 딜레이
      await sleep(15000);
      
    } catch (error) {
      log(`❌ 페이지 ${pageNo} 최종 실패: ${error.message}`);
      failCount++;
    }
  }
  
  // 결과 저장
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
  
  log('=== 스크래핑 완료 ===');
  log(`성공: ${successCount}/${MISSING_PAGES.length} 페이지`);
  log(`실패: ${failCount}/${MISSING_PAGES.length} 페이지`);
  log(`총 수집 작품: ${allItems.length}개`);
  log(`저장 위치: ${OUTPUT_FILE}`);
}

main().catch(err => {
  log(`치명적 오류: ${err.message}`);
  process.exit(1);
});
