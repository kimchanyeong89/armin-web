/**
 * Belvedere Museum Collection Scraper - Full Collection
 * Categories: Malerei, Zeichenkunst, Film/Videokunst
 * URL: https://sammlung.belvedere.at/objects/images?filter=classifications%3A[CATEGORY]
 * 모든 메타데이터 수집: 제목, 작가, 날짜, 매체, 크기, 오브젝트 타입, 설명, 이미지, 원본 링크
 * 
 * 전체 컬렉션 수집 (Malerei ~5,700개 + Zeichenkunst + Film/Videokunst)
 * 
 * 페이지 구조:
 * - 그리드: .grid-item → .title h2, .displayDate, .primaryMaker, img[alt], img[src]
 * - 상세: 텍스트 패턴 매칭으로 메타데이터 추출
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/belvedere-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/belvedere-full-progress.json');
const LOG_FILE = path.join(__dirname, '../downloads/belvedere-full-run.log');

// 카테고리 정의
const CATEGORIES = [
  { name: 'Malerei', filter: 'classifications%3AMalerei', count: 5643 },
  { name: 'Zeichenkunst', filter: 'classifications%3AZeichenkunst', count: 3503 },
  { name: 'Film/Videokunst', filter: 'classifications%3AFilm%252FVideokunst', count: 117 }
];

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
  return { categories: {}, allArtworks: [] };
}

function saveProgress(progress) {
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  } catch (e) {
    log(`⚠️ Progress 파일 저장 오류: ${e.message}`);
  }
}

async function scrapeArtworkDetail(page, artworkUrl) {
  try {
    await page.goto(artworkUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);

    // 메타데이터 추출 (텍스트 패턴 매칭)
    const metadata = await page.evaluate(() => {
      const data = {};
      data.originalUrl = window.location.href;
      
      // 제목
      const h1 = document.querySelector('h1');
      if (h1) data.title = h1.textContent.trim();
      
      // 전체 텍스트
      const bodyText = document.body.textContent || '';
      
      // 패턴 매칭으로 메타데이터 추출
      // 텍스트 구조: "Object typeGemäldeMediumÖl auf LeinwandDimensions60 x 80 cmSignature..."
      // indexOf를 사용하여 정확히 추출
      
      const objTypeIdx = bodyText.indexOf('Object type');
      if (objTypeIdx !== -1) {
        const afterObjType = bodyText.substring(objTypeIdx + 11); // "Object type" 길이
        const mediumIdx = afterObjType.indexOf('Medium');
        const dimensionsIdx = afterObjType.indexOf('Dimensions', mediumIdx);
        const signatureIdx = afterObjType.indexOf('Signature', dimensionsIdx);
        const inventoryIdx = afterObjType.indexOf('Inventory', dimensionsIdx);
        const endIdx = signatureIdx !== -1 && inventoryIdx !== -1 
          ? Math.min(signatureIdx, inventoryIdx)
          : (signatureIdx !== -1 ? signatureIdx : inventoryIdx);
        
        // Object type
        if (mediumIdx !== -1) {
          data.objectType = afterObjType.substring(0, mediumIdx).trim();
        }
        
        // Medium
        if (mediumIdx !== -1 && dimensionsIdx !== -1) {
          data.medium = afterObjType.substring(mediumIdx + 6, dimensionsIdx).trim(); // "Medium" 길이 6
        }
        
        // Dimensions
        if (dimensionsIdx !== -1 && endIdx !== -1) {
          let dim = afterObjType.substring(dimensionsIdx + 10, endIdx).trim(); // "Dimensions" 길이 10
          // 끝의 불필요한 문자 제거
          dim = dim.replace(/\s+$/, '').trim();
          data.dimensions = dim;
        }
      }
      
      // 이미지
      const imgEl = document.querySelector('img[src*="/internal/media/dispatcher/"], img[src*="/media/"], .object-image img, .main-image img');
      if (imgEl) {
        let imgSrc = imgEl.src || imgEl.getAttribute('data-src') || '';
        // 상대 경로를 절대 경로로 변환
        if (imgSrc.startsWith('/')) {
          imgSrc = 'https://sammlung.belvedere.at' + imgSrc;
        }
        data.imageUrl = imgSrc;
      }
      
      return data;
    });

    return metadata;
  } catch (error) {
    log(`⚠️ 상세 페이지 스크래핑 오류 (${artworkUrl}): ${error.message}`);
    return null;
  }
}

async function collectArtworkLinks(page, category) {
  const artworkLinks = [];
  const seenIds = new Set();
  let currentPage = 1;
  const BASE_URL = `https://sammlung.belvedere.at/objects/images?filter=${category.filter}`;
  
  log(`🔍 [${category.name}] 작품 링크 수집 시작 (페이지네이션)...`);
  
  while (true) {
    // 현재 페이지로 이동
    const pageUrl = currentPage === 1 ? BASE_URL : `${BASE_URL}&page=${currentPage}`;
    log(`📄 [${category.name}] 페이지 ${currentPage} 로드`);
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    
    // 그리드 아이템에서 링크 수집
    const items = await page.evaluate(() => {
      const gridItems = Array.from(document.querySelectorAll('.grid-item'));
      return gridItems.map(item => {
        const linkEl = item.querySelector('a[href*="/objects/"]');
        if (!linkEl) return null;
        const href = linkEl.href;
        const match = href.match(/\/objects\/(\d+)\//);
        if (!match) return null;
        
        return {
          id: match[1],
          url: href.split(';')[0].split('?')[0], // jsessionid와 쿼리 파라미터 제거
          title: item.querySelector('.title h2')?.textContent?.trim() || '',
          date: item.querySelector('.displayDate')?.textContent?.trim() || '',
          artist: item.querySelector('.primaryMaker')?.textContent?.trim() || '',
          imgSrc: item.querySelector('img')?.src || ''
        };
      }).filter(item => item !== null);
    });
    
    if (items.length === 0) {
      log(`[${category.name}] 페이지 ${currentPage}: 작품이 없음, 수집 종료`);
      break;
    }
    
    // 새로운 항목만 추가
    let newItems = 0;
    for (const item of items) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        artworkLinks.push(item);
        newItems++;
      }
    }
    
    log(`[${category.name}] 페이지 ${currentPage}: ${newItems}개 새 항목 발견 (총 ${artworkLinks.length}개)`);
    
    // 다음 페이지 링크 확인
    const hasNextPage = await page.evaluate(() => {
      const nextLink = document.querySelector('a.next-page-link, a[rel="next"], .emuseum-pager a[href*="page="]');
      return nextLink !== null;
    });
    
    if (!hasNextPage) {
      log(`[${category.name}] 다음 페이지 없음, 수집 종료`);
      break;
    }
    
    currentPage++;
  }
  
  log(`✅ [${category.name}] 총 ${artworkLinks.length}개 작품 링크 수집 완료`);
  return artworkLinks;
}

async function scrapeCategory(page, category, progress) {
  log(`\n${'='.repeat(60)}`);
  log(`🎨 [${category.name}] 카테고리 수집 시작`);
  log(`${'='.repeat(60)}\n`);
  
  const categoryProgress = progress.categories[category.name] || { artworks: [], processedIds: [], lastIndex: 0 };
  const processedIds = new Set(categoryProgress.processedIds || []);
  
  // 작품 링크 수집
  const artworkItems = await collectArtworkLinks(page, category);
  
  if (artworkItems.length === 0) {
    log(`❌ [${category.name}] 작품 링크를 찾을 수 없습니다`);
    return [];
  }
  
  log(`\n📊 [${category.name}] 상세 정보 수집 시작 (${artworkItems.length}개)...\n`);
  
  const artworks = categoryProgress.artworks || [];
  let startIndex = categoryProgress.lastIndex || 0;
  
  for (let i = startIndex; i < artworkItems.length; i++) {
    const item = artworkItems[i];
    
    if (processedIds.has(item.id)) {
      log(`⏭️ [${category.name}] 중복 스킵: ${item.url}`);
      continue;
    }
    processedIds.add(item.id);
    
    log(`[${category.name}] [${i + 1}/${artworkItems.length}] ${item.url}`);
    
    // 그리드에서 이미 수집한 기본 정보 사용
    let artwork = {
      id: `belvedere-${item.id}`,
      name: item.title,
      artist: item.artist || 'Unknown',
      year: parseInt(item.date.match(/\d{4}/)?.[0]) || 0,
      date: item.date,
      image: item.imgSrc ? (item.imgSrc.startsWith('/') ? 'https://sammlung.belvedere.at' + item.imgSrc : item.imgSrc) : '',
      sourceUrl: item.url,
      originalUrl: item.url,
      exhibitionName: 'Belvedere Museum',
      exhibitionTitle: 'Belvedere Collection',
      description: '',
      medium: '',
      dimension: '',
      category: category.name,
      objectType: '',
      type: '2D'
    };
    
    // 상세 페이지에서 추가 메타데이터 수집
    const detailMetadata = await scrapeArtworkDetail(page, item.url);
    if (detailMetadata) {
      if (detailMetadata.medium) artwork.medium = detailMetadata.medium;
      if (detailMetadata.dimensions) artwork.dimension = detailMetadata.dimensions;
      if (detailMetadata.objectType) {
        artwork.objectType = detailMetadata.objectType;
      }
      if (detailMetadata.imageUrl) artwork.image = detailMetadata.imageUrl;
      if (detailMetadata.originalUrl) artwork.originalUrl = detailMetadata.originalUrl;
      
      // 2D/3D 타입 판단
      const objType = (artwork.objectType || '').toLowerCase();
      artwork.type = (objType.includes('painting') || objType.includes('gemälde') || 
                      objType.includes('malerei') || objType.includes('drawing') || 
                      objType.includes('zeichnung') || objType.includes('film') || 
                      objType.includes('video')) ? '2D' : '3D';
    }
    
    artworks.push(artwork);
    log(`✅ [${category.name}] 수집 완료: ${artwork.name} by ${artwork.artist} | ${artwork.objectType || 'N/A'}`);
    
    // 진행 상황 저장 (10개마다)
    if ((i + 1) % 10 === 0) {
      progress.categories[category.name] = {
        artworks: artworks,
        processedIds: Array.from(processedIds),
        lastIndex: i + 1,
        totalLinks: artworkItems.length
      };
      saveProgress(progress);
      log(`💾 [${category.name}] 진행 상황 저장: ${artworks.length}개 작품 수집됨`);
    }
    
    await sleep(1000);
  }
  
  // 카테고리 완료 저장
  progress.categories[category.name] = {
    artworks: artworks,
    processedIds: Array.from(processedIds),
    lastIndex: artworkItems.length,
    totalLinks: artworkItems.length,
    completed: true
  };
  saveProgress(progress);
  
  log(`\n✅ [${category.name}] 완료! ${artworks.length}개 작품 수집됨\n`);
  return artworks;
}

async function main() {
  log('🎨 Belvedere Museum Collection Scraper - Full Collection');
  log('='.repeat(60));
  log('카테고리: Malerei, Zeichenkunst, Film/Videokunst');
  log('='.repeat(60));
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    const progress = loadProgress();
    const allArtworks = [];
    
    // 각 카테고리 수집
    for (const category of CATEGORIES) {
      const categoryArtworks = await scrapeCategory(page, category, progress);
      allArtworks.push(...categoryArtworks);
      
      // 전체 진행 상황 업데이트
      progress.allArtworks = allArtworks;
      saveProgress(progress);
    }
    
    // 최종 저장
    const output = {
      museum: 'Belvedere Museum',
      collection: 'Belvedere Collection',
      artworks: allArtworks,
      total: allArtworks.length,
      categories: CATEGORIES.map(c => ({
        name: c.name,
        count: progress.categories[c.name]?.artworks?.length || 0
      })),
      scrapedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    log(`\n✅ 전체 완료! 총 ${allArtworks.length}개 작품 저장됨: ${OUTPUT_FILE}`);
    log(`   - Malerei: ${progress.categories['Malerei']?.artworks?.length || 0}개`);
    log(`   - Zeichenkunst: ${progress.categories['Zeichenkunst']?.artworks?.length || 0}개`);
    log(`   - Film/Videokunst: ${progress.categories['Film/Videokunst']?.artworks?.length || 0}개`);
    
  } catch (error) {
    log(`❌ 오류 발생: ${error.message}`);
    console.error(error);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
