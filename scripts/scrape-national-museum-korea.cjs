/**
 * 국립중앙박물관 e뮤지엄 API 스크래퍼
 * 
 * API 문서: https://www.emuseum.go.kr/openApi
 * 데이터셋: https://www.data.go.kr/data/3036708/openapi.do
 */

const fs = require('fs');
const path = require('path');

// API 설정
const API_KEY = 'd44723b6b598e8f13c9a93d5bcb488219b58fe60bec8d9c7af4ef7fcc199b349';
const BASE_URL = 'http://www.emuseum.go.kr/openapi';

// 국립중앙박물관 코드
const MUSEUM_CODES = {
  '국립중앙박물관': 'PS01001001',
  // 필요시 다른 박물관 추가 가능
  // '국립경주박물관': 'PS01001002',
  // '국립부여박물관': 'PS01001003',
};

const PAGE_SIZE = 100;
const DELAY_MS = 300; // API 호출 간 딜레이

// 진행 상황 파일
const PROGRESS_FILE = path.join(__dirname, '../downloads/national-museum-korea-progress.json');
const OUTPUT_FILE = path.join(__dirname, '../public/data/national-museum-korea.json');

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

// API 키 테스트
async function testAPIKey() {
  console.log('🔑 API 키 테스트 중...');
  
  const url = `${BASE_URL}/code?serviceKey=${API_KEY}&parentCode=PS01`;
  
  try {
    const data = await fetchJSON(url);
    
    if (data.resultCode === '0000') {
      console.log('✅ API 키 정상 작동!');
      return true;
    } else if (data.resultCode === '4030') {
      console.log('❌ API 키가 아직 등록되지 않았습니다.');
      console.log('   공공데이터 포털에서 키 발급 후 서버 동기화까지 몇 시간 걸릴 수 있습니다.');
      console.log('   나중에 다시 시도해주세요.');
      return false;
    } else {
      console.log(`❌ API 오류: ${data.resultCode} - ${data.resultMsg}`);
      return false;
    }
  } catch (error) {
    console.error('❌ API 연결 오류:', error.message);
    return false;
  }
}

// 유물 목록 가져오기 (필터 파라미터가 작동하지 않아 전체 목록 가져옴)
async function fetchRelicList(pageNo) {
  const url = `${BASE_URL}/relic/list?serviceKey=${API_KEY}&numOfRows=${PAGE_SIZE}&pageNo=${pageNo}`;
  return fetchJSON(url);
}

// 유물 상세 정보 가져오기
async function fetchRelicDetail(relicId) {
  const url = `${BASE_URL}/relic/detail?serviceKey=${API_KEY}&id=${relicId}`;
  return fetchJSON(url);
}

// 진행 상황 저장
function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf-8');
}

// 진행 상황 로드
function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return { 
    completed: [],
    currentPage: 1,
    totalCount: 0,
    artworks: []
  };
}

// 아트워크 데이터 변환
function transformArtwork(item, detail = null) {
  // 제목: 한글 > 한자 > 중국어 순으로 우선
  const title = item.nameKr || item.name || item.nameCn || '';
  
  const artwork = {
    id: item.id,
    title: title,
    titleHanja: item.name || '',
    titleChinese: item.nameCn || '',
    artist: 'Unknown', // API에서 작가 정보가 별도로 제공되지 않음
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
  
  // 상세 정보가 있으면 추가
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
    
    // 여러 이미지가 있으면 추가
    if (detail.imageList && detail.imageList.list) {
      artwork.images = detail.imageList.list.map(img => ({
        url: img.imgUri,
        thumbnailL: img.imgThumUriL,
        thumbnailM: img.imgThumUriM,
        thumbnailS: img.imgThumUriS,
        order: img.imgOrder
      }));
      artwork.imageCount = detail.imageList.totalCount || 0;
    }
  } else {
    // 목록 API에서도 일부 정보 가져오기
    artwork.nationality = item.nationalityName1 || '';
    artwork.period = item.nationalityName2 || '';
    artwork.material = item.materialName1 || '';
    artwork.category = item.purposeName1 || '';
    artwork.subcategory = item.purposeName2 || '';
  }
  
  return artwork;
}

