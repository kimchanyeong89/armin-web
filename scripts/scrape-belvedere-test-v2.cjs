/**
 * Belvedere Museum Collection Scraper - Malerei (회화) Collection
 * URL: https://sammlung.belvedere.at/objects/images?filter=classifications%3AMalerei
 * 모든 메타데이터 수집: 제목, 작가, 날짜, 매체, 크기, 오브젝트 타입, 설명, 이미지, 원본 링크
 * 
 * Malerei (회화) 컬렉션 전체 수집 (약 5,700개)
 * 
 * 페이지 구조:
 * - 그리드: .grid-item → .title h2, .displayDate, .primaryMaker, img[alt], img[src]
 * - 상세: 텍스트 패턴 매칭으로 메타데이터 추출
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/belvedere-malerei-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/belvedere-malerei-progress.json');
const LOG_FILE = path.join(__dirname, '../downloads/belvedere-malerei-run.log');

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

async function collectArtworkLinks(page) {
  const artworkLinks = [];
  const seenIds = new Set();
  let currentPage = 1;
  // Malerei (회화) 카테고리 필터 적용
  const BASE_URL = 'https://sammlung.belvedere.at/objects/images?filter=classifications%3AMalerei';
  
  log('🔍 작품 링크 수집 시작 (페이지네이션) - Malerei (회화) 카테고리 전체...');
  
  while (true) {
    // 현재 페이지로 이동
    const pageUrl = currentPage === 1 ? BASE_URL : `${BASE_URL}&page=${currentPage}`;
    log(`📄 페이지 ${currentPage} 로드: ${pageUrl}`);
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
      log(`페이지 ${currentPage}: 작품이 없음, 수집 종료`);
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
    
    log(`페이지 ${currentPage}: ${newItems}개 새 항목 발견 (총 ${artworkLinks.length}개)`);
    
    // 다음 페이지 링크 확인
    const hasNextPage = await page.evaluate(() => {
      const nextLink = document.querySelector('a.next-page-link, a[rel="next"], .emuseum-pager a[href*="page="]');
      return nextLink !== null;
    });
    
    if (!hasNextPage) {
      log('다음 페이지 없음, 수집 종료');
      break;
    }
    
    currentPage++;
  }
  
  log(`✅ 총 ${artworkLinks.length}개 작품 링크 수집 완료`);
  return artworkLinks;
}

async function main() {
  log('🎨 Belvedere Museum Collection Scraper - Malerei (회화) Collection');
  log('='.repeat(60));
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    // 메인 페이지로 이동 (Malerei 필터 적용)
    const mainUrl = 'https://sammlung.belvedere.at/objects/images?filter=classifications%3AMalerei';
    log(`📄 페이지 로드: ${mainUrl} (Malerei 카테고리)`);
    await page.goto(mainUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);
    
    // 작품 링크 수집 (그리드에서 기본 정보 포함)
    const artworkItems = await collectArtworkLinks(page);
    
    if (artworkItems.length === 0) {
      log('❌ 작품 링크를 찾을 수 없습니다');
      return;
    }
    
    log(`\n📊 상세 정보 수집 시작 (${artworkItems.length}개)...`);
    
    const artworks = [];
    const processedIds = new Set();
    
    for (let i = 0; i < artworkItems.length; i++) {
      const item = artworkItems[i];
      
      if (processedIds.has(item.id)) {
        log(`⏭️ 중복 스킵: ${item.url}`);
        continue;
      }
      processedIds.add(item.id);
      
      log(`\n[${i + 1}/${artworkItems.length}] ${item.url}`);
      
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
        category: '',
        objectType: '',
        type: '3D'
      };
      
      // 상세 페이지에서 추가 메타데이터 수집 (medium, dimensions, objectType만)
      const detailMetadata = await scrapeArtworkDetail(page, item.url);
      if (detailMetadata) {
        // 그리드에서 이미 가져온 artist, date는 그대로 사용
        if (detailMetadata.medium) artwork.medium = detailMetadata.medium;
        if (detailMetadata.dimensions) artwork.dimension = detailMetadata.dimensions;
        if (detailMetadata.objectType) {
          artwork.objectType = detailMetadata.objectType;
          artwork.category = detailMetadata.objectType;
        }
        if (detailMetadata.imageUrl) artwork.image = detailMetadata.imageUrl;
        if (detailMetadata.originalUrl) artwork.originalUrl = detailMetadata.originalUrl;
        
        // 2D/3D 타입 판단
        const objType = (artwork.objectType || '').toLowerCase();
        artwork.type = (objType.includes('painting') || objType.includes('gemälde') || objType.includes('malerei') || objType.includes('drawing') || objType.includes('zeichnung')) ? '2D' : '3D';
      }
      
      artworks.push(artwork);
      log(`✅ 수집 완료: ${artwork.name} by ${artwork.artist} | ${artwork.objectType || 'N/A'}`);
      
      // 진행 상황 저장
      if ((i + 1) % 10 === 0) {
        const progress = {
          artworks: artworks,
          processedIds: Array.from(processedIds),
          lastIndex: i + 1,
          totalLinks: artworkItems.length
        };
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
        log(`💾 진행 상황 저장: ${artworks.length}개 작품 수집됨`);
      }
      
      await sleep(1000);
    }
    
    // 최종 저장
    const output = {
      museum: 'Belvedere Museum',
      collection: 'Malerei (Paintings)',
      artworks: artworks,
      total: artworks.length,
      scrapedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    log(`\n✅ 완료! ${artworks.length}개 작품 저장됨: ${OUTPUT_FILE}`);
    
  } catch (error) {
    log(`❌ 오류 발생: ${error.message}`);
    console.error(error);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
