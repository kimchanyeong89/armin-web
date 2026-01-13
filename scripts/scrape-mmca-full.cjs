/**
 * 국립현대미술관(MMCA) 전체 소장품 스크래퍼
 * 
 * MMCA 웹사이트에서 전체 11,762개 소장작품을 가져옵니다.
 * API는 112개만 제공하므로 웹 스크래핑이 필요합니다.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/mmca-full-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/mmca-full-progress.json');

// 설정
const CONFIG = {
  baseUrl: 'https://www.mmca.go.kr',
  listUrl: 'https://www.mmca.go.kr/collections/collectionsList.do',
  itemsPerPage: 100,  // 한 페이지당 작품 수 (최대)
  delayBetweenPages: 2000,
  delayBetweenDetails: 500,
  maxRetries: 3
};

// 진행 상황 로드
function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return { 
    page: 1, 
    artworks: [],
    processedIds: new Set()
  };
}

// 진행 상황 저장
function saveProgress(progress) {
  const toSave = {
    page: progress.page,
    artworks: progress.artworks,
    processedIds: [...progress.processedIds]
  };
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(toSave, null, 2));
}

// 결과 저장
function saveResults(artworks) {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
  console.log(`💾 저장됨: ${OUTPUT_FILE}`);
}

// 작품 통계 출력
function printStats(artworks) {
  console.log(`\n📊 수집 통계:`);
  console.log(`   총 작품 수: ${artworks.length}`);
  
  // 작가별 통계
  const artistCounts = {};
  artworks.forEach(a => {
    const artist = a.artist || 'Unknown';
    artistCounts[artist] = (artistCounts[artist] || 0) + 1;
  });
  
  const topArtists = Object.entries(artistCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  console.log(`\n작가별 (상위 10):`);
  topArtists.forEach(([name, count]) => {
    console.log(`  ${name}: ${count}`);
  });
  
  // 분류별 통계
  const categoryCounts = {};
  artworks.forEach(a => {
    const cat = a.category || 'Unknown';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });
  
  console.log(`\n분류별:`);
  Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, count]) => {
      console.log(`  ${name}: ${count}`);
    });
  
  const withImages = artworks.filter(a => a.imageUrl).length;
  console.log(`\n📷 이미지 있는 작품: ${withImages}개`);
}

async function scrapeMMCA() {
  console.log('🏛️  국립현대미술관(MMCA) 전체 소장품 스크래퍼');
  console.log('='.repeat(50));
  
  // 진행 상황 로드
  let progress = loadProgress();
  if (progress.processedIds && Array.isArray(progress.processedIds)) {
    progress.processedIds = new Set(progress.processedIds);
  } else {
    progress.processedIds = new Set();
  }
  
  if (progress.artworks.length > 0) {
    console.log(`📂 이전 진행 상황 로드: ${progress.artworks.length}개 작품, 페이지 ${progress.page}`);
  }
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'ko-KR'
  });
  
  const page = await context.newPage();
  
  try {
    // 메인 페이지 로드하여 총 작품 수 확인
    console.log(`\n📊 총 작품 수 확인 중...`);
    await page.goto(CONFIG.listUrl, { waitUntil: 'networkidle', timeout: 60000 });
    
    // 100개씩 보기 선택
    await page.waitForSelector('.selectSet', { timeout: 10000 });
    
    // 총 작품 수 추출
    const totalText = await page.$eval('.resultInfo', el => el.textContent).catch(() => null);
    let totalCount = 0;
    if (totalText) {
      const match = totalText.match(/총\s*([0-9,]+)\s*건/);
      if (match) {
        totalCount = parseInt(match[1].replace(/,/g, ''));
      }
    }
    
    console.log(`✅ 총 작품 수: ${totalCount.toLocaleString()}개`);
    const totalPages = Math.ceil(totalCount / CONFIG.itemsPerPage);
    console.log(`📄 총 페이지: ${totalPages}페이지 (페이지당 ${CONFIG.itemsPerPage}개)`);
    
    // 페이지 순회
    for (let pageNum = progress.page; pageNum <= totalPages; pageNum++) {
      console.log(`\n📥 페이지 ${pageNum}/${totalPages} 수집 중...`);
      
      // 페이지 URL 로드
      const pageUrl = `${CONFIG.listUrl}?pageIndex=${pageNum}&listCnt=${CONFIG.itemsPerPage}`;
      
      for (let retry = 0; retry < CONFIG.maxRetries; retry++) {
        try {
          await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });
          await page.waitForSelector('.workList', { timeout: 10000 });
          break;
        } catch (e) {
          console.log(`   ⚠️ 페이지 로드 재시도 ${retry + 1}/${CONFIG.maxRetries}`);
          if (retry === CONFIG.maxRetries - 1) throw e;
          await new Promise(r => setTimeout(r, 3000));
        }
      }
      
      // 작품 목록 추출
      const artworkItems = await page.$$eval('.workList li', items => {
        return items.map(item => {
          const link = item.querySelector('a');
          const href = link?.getAttribute('href') || '';
          const img = item.querySelector('img');
          const title = item.querySelector('.title')?.textContent?.trim() || '';
          const artist = item.querySelector('.artist')?.textContent?.trim() || '';
          const info = item.querySelector('.info')?.textContent?.trim() || '';
          
          // wrkinfoSeqno 추출
          const seqnoMatch = href.match(/wrkinfoSeqno=(\d+)/);
          const seqno = seqnoMatch ? seqnoMatch[1] : null;
          
          return {
            seqno,
            title,
            artist,
            info,
            thumbnailUrl: img?.src || null,
            href
          };
        }).filter(item => item.seqno);
      });
      
      console.log(`   📦 ${artworkItems.length}개 작품 발견`);
      
      // 각 작품 상세 정보 수집
      for (const item of artworkItems) {
        if (progress.processedIds.has(item.seqno)) {
          continue;
        }
        
        try {
          // 상세 페이지 방문
          const detailUrl = `${CONFIG.baseUrl}/collections/collectionsDetailPage.do?wrkinfoSeqno=${item.seqno}`;
          await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 30000 });
          
          // 상세 정보 추출
          const details = await page.evaluate(() => {
            const result = {};
            
            // 제목
            const titleEl = document.querySelector('.workTitle, .title, h3');
            result.title = titleEl?.textContent?.trim() || '';
            
            // 작가명
            const artistEl = document.querySelector('.artist, .artistName');
            result.artist = artistEl?.textContent?.trim() || '';
            
            // 정보 테이블 파싱
            const infoItems = document.querySelectorAll('.workInfo li, .infoList li, .detailInfo li, dl dt, dl dd');
            const infoTexts = [];
            infoItems.forEach(el => {
              infoTexts.push(el.textContent?.trim());
            });
            result.infoTexts = infoTexts;
            
            // 이미지 URL
            const mainImg = document.querySelector('.workImg img, .mainImage img, .viewImage img');
            result.imageUrl = mainImg?.src || null;
            
            // 설명
            const descEl = document.querySelector('.workDesc, .description, .txtArea');
            result.description = descEl?.textContent?.trim() || '';
            
            // 분류, 연도, 재료, 크기 등 상세 정보
            const dtElements = document.querySelectorAll('dt');
            const ddElements = document.querySelectorAll('dd');
            
            for (let i = 0; i < dtElements.length; i++) {
              const label = dtElements[i]?.textContent?.trim();
              const value = ddElements[i]?.textContent?.trim();
              if (label && value) {
                if (label.includes('분류')) result.category = value;
                if (label.includes('제작연도') || label.includes('년도')) result.year = value;
                if (label.includes('재료') || label.includes('재질')) result.medium = value;
                if (label.includes('크기') || label.includes('규격')) result.dimensions = value;
                if (label.includes('소장경위')) result.acquisition = value;
              }
            }
            
            return result;
          });
          
          // 작품 데이터 생성
          const artwork = {
            id: `mmca-${item.seqno}`,
            title: details.title || item.title,
            artist: details.artist || item.artist || 'Unknown',
            year: details.year || null,
            medium: details.medium || null,
            dimensions: details.dimensions || null,
            category: details.category || null,
            description: details.description || null,
            imageUrl: details.imageUrl || item.thumbnailUrl,
            thumbnailUrl: item.thumbnailUrl,
            sourceUrl: `${CONFIG.baseUrl}/collections/collectionsDetailPage.do?wrkinfoSeqno=${item.seqno}`,
            museum: '국립현대미술관',
            museumEn: 'National Museum of Modern and Contemporary Art, Korea',
            country: 'South Korea'
          };
          
          progress.artworks.push(artwork);
          progress.processedIds.add(item.seqno);
          
          await new Promise(r => setTimeout(r, CONFIG.delayBetweenDetails));
          
        } catch (e) {
          console.log(`   ⚠️ 작품 ${item.seqno} 상세 정보 실패: ${e.message}`);
          // 기본 정보만으로 저장
          progress.artworks.push({
            id: `mmca-${item.seqno}`,
            title: item.title,
            artist: item.artist || 'Unknown',
            thumbnailUrl: item.thumbnailUrl,
            sourceUrl: `${CONFIG.baseUrl}/collections/collectionsDetailPage.do?wrkinfoSeqno=${item.seqno}`,
            museum: '국립현대미술관',
            museumEn: 'National Museum of Modern and Contemporary Art, Korea',
            country: 'South Korea'
          });
          progress.processedIds.add(item.seqno);
        }
      }
      
      // 진행 상황 저장 (페이지마다)
      progress.page = pageNum + 1;
      saveProgress(progress);
      console.log(`   ✅ 총 ${progress.artworks.length}개 작품 수집됨`);
      
      await new Promise(r => setTimeout(r, CONFIG.delayBetweenPages));
    }
    
    console.log(`\n🎉 수집 완료!`);
    saveResults(progress.artworks);
    printStats(progress.artworks);
    
    // 진행 파일 삭제
    if (fs.existsSync(PROGRESS_FILE)) {
      fs.unlinkSync(PROGRESS_FILE);
    }
    
  } catch (error) {
    console.error(`\n❌ 오류: ${error.message}`);
    saveProgress(progress);
    saveResults(progress.artworks);
    console.log(`\n💾 현재까지 ${progress.artworks.length}개 저장됨`);
  } finally {
    await browser.close();
  }
}

scrapeMMCA();