// 메인 스크래핑 함수
async function scrape(options = {}) {
  const { fetchDetails = false, museumName = '국립중앙박물관' } = options;
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`🏛️  ${museumName} e뮤지엄 API 스크래퍼`);
  console.log('═══════════════════════════════════════════════════════════');
  
  // API 키 테스트
  const keyValid = await testAPIKey();
  if (!keyValid) {
    return;
  }
  
  const museumCode = MUSEUM_CODES[museumName];
  if (!museumCode) {
    console.error(`❌ 알 수 없는 박물관: ${museumName}`);
    return;
  }
  
  // 진행 상황 로드
  let progress = loadProgress();
  let { currentPage, artworks } = progress;
  
  console.log(`\n📍 박물관 코드: ${museumCode}`);
  console.log(`📍 상세 정보 가져오기: ${fetchDetails ? '예' : '아니오'}`);
  console.log(`⚠️  주의: API 필터가 작동하지 않아 클라이언트 측 필터링 사용`);
  
  // 예상 개수 (웹사이트 기준)
  const expectedCount = 207463;  // 국립중앙박물관 공개 소장품 수
  const expectedPages = Math.ceil(expectedCount / PAGE_SIZE);
  
  console.log(`\n📊 예상 유물 수: ${expectedCount.toLocaleString()}개`);
  console.log(`📄 예상 페이지: ~${expectedPages}페이지 (페이지당 ${PAGE_SIZE}개)`);
  
  if (artworks.length > 0) {
    console.log(`\n♻️  이전 진행 상황 발견: ${artworks.length}개 수집됨, ${currentPage}페이지부터 재개`);
  }
  
  // 페이지별로 수집
  console.log('\n🚀 데이터 수집 시작...\n');
  
  let otherMuseumCount = 0;  // 다른 박물관 데이터 개수
  const MAX_OTHER_MUSEUM = 100;  // 이 개수 이상 다른 박물관이 나오면 종료
  
  for (let page = currentPage; page <= expectedPages + 10; page++) {  // 여유 페이지 추가
    process.stdout.write(`\r📥 페이지 ${page}/~${expectedPages} 수집 중... (${artworks.length}/${expectedCount})`);
    
    try {
      const data = await fetchRelicList(page);
      
      if (data.resultCode !== '0000') {
        console.error(`\n❌ 페이지 ${page} 오류: ${data.resultMsg}`);
        continue;
      }
      
      let pageOtherMuseum = 0;  // 이 페이지에서 다른 박물관 개수
      
      for (const item of data.list || []) {
        // 국립중앙박물관 (PS01001001) 데이터만 처리
        if (item.museumCode2 !== museumCode) {
          pageOtherMuseum++;
          otherMuseumCount++;
          continue;  // 다른 박물관 데이터는 스킵
        }
        
        let detail = null;
        
        // 상세 정보 가져오기 (옵션)
        if (fetchDetails && item.id) {
          try {
            const detailData = await fetchRelicDetail(item.id);
            if (detailData.resultCode === '0000' && detailData.list && detailData.list[0]) {
              detail = detailData.list[0];
            }
            await sleep(DELAY_MS / 2);
          } catch (err) {
            // 상세 정보 실패시 무시
          }
        }
        
        const artwork = transformArtwork(item, detail);
        
        // 이미지가 있는 것만 추가
        if (artwork.imageUrl || artwork.thumbnailUrl) {
          artworks.push(artwork);
        }
      }
      
      // 전체 페이지가 다른 박물관이면 종료
      if (pageOtherMuseum === PAGE_SIZE) {
        console.log(`\n\n✅ 국립중앙박물관 데이터 수집 완료! (다른 박물관 데이터 시작됨)`);
        break;
      }
      
      // 진행 상황 저장 (10페이지마다)
      if (page % 10 === 0) {
        progress = { currentPage: page + 1, totalCount: expectedCount, artworks };
        saveProgress(progress);
      }
      
      await sleep(DELAY_MS);
      
    } catch (error) {
      console.error(`\n❌ 페이지 ${page} 오류:`, error.message);
      
      // 오류 발생시 진행 상황 저장
      progress = { currentPage: page, totalCount: expectedCount, artworks };
      saveProgress(progress);
      
      // 잠시 대기 후 재시도
      await sleep(2000);
    }
  }
  
  console.log(`\n\n✅ 수집 완료!`);
  console.log(`📊 총 수집: ${artworks.length}개 (국립중앙박물관, 이미지 있는 유물)`);
  console.log(`📊 건너뜀: ${otherMuseumCount}개 (다른 박물관)`);
  
  // 결과 저장
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2), 'utf-8');
  console.log(`💾 저장됨: ${OUTPUT_FILE}`);
  
  // 진행 파일 삭제
  if (fs.existsSync(PROGRESS_FILE)) {
    fs.unlinkSync(PROGRESS_FILE);
  }
  
  // 통계 출력
  console.log('\n📈 통계:');
  const byPeriod = {};
  const byCategory = {};
  
  artworks.forEach(a => {
    byPeriod[a.period || '미상'] = (byPeriod[a.period || '미상'] || 0) + 1;
    byCategory[a.category || '미분류'] = (byCategory[a.category || '미분류'] || 0) + 1;
  });
  
  console.log('\n시대별:');
  Object.entries(byPeriod)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([period, count]) => console.log(`  ${period}: ${count}`));
  
  console.log('\n분류별:');
  Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([cat, count]) => console.log(`  ${cat}: ${count}`));
}

// 실행
const args = process.argv.slice(2);
// 기본값: 상세 정보 가져오기 (--no-details로 비활성화)
const fetchDetails = !args.includes('--no-details');

scrape({ fetchDetails, museumName: '국립중앙박물관' });
