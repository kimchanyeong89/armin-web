/**
 * Leopold Museum Collection Scraper - Continue from existing collection
 * 기존에 수집된 작품을 제외하고 나머지부터 스크래핑
 * 모든 메타데이터 포함 보장
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/leopold-museum-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/leopold-museum-continue-progress.json');
const LOG_FILE = path.join(__dirname, '../downloads/leopold-museum-continue-run.log');
const COLLECTED_IDS_FILE = path.join(__dirname, '../downloads/leopold-collected-ids.json');

// 디렉토리 생성
const OUTPUT_DIR = path.dirname(OUTPUT_FILE);
const DOWNLOADS_DIR = path.dirname(PROGRESS_FILE);
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch (e) {
    log(`⚠️ Progress 파일 읽기 오류: ${e.message}`);
  }
  return { artworks: [], processedIds: [], lastId: 0 };
}

function saveProgress(progress) {
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  } catch (e) {
    log(`⚠️ Progress 파일 저장 오류: ${e.message}`);
  }
}

function loadCollectedIds() {
  try {
    if (fs.existsSync(COLLECTED_IDS_FILE)) {
      const data = JSON.parse(fs.readFileSync(COLLECTED_IDS_FILE, 'utf8'));
      return new Set(data.ids || []);
    }
  } catch (e) {
    log(`⚠️ 수집된 ID 파일 읽기 오류: ${e.message}`);
  }
  
  // 기존 출력 파일에서도 ID 추출
  try {
    if (fs.existsSync(OUTPUT_FILE)) {
      const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      const artworks = data.artworks || [];
      const ids = new Set();
      
      for (const item of artworks) {
        const url = item.originalUrl || item.sourceUrl || '';
        const match = url.match(/\/object\/(\d+)/);
        if (match) {
          ids.add(parseInt(match[1]));
        }
        
        const itemId = item.id || '';
        if (itemId.startsWith('leopold-')) {
          try {
            const idNum = parseInt(itemId.replace('leopold-', ''));
            ids.add(idNum);
          } catch (e) {}
        }
      }
      
      log(`📋 기존 파일에서 ${ids.size}개 ID 추출`);
      return ids;
    }
  } catch (e) {
    log(`⚠️ 기존 파일 읽기 오류: ${e.message}`);
  }
  
  return new Set();
}

async function scrapeArtworkDetail(page, artworkUrl) {
  let retries = 3;
  while (retries > 0) {
    try {
      await page.goto(artworkUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(2000);
      break;
    } catch (error) {
      retries--;
      if (retries === 0) {
        log(`⚠️ 상세 페이지 스크래핑 오류 (${artworkUrl}): ${error.message}`);
        return null;
      }
      log(`⚠️ 재시도 중... (${artworkUrl})`);
      await sleep(1000);
    }
  }
  
  try {
    const metadata = await page.evaluate(() => {
      const data = {};
      data.originalUrl = window.location.href;
      
      // 전체 텍스트
      const bodyText = document.body.textContent || '';
      
      // 제목 (h1에서)
      const titleEl = document.querySelector('h1');
      if (titleEl) {
        const titleText = titleEl.textContent.trim();
        data.title = titleText;
        // 제목에서 날짜 추출 (예: "Title, 1919")
        const dateMatch = titleText.match(/,\s*(\d{4})/);
        if (dateMatch) data.date = dateMatch[1];
      }
      
      // Object data 섹션 찾기 (마지막 "Object data"가 실제 메타데이터)
      const objDataIdx = bodyText.lastIndexOf('Object data');
      const objDataSection = objDataIdx !== -1 ? bodyText.substring(objDataIdx, objDataIdx + 1000) : bodyText;
      
      // indexOf를 사용하여 정확히 추출
      // Date
      const dateIdx = objDataSection.indexOf('Date');
      if (dateIdx !== -1) {
        const datePart = objDataSection.substring(dateIdx + 4, dateIdx + 20);
        const dateMatch = datePart.match(/(\d{4})/);
        if (dateMatch) data.date = dateMatch[1];
      }
      
      // Category (Object type) - "Category" 다음, "Material" 전
      const categoryIdx = objDataSection.indexOf('Category');
      const materialIdx = objDataSection.indexOf('Material', categoryIdx);
      if (categoryIdx !== -1 && materialIdx !== -1) {
        data.objectType = objDataSection.substring(categoryIdx + 8, materialIdx).trim();
      }
      
      // Material/technique (Medium) - "Material" 다음, "Dimensions" 전
      const materialStartIdx = objDataSection.indexOf('Material');
      const dimensionsIdx = objDataSection.indexOf('Dimensions', materialStartIdx);
      if (materialStartIdx !== -1 && dimensionsIdx !== -1) {
        let mediumPart = objDataSection.substring(materialStartIdx + 8, dimensionsIdx);
        // "/technique" 또는 "​/technique" (특수문자 포함) 제거
        mediumPart = mediumPart.replace(/[:\s\u200b]*\/[:\s]*technique/i, '').trim();
        data.medium = mediumPart;
      }
      
      // Dimensions - "Dimensions" 다음, "Artists" 또는 "Credit" 전
      const dimStartIdx = objDataSection.indexOf('Dimensions');
      const creditIdx = objDataSection.indexOf('Credit', dimStartIdx);
      const artistsAfterDimIdx = objDataSection.indexOf('Artists', dimStartIdx);
      const endIdx = creditIdx !== -1 && artistsAfterDimIdx !== -1 
        ? Math.min(creditIdx, artistsAfterDimIdx)
        : (creditIdx !== -1 ? creditIdx : artistsAfterDimIdx);
      if (dimStartIdx !== -1 && endIdx !== -1) {
        data.dimensions = objDataSection.substring(dimStartIdx + 10, endIdx).trim();
      }
      
      // Artist/author - "Artist/author" 다음, "GND" 전
      const artistIdx = objDataSection.indexOf('Artist/author');
      const gndIdx = objDataSection.indexOf('GND', artistIdx);
      if (artistIdx !== -1 && gndIdx !== -1) {
        data.artist = objDataSection.substring(artistIdx + 13, gndIdx).trim();
      } else {
        // "Artists"로 시도
        const artistsIdx = objDataSection.indexOf('Artists');
        const artistsParenIdx = objDataSection.indexOf('(', artistsIdx);
        if (artistsIdx !== -1 && artistsParenIdx !== -1) {
          data.artist = objDataSection.substring(artistsIdx + 7, artistsParenIdx).trim();
        }
      }
      
      // Description (Text 섹션)
      const textMatch = bodyText.match(/Text[:\s]+([^\n]+(?:\n[^\n]+)*?)(?:\n\n|Object data|Provenance)/i);
      if (textMatch) {
        data.description = textMatch[1].trim();
      }
      
      // 이미지
      const imgEl = document.querySelector('img[src*=".jpg"], img[src*=".png"], img[src*=".webp"], img[src*="/images/"]');
      if (imgEl) {
        let imgSrc = imgEl.src || imgEl.getAttribute('data-src') || '';
        if (imgSrc && !imgSrc.startsWith('http')) {
          if (imgSrc.startsWith('/')) {
            imgSrc = 'https://onlinecollection.leopoldmuseum.org' + imgSrc;
          } else {
            imgSrc = 'https://onlinecollection.leopoldmuseum.org/' + imgSrc;
          }
        }
        data.imageUrl = imgSrc;
      }
      
      return data;
    });

    return metadata;
  } catch (error) {
    log(`⚠️ 메타데이터 추출 오류 (${artworkUrl}): ${error.message}`);
    return null;
  }
}

async function main() {
  log('🎨 Leopold Museum Collection Scraper - Continue from existing');
  log('='.repeat(60));
  
  // 기존에 수집된 ID 로드
  const collectedIds = loadCollectedIds();
  log(`📋 기존에 수집된 작품 ID: ${collectedIds.size}개`);
  
  // 진행 상황 로드
  const progress = loadProgress();
  const processedIds = new Set(progress.processedIds || []);
  let lastId = progress.lastId || 0;
  
  // 기존 출력 파일 로드 (병합용)
  let existingArtworks = [];
  try {
    if (fs.existsSync(OUTPUT_FILE)) {
      const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      existingArtworks = data.artworks || [];
      log(`📁 기존 파일에서 ${existingArtworks.length}개 작품 로드`);
    }
  } catch (e) {
    log(`⚠️ 기존 파일 읽기 오류: ${e.message}`);
  }
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  page.on('close', () => {
    log('⚠️ 페이지가 닫혔습니다.');
  });
  
  try {
    const artworks = [...existingArtworks];
    const artworksMap = new Map(); // 중복 방지용
    for (const art of artworks) {
      const url = art.originalUrl || art.sourceUrl || '';
      const match = url.match(/\/object\/(\d+)/);
      if (match) {
        artworksMap.set(parseInt(match[1]), art);
      }
    }
    
    log(`\n🔍 새로운 작품 스크래핑 시작...`);
    log(`📊 목표: 전체 컬렉션 (기존 ${collectedIds.size}개 제외)\n`);
    
    // ID 범위: 1부터 100000까지 (충분히 넓게)
    const MIN_ID = 1;
    const MAX_ID = 100000;
    let foundCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    // 마지막 ID부터 시작
    let startId = Math.max(MIN_ID, lastId + 1);
    
    for (let id = startId; id <= MAX_ID; id++) {
      // 이미 수집된 ID는 스킵
      if (collectedIds.has(id) || processedIds.has(id)) {
        skippedCount++;
        if (skippedCount % 1000 === 0) {
          log(`⏭️ 스킵: ${skippedCount}개 (현재 ID: ${id})`);
        }
        continue;
      }
      
      const url = `https://onlinecollection.leopoldmuseum.org/en/object/${id}`;
      
      try {
        // 페이지 방문하여 존재 여부 확인 및 메타데이터 수집
        let retries = 3;
        let isValid = false;
        let metadata = null;
        
        while (retries > 0) {
          try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await sleep(1500);
            
            isValid = await page.evaluate(() => {
              const h1 = document.querySelector('h1');
              if (!h1) return false;
              const title = h1.textContent.trim();
              const bodyText = document.body.textContent;
              
              // 독일어 및 영어 에러 메시지 체크
              if (title.includes('Seite nicht gefunden') || 
                  title.includes('Page not found') ||
                  title.includes('404')) {
                return false;
              }
              
              if (bodyText.includes('Seite nicht gefunden') || 
                  bodyText.includes('Page not found')) {
                return false;
              }
              
              return title.length > 0;
            });
            
            if (isValid) {
              // 메타데이터 수집
              metadata = await scrapeArtworkDetail(page, url);
            }
            break;
          } catch (error) {
            retries--;
            if (retries === 0) {
              log(`⚠️ 페이지 접근 실패 (${url}): ${error.message}`);
              errorCount++;
            } else {
              await sleep(1000);
            }
          }
        }
        
        if (isValid && metadata) {
          // 작품 데이터 생성
          const artwork = {
            id: `leopold-${id}`,
            name: metadata.title || `Artwork ${id}`,
            artist: metadata.artist || 'Unknown',
            year: metadata.date ? parseInt(metadata.date.match(/\d{4}/)?.[0]) || 0 : 0,
            date: metadata.date || '',
            image: metadata.imageUrl || '',
            sourceUrl: url,
            originalUrl: metadata.originalUrl || url,
            exhibitionName: 'Leopold Museum',
            exhibitionTitle: 'Leopold Museum Collection',
            description: metadata.description || '',
            medium: metadata.medium || '',
            dimension: metadata.dimensions || '',
            category: metadata.objectType || '',
            objectType: metadata.objectType || '',
            type: '2D'
          };
          
          // 2D/3D 타입 판단
          const objType = (artwork.objectType || '').toLowerCase();
          artwork.type = (objType.includes('painting') || objType.includes('drawing') || 
                         objType.includes('zeichnung') || objType.includes('gemälde') ||
                         objType.includes('print') || objType.includes('photograph') ||
                         objType.includes('graphic')) ? '2D' : '3D';
          
          artworks.push(artwork);
          artworksMap.set(id, artwork);
          foundCount++;
          processedIds.add(id);
          
          // 메타데이터 완성도 확인
          const hasAllMeta = artwork.objectType && artwork.medium && artwork.dimensions && artwork.artist;
          const metaStatus = hasAllMeta ? '✅' : '⚠️';
          
          log(`[${foundCount}] ${metaStatus} ${artwork.name} by ${artwork.artist} | ${artwork.objectType || 'N/A'}`);
          
          // 진행 상황 저장 (10개마다)
          if (foundCount % 10 === 0) {
            progress.artworks = Array.from(artworksMap.values());
            progress.processedIds = Array.from(processedIds);
            progress.lastId = id;
            saveProgress(progress);
            
            // 출력 파일도 업데이트
            const output = {
              museum: 'Leopold Museum',
              collection: 'Leopold Museum Collection',
              artworks: Array.from(artworksMap.values()),
              total: artworksMap.size,
              scrapedAt: new Date().toISOString()
            };
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
            
            log(`💾 진행 상황 저장: ${artworksMap.size}개 작품 (새로 발견: ${foundCount}개)`);
          }
        } else {
          processedIds.add(id); // 존재하지 않는 ID도 기록하여 재시도 방지
        }
        
        await sleep(500); // 요청 간격
        
      } catch (error) {
        log(`⚠️ 오류 (ID ${id}): ${error.message}`);
        errorCount++;
        await sleep(1000);
      }
      
      // 100개마다 요약 출력
      if ((id - startId + 1) % 100 === 0) {
        log(`📊 진행: ID ${id} | 발견: ${foundCount}개 | 스킵: ${skippedCount}개 | 오류: ${errorCount}개`);
      }
    }
    
    // 최종 저장
    const output = {
      museum: 'Leopold Museum',
      collection: 'Leopold Museum Collection',
      artworks: Array.from(artworksMap.values()),
      total: artworksMap.size,
      scrapedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    log(`\n✅ 완료! 총 ${artworksMap.size}개 작품 저장됨 (새로 발견: ${foundCount}개)`);
    log(`📁 저장 위치: ${OUTPUT_FILE}`);
    
  } catch (error) {
    log(`❌ 오류 발생: ${error.message}`);
    console.error(error);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
