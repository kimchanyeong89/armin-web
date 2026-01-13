/**
 * 국립경주박물관 상세 API 테스트 (1페이지만)
 * 상세 정보가 제대로 수집되는지 확인
 */

const fs = require('fs');

const API_KEY = 'd44723b6b598e8f13c9a93d5bcb488219b58fe60bec8d9c7af4ef7fcc199b349';
const BASE_URL = 'http://www.emuseum.go.kr/openapi';

// 국립경주박물관 코드
const MUSEUM_CODE_PREFIX = 'PS01001002';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJSON(url) {
  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  const text = await response.text();
  if (text.startsWith('<?xml') || text.startsWith('<')) {
    // XML 에러 응답인지 확인
    console.log('XML Response:', text.substring(0, 500));
    throw new Error('XML response received');
  }
  
  return JSON.parse(text);
}

async function fetchPage(pageNo) {
  const url = `${BASE_URL}/relic/list?serviceKey=${API_KEY}&numOfRows=100&pageNo=${pageNo}`;
  console.log(`\n📄 Fetching list page ${pageNo}...`);
  return fetchJSON(url);
}

async function fetchRelicDetail(relicId) {
  const url = `${BASE_URL}/relic/detail?serviceKey=${API_KEY}&id=${relicId}`;
  return fetchJSON(url);
}

async function main() {
  console.log('=== 국립경주박물관 상세 API 테스트 ===\n');
  
  try {
    // 기존 데이터에서 ID 가져와서 직접 상세 API 테스트
    const existingDataPath = require('path').join(__dirname, '../public/data/gyeongju-museum-part2.json');
    const existingData = JSON.parse(fs.readFileSync(existingDataPath, 'utf8'));
    
    console.log(`기존 데이터에서 ${existingData.length}개 항목 로드됨`);
    
    // 처음 5개 ID로 상세 API 테스트
    const gyeongjuItems = existingData.slice(0, 5).map(item => ({
      id: item.id,
      nameKr: item.title
    }));
    
    console.log(`테스트할 항목: ${gyeongjuItems.length}개\n`);
    
    // 처음 2개만 상세 정보 테스트
    const testItems = gyeongjuItems.slice(0, 2);
    
    console.log('--- 상세 API 테스트 (2개 항목) ---\n');
    
    for (let i = 0; i < testItems.length; i++) {
      const item = testItems[i];
      console.log(`[${i + 1}/5] ID: ${item.id}`);
      console.log(`  제목: ${item.nameKr}`);
      
      try {
        // 요청 간 1초 대기 (rate limit 방지)
        if (i > 0) {
          await sleep(1000);
        }
        
        const detail = await fetchRelicDetail(item.id);
        
        // 원본 응답 출력
        console.log('  ✅ 상세 API 성공!');
        console.log('  원본 응답:', JSON.stringify(detail, null, 2).substring(0, 1500));
        console.log(`  - 설명: ${detail.desc ? detail.desc.substring(0, 50) + '...' : '(없음)'}`);
        console.log(`  - 크기: ${detail.sizeInfo || '(없음)'}`);
        console.log(`  - 재질: ${detail.materialName1 || '(없음)'} / ${detail.materialName2 || '(없음)'}`);
        console.log(`  - 시대: ${detail.nationalityName1 || '(없음)'} / ${detail.nationalityName2 || '(없음)'}`);
        console.log(`  - 분류: ${detail.purposeName1 || '(없음)'} > ${detail.purposeName2 || '(없음)'}`);
        console.log(`  - 출토지: ${detail.placeLandName1 || '(없음)'}`);
        console.log(`  - 색인어: ${detail.indexWord || '(없음)'}`);
        console.log('');
        
      } catch (error) {
        console.log(`  ❌ 상세 API 실패: ${error.message}`);
        console.log('');
      }
    }
    
    console.log('=== 테스트 완료 ===');
    
  } catch (error) {
    console.error('테스트 실패:', error.message);
  }
}

main();
