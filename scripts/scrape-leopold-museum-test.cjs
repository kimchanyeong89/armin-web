/**
 * Leopold Museum Collection Scraper - Test (100 items)
 * URL: https://onlinecollection.leopoldmuseum.org/en/search/?offset=0&limit=30&layout=default
 * 모든 메타데이터 수집: 제목, 작가, 날짜, 매체, 크기, 오브젝트 타입, 설명, 이미지, 원본 링크
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/leopold-museum-collection-test.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/leopold-museum-test-progress.json');
const LOG_FILE = path.join(__dirname, '../downloads/leopold-museum-test-run.log');

const TEST_LIMIT = 100;

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
  return { artworks: [], processedUrls: [], lastOffset: 0 };
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
    await page.goto(artworkUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(2000);

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
    log(`⚠️ 상세 페이지 스크래핑 오류 (${artworkUrl}): ${error.message}`);
    return null;
  }
}

async function collectArtworkLinks(page) {
  const artworkLinks = [];
  const seenUrls = new Set();
  
  log('🔍 작품 링크 수집 시작...');
  
  // limit을 100으로 설정하여 한 번에 더 많은 항목 가져오기
  const limit = 100;
  const BASE_URL = 'https://onlinecollection.leopoldmuseum.org/en/search/';
  
  await page.goto(`${BASE_URL}?offset=0&limit=${limit}&layout=default`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(5000);
  
  const items = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/en/object/"]'));
    const seenUrls = new Set();
    const results = [];
    
    for (const link of links) {
      const href = link.href;
      const cleanUrl = href.split('?')[0]; // 쿼리 파라미터 제거
      
      if (seenUrls.has(cleanUrl)) continue;
      seenUrls.add(cleanUrl);
      
      // 링크 텍스트에서 제목, 날짜, 작가 추출 (예: "Seated Youth (In the Morning) 1919 Anton Kolig")
      const linkTextContent = link.textContent?.trim() || '';
      const parts = linkTextContent.split(/\s+(\d{4})\s+/); // 날짜로 분리
      let extractedTitle = linkTextContent;
      let extractedDate = '';
      let extractedArtist = '';
      
      if (parts.length >= 3) {
        extractedTitle = parts[0].trim();
        extractedDate = parts[1];
        extractedArtist = parts.slice(2).join(' ').trim();
      } else {
        // 날짜가 없는 경우
        const byMatch = linkTextContent.match(/^(.+?)\s+by\s+(.+)$/i);
        if (byMatch) {
          extractedTitle = byMatch[1].trim();
          extractedArtist = byMatch[2].trim();
        }
      }
      
      results.push({
        url: cleanUrl,
        title: extractedTitle,
        artist: extractedArtist,
        date: extractedDate,
        imgSrc: ''
      });
    }
    
    return results;
  });
  
  // 100개 제한
  const limitedItems = items.slice(0, TEST_LIMIT);
  
  log(`✅ 총 ${limitedItems.length}개 작품 링크 수집 완료`);
  return limitedItems;
}

async function main() {
  log('🎨 Leopold Museum Collection Scraper - Test (100 items)');
  log('='.repeat(60));
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    const progress = loadProgress();
    const processedUrls = new Set(progress.processedUrls || []);
    
    // 작품 링크 수집
    const artworkItems = await collectArtworkLinks(page);
    
    if (artworkItems.length === 0) {
      log('❌ 작품 링크를 찾을 수 없습니다');
      return;
    }
    
    log(`\n📊 상세 정보 수집 시작 (${artworkItems.length}개)...\n`);
    
    const artworks = progress.artworks || [];
    let startIndex = artworks.length;
    
    for (let i = startIndex; i < artworkItems.length; i++) {
      const item = artworkItems[i];
      
      if (processedUrls.has(item.url)) {
        log(`⏭️ 중복 스킵: ${item.url}`);
        continue;
      }
      processedUrls.add(item.url);
      
      log(`[${i + 1}/${artworkItems.length}] ${item.url}`);
      
      // 기본 정보
      let artwork = {
        id: `leopold-${item.url.match(/\/object\/([^\/]+)/)?.[1] || i}`,
        name: item.title || 'Untitled',
        artist: item.artist || 'Unknown',
        year: parseInt(item.date?.match(/\d{4}/)?.[0]) || 0,
        date: item.date || '',
        image: item.imgSrc ? (item.imgSrc.startsWith('/') ? 'https://onlinecollection.leopoldmuseum.org' + item.imgSrc : item.imgSrc) : '',
        sourceUrl: item.url,
        originalUrl: item.url,
        exhibitionName: 'Leopold Museum',
        exhibitionTitle: 'Leopold Museum Collection',
        description: '',
        medium: '',
        dimension: '',
        category: '',
        objectType: '',
        type: '2D'
      };
      
      // 상세 페이지에서 추가 메타데이터 수집
      const detailMetadata = await scrapeArtworkDetail(page, item.url);
      if (detailMetadata) {
        if (detailMetadata.title) artwork.name = detailMetadata.title;
        if (detailMetadata.artist) artwork.artist = detailMetadata.artist;
        if (detailMetadata.date) artwork.date = detailMetadata.date;
        if (detailMetadata.medium) artwork.medium = detailMetadata.medium;
        if (detailMetadata.dimensions) artwork.dimension = detailMetadata.dimensions;
        if (detailMetadata.objectType) {
          artwork.objectType = detailMetadata.objectType;
          artwork.category = detailMetadata.objectType;
        }
        if (detailMetadata.description) artwork.description = detailMetadata.description;
        if (detailMetadata.imageUrl) artwork.image = detailMetadata.imageUrl;
        if (detailMetadata.originalUrl) artwork.originalUrl = detailMetadata.originalUrl;
        
        // 2D/3D 타입 판단
        const objType = (artwork.objectType || '').toLowerCase();
        artwork.type = (objType.includes('painting') || objType.includes('drawing') || 
                       objType.includes('zeichnung') || objType.includes('gemälde') ||
                       objType.includes('print') || objType.includes('photograph')) ? '2D' : '3D';
      }
      
      artworks.push(artwork);
      log(`✅ 수집 완료: ${artwork.name} by ${artwork.artist} | ${artwork.objectType || 'N/A'}`);
      
      // 진행 상황 저장 (10개마다)
      if ((i + 1) % 10 === 0) {
        progress.artworks = artworks;
        progress.processedUrls = Array.from(processedUrls);
        progress.lastOffset = i + 1;
        saveProgress(progress);
        log(`💾 진행 상황 저장: ${artworks.length}개 작품 수집됨`);
      }
      
      await sleep(1000);
    }
    
    // 최종 저장
    const output = {
      museum: 'Leopold Museum',
      collection: 'Leopold Museum Collection',
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
