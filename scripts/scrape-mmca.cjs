/**
 * 국립현대미술관(MMCA) 소장작품 API 스크래퍼
 * 
 * API: 문화데이터광장 (culture.go.kr)
 * 엔드포인트: https://api.kcisa.kr/openapi/service/rest/meta10/get20150041
 */

const fs = require('fs');
const path = require('path');

// API 설정
const API_KEY = 'ff405e04-42c4-4a63-9184-a7df3e37e5ec';
const BASE_URL = 'https://api.kcisa.kr/openapi/service/rest/meta10/get20150041';
const PAGE_SIZE = 100;
const DELAY_MS = 500;

const OUTPUT_FILE = path.join(__dirname, '../public/data/mmca-collection.json');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPage(pageNo) {
  const url = `${BASE_URL}?serviceKey=${API_KEY}&numOfRows=${PAGE_SIZE}&pageNo=${pageNo}`;
  
  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  return response.json();
}

function transformArtwork(item) {
  // creator 필드에서 작가명 추출 (누리집 제외)
  let artist = item.creator || 'Unknown';
  if (artist === '누리집') {
    artist = 'Unknown';
  }
  
  // URL에서 작품번호 추출
  let workNumber = '';
  if (item.url) {
    const match = item.url.match(/wrkMngNo=([A-Z0-9-]+)/);
    if (match) workNumber = match[1];
  }
  
  // URL에서 작가명 추출 시도
  if (artist === 'Unknown' && item.url) {
    const artistMatch = item.url.match(/artistnm=([^&]+)/);
    if (artistMatch) {
      artist = decodeURIComponent(artistMatch[1]);
    }
  }
  
  return {
    id: workNumber || `mmca-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title: item.title || '',
    alternativeTitle: item.alternativeTitle || '',
    artist: artist,
    date: '', // API에서 제작연도 별도 제공 안함
    museum: '국립현대미술관',
    collection: item.collectionDb || '소장작품',
    category: item.subjectCategory || '',
    keywords: item.subjectKeyword || '',
    dimensions: item.extent || '',
    description: item.description ? item.description.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '') : '',
    spatial: item.spatial || '',
    temporalCoverage: item.temporalCoverage || '',
    person: item.person || '',
    language: item.language || 'kor',
    sourceTitle: item.sourceTitle || '',
    thumbnailUrl: item.referenceIdentifier || '',
    rights: item.rights || '',
    copyright: item.copyrightOthers || '',
    sourceUrl: item.url || '',
    contributor: item.contributor || '',
    regDate: item.regDate || '',
  };
}

async function scrape() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🏛️  국립현대미술관(MMCA) 소장작품 API 스크래퍼');
  console.log('═══════════════════════════════════════════════════════════');
  
  const artworks = [];
  let pageNo = 1;
  let totalCount = 0;
  
  // 첫 페이지로 총 개수 확인
  console.log('\n📊 총 작품 수 확인 중...');
  
  try {
    const firstPage = await fetchPage(1);
    
    if (firstPage.response?.header?.resultCode !== '0000') {
      console.error('❌ API 오류:', firstPage.response?.header?.resultMsg || firstPage.message);
      return;
    }
    
    totalCount = parseInt(firstPage.response.body.totalCount) || 0;
    console.log(`✅ 총 작품 수: ${totalCount}개`);
    
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);
    console.log(`📄 총 페이지: ${totalPages}페이지\n`);
    
    // 모든 페이지 수집
    for (let page = 1; page <= totalPages; page++) {
      process.stdout.write(`\r📥 페이지 ${page}/${totalPages} 수집 중... (${artworks.length}/${totalCount})`);
      
      const data = page === 1 ? firstPage : await fetchPage(page);
      
      if (data.response?.header?.resultCode !== '0000') {
        console.error(`\n❌ 페이지 ${page} 오류`);
        continue;
      }
      
      const items = data.response.body.items.item;
      const itemList = Array.isArray(items) ? items : [items];
      
      for (const item of itemList) {
        if (item) {
          artworks.push(transformArtwork(item));
        }
      }
      
      if (page < totalPages) {
        await sleep(DELAY_MS);
      }
    }
    
    console.log(`\n\n✅ 수집 완료! 총 ${artworks.length}개 작품`);
    
    // 저장
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2), 'utf-8');
    console.log(`💾 저장됨: ${OUTPUT_FILE}`);
    
    // 통계
    console.log('\n📈 통계:');
    
    const byArtist = {};
    artworks.forEach(a => {
      byArtist[a.artist] = (byArtist[a.artist] || 0) + 1;
    });
    
    console.log('\n작가별 (상위 15):');
    Object.entries(byArtist)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .forEach(([artist, count]) => console.log(`  ${artist}: ${count}`));
    
    // 이미지 있는 작품 수
    const withThumbnail = artworks.filter(a => a.thumbnailUrl).length;
    const withUrl = artworks.filter(a => a.sourceUrl).length;
    console.log(`\n📷 썸네일 있는 작품: ${withThumbnail}개`);
    console.log(`🔗 상세 URL 있는 작품: ${withUrl}개`);
    
  } catch (error) {
    console.error('❌ 오류:', error.message);
  }
}

scrape();
