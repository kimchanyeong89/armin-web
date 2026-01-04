/**
 * Pinacoteca Ambrosiana 스크래퍼 - 테스트 버전
 * 
 * 수집 정보:
 * - 작품 제목, 작가, 년도, medium, type, dimensions, room
 * - 이미지 URL
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/ambrosiana-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/ambrosiana-progress.json');
const TEST_MODE = process.argv.includes('--test');
const MAX_SCROLL = TEST_MODE ? 3 : 50;
const SAVE_INTERVAL = 50;

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { artworks: [], seenIds: [] };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function saveFinal(artworks) {
  const collection = {
    museum: 'Pinacoteca Ambrosiana',
    museumId: 'ambrosiana',
    location: 'Milan, Italy',
    collectionName: 'Pinacoteca Ambrosiana Collection',
    scrapedAt: new Date().toISOString(),
    totalObjects: artworks.length,
    coverImage: artworks[0]?.image || '',
    objects: artworks
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2));
  console.log(`💾 저장: ${OUTPUT_FILE} (${artworks.length}개)`);
}

async function scrapeDetailPage(page, url, id) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await delay(3000);  // 앱 로드 대기
    
    const details = await page.evaluate(() => {
      const result = {};
      
      // 전체 텍스트에서 패턴 추출
      const bodyText = document.body.innerText || '';
      const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l);
      
      // 특정 섹션 찾기 (분석 결과에 따른 패턴)
      // 예: "BOZZETTO PER "IL BACIO"" 다음에 "POST 1859 - ANTE 1859"
      //     "HAYEZ FRANCESCO (1791/ 1882)"
      
      // 제목: "TORNA AI RISULTATI" 다음 줄
      const tornaIdx = lines.findIndex(l => l.includes('TORNA AI RISULTATI'));
      if (tornaIdx !== -1 && lines[tornaIdx + 1]) {
        result.title = lines[tornaIdx + 1];
      }
      
      // 작가: 이름 (년도/년도) 패턴
      lines.forEach((line, i) => {
        // 작가 패턴: "NAME (1234/ 5678)" 또는 "NAME (1234 - 5678)"
        const artistMatch = line.match(/^([A-Z][A-Z\s]+)\s*\(\s*(\d{4})\s*[\/\-]\s*(\d{4})\s*\)$/);
        if (artistMatch && !result.artist) {
          // HAYEZ FRANCESCO -> Francesco Hayez
          const nameParts = artistMatch[1].split(/\s+/).filter(p => p);
          if (nameParts.length >= 2) {
            const lastName = nameParts[0].charAt(0) + nameParts[0].slice(1).toLowerCase();
            const firstName = nameParts.slice(1).map(p => p.charAt(0) + p.slice(1).toLowerCase()).join(' ');
            result.artist = `${firstName} ${lastName}`;
          } else {
            result.artist = artistMatch[1];
          }
        }
      });
      
      // 년도: 제목 다음 줄 (POST/ANTE/ca./SEC. 패턴 포함)
      if (tornaIdx !== -1 && lines[tornaIdx + 2]) {
        const yearLine = lines[tornaIdx + 2];
        const yearMatch = yearLine.match(/(\d{4})/);
        if (yearMatch) {
          result.year = yearMatch[1];
        }
      }
      
      // TIPO DI OGGETTO 다음 줄 = type
      const tipoIdx = lines.findIndex(l => l === 'TIPO DI OGGETTO');
      if (tipoIdx !== -1 && lines[tipoIdx + 1]) {
        result.type = lines[tipoIdx + 1];
      }
      
      // MATERIA E TECNICA 다음 줄 = medium
      const materiaIdx = lines.findIndex(l => l === 'MATERIA E TECNICA');
      if (materiaIdx !== -1 && lines[materiaIdx + 1]) {
        result.medium = lines[materiaIdx + 1];
      }
      
      // SALA 다음 줄 = room
      const salaIdx = lines.findIndex(l => l === 'SALA');
      if (salaIdx !== -1 && lines[salaIdx + 1]) {
        result.room = lines[salaIdx + 1];
      }
      
      // 이미지: comwork API
      const img = document.querySelector('img[src*="comwork"], img[src*="museum."]');
      if (img) {
        result.image = img.src.replace('/thumbnail', '');
      }
      
      return result;
    });
    
    return details;
  } catch (e) {
    console.log(`  ⚠️ 상세 페이지 에러: ${e.message.substring(0, 50)}`);
    return null;
  }
}

async function main() {
  console.log('🎨 Pinacoteca Ambrosiana 스크래핑');
  console.log(`모드: ${TEST_MODE ? '테스트 (3회 스크롤)' : '전체'}`);
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    // 컬렉션 페이지 로드
    console.log('📄 컬렉션 페이지 로드 중...');
    await page.goto('https://www.ambrosiana.it/en/pinacoteca-collections/#/category', {
      waitUntil: 'networkidle',
      timeout: 60000
    });
    await delay(8000);  // 앱 로드 대기
    
    // 1단계: 스크롤하면서 모든 카드 링크 및 이미지 수집
    console.log('\n📜 카드 링크 수집 중...');
    let allCards = new Map();  // id -> {url, thumbnail}
    let scrollCount = 0;
    let lastCount = 0;
    let stall = 0;
    
    while (scrollCount < MAX_SCROLL && stall < 5) {
      // 현재 보이는 카드 수집
      const cards = await page.evaluate(() => {
        const items = document.querySelectorAll('.photo-item');
        return Array.from(items).map(item => {
          const link = item.querySelector('a');
          const img = item.querySelector('img');
          const href = link?.href || '';
          const id = href.split('/').pop() || '';
          return {
            id,
            url: href,
            thumbnail: img?.src || ''
          };
        }).filter(c => c.id && c.url.includes('/dettaglio/'));
      });
      
      cards.forEach(card => {
        if (!allCards.has(card.id)) {
          allCards.set(card.id, card);
        }
      });
      
      process.stdout.write(`\r  스크롤 ${scrollCount + 1}: ${allCards.size}개 링크 (stall: ${stall})`);
      
      if (allCards.size === lastCount) {
        stall++;
      } else {
        stall = 0;
        lastCount = allCards.size;
      }
      
      // 스크롤 다운
      await page.evaluate(() => window.scrollBy(0, 2000));
      await delay(1500);
      scrollCount++;
    }
    
    console.log(`\n✅ 총 ${allCards.size}개 링크 수집 완료`);
    
    // 2단계: 각 상세 페이지 방문
    console.log('\n📖 상세 페이지 수집 중...');
    const progress = loadProgress();
    const seenIds = new Set(progress.seenIds);
    let artworks = progress.artworks;
    
    const cardArray = Array.from(allCards.values());
    
    for (let i = 0; i < cardArray.length; i++) {
      const card = cardArray[i];
      const { id, url: link, thumbnail } = card;
      
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      
      const details = await scrapeDetailPage(page, link, id);
      
      if (details) {
        const artwork = {
          id: `ambrosiana-${id.substring(0, 8)}`,
          title: details.title || 'Untitled',
          artist: details.artist || 'Unknown',
          year: details.year || null,
          medium: details.medium || '',
          type: details.type || '',
          dimensions: details.dimensions || '',
          room: details.room || '',
          image: details.image || thumbnail.replace('/thumbnail', '') || '',
          source: 'Pinacoteca Ambrosiana',
          url: link
        };
        
        artworks.push(artwork);
        console.log(`  [${artworks.length}/${cardArray.length}] ${artwork.title.substring(0, 35)} | ${artwork.artist.substring(0, 18)}`);
      }
      
      // 50개마다 저장
      if (artworks.length > 0 && artworks.length % SAVE_INTERVAL === 0) {
        saveProgress({ artworks, seenIds: Array.from(seenIds) });
        saveFinal(artworks);
        console.log(`💾 중간 저장: ${artworks.length}개`);
      }
      
      await delay(800);
    }
    
    // 최종 저장
    saveFinal(artworks);
    
    console.log('\n=== 완료 ===');
    console.log(`총 수집: ${artworks.length}개`);
    console.log(`이미지: ${artworks.filter(a => a.image).length}개`);
    console.log(`제목: ${artworks.filter(a => a.title && a.title !== 'Untitled').length}개`);
    console.log(`작가: ${artworks.filter(a => a.artist && a.artist !== 'Unknown').length}개`);
    console.log(`년도: ${artworks.filter(a => a.year).length}개`);
    
  } catch (e) {
    console.log('Error:', e.message);
    if (artworks && artworks.length > 0) {
      saveFinal(artworks);
    }
  }
  
  await browser.close();
}

main().catch(console.error);
