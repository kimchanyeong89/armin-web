/**
 * Leopold Museum Collection - 메타데이터 보완 스크립트
 * 메타데이터가 없는 작품들의 상세 정보를 다시 수집
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '../public/data/leopold-museum-collection-test.json');
const OUTPUT_FILE = path.join(__dirname, '../public/data/leopold-museum-collection-test.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/leopold-museum-enrich-progress.json');
const LOG_FILE = path.join(__dirname, '../downloads/leopold-museum-enrich-run.log');

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
  return { processedUrls: [] };
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

async function main() {
  log('🎨 Leopold Museum Collection - 메타데이터 보완');
  log('='.repeat(60));
  
  // 기존 데이터 로드
  if (!fs.existsSync(INPUT_FILE)) {
    log('❌ 입력 파일이 없습니다: ' + INPUT_FILE);
    return;
  }
  
  const data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  const artworks = data.artworks || [];
  
  // 메타데이터가 없는 작품 찾기
  const missingMeta = artworks.filter(a => !a.objectType && !a.medium);
  log(`\n📊 총 ${artworks.length}개 작품 중 ${missingMeta.length}개 작품의 메타데이터가 없습니다.\n`);
  
  if (missingMeta.length === 0) {
    log('✅ 모든 작품에 메타데이터가 있습니다!');
    return;
  }
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    const progress = loadProgress();
    const processedUrls = new Set(progress.processedUrls || []);
    
    let updated = 0;
    
    for (let i = 0; i < missingMeta.length; i++) {
      const artwork = missingMeta[i];
      const artworkUrl = artwork.sourceUrl || artwork.originalUrl;
      
      if (!artworkUrl) {
        log(`[${i + 1}/${missingMeta.length}] ⚠️ URL 없음: ${artwork.name}`);
        continue;
      }
      
      if (processedUrls.has(artworkUrl)) {
        log(`[${i + 1}/${missingMeta.length}] ⏭️ 이미 처리됨: ${artworkUrl}`);
        continue;
      }
      
      log(`[${i + 1}/${missingMeta.length}] ${artworkUrl}`);
      
      // 상세 페이지에서 메타데이터 수집
      const detailMetadata = await scrapeArtworkDetail(page, artworkUrl);
      
      if (detailMetadata) {
        // 메타데이터 업데이트
        if (detailMetadata.objectType) {
          artwork.objectType = detailMetadata.objectType;
          artwork.category = detailMetadata.objectType;
        }
        if (detailMetadata.medium) artwork.medium = detailMetadata.medium;
        if (detailMetadata.dimensions) artwork.dimension = detailMetadata.dimensions;
        if (detailMetadata.artist) artwork.artist = detailMetadata.artist;
        if (detailMetadata.date) artwork.date = detailMetadata.date;
        if (detailMetadata.description) artwork.description = detailMetadata.description;
        if (detailMetadata.imageUrl && !artwork.image) artwork.image = detailMetadata.imageUrl;
        if (detailMetadata.originalUrl) artwork.originalUrl = detailMetadata.originalUrl;
        
        // 2D/3D 타입 판단
        const objType = (artwork.objectType || '').toLowerCase();
        artwork.type = (objType.includes('painting') || objType.includes('drawing') || 
                       objType.includes('zeichnung') || objType.includes('gemälde') ||
                       objType.includes('print') || objType.includes('photograph')) ? '2D' : '3D';
        
        updated++;
        log(`✅ 업데이트: ${artwork.name} | ${artwork.objectType || 'N/A'} | ${artwork.medium || 'N/A'}`);
      } else {
        log(`⚠️ 메타데이터 추출 실패: ${artwork.name}`);
      }
      
      processedUrls.add(artworkUrl);
      
      // 진행 상황 저장 (5개마다)
      if ((i + 1) % 5 === 0) {
        progress.processedUrls = Array.from(processedUrls);
        saveProgress(progress);
        
        // 전체 데이터 저장
        data.artworks = artworks;
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
        log(`💾 진행 상황 저장: ${updated}개 작품 업데이트됨`);
      }
      
      await sleep(1000);
    }
    
    // 최종 저장
    data.artworks = artworks;
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
    
    const finalWithMeta = artworks.filter(a => a.objectType && a.medium).length;
    log(`\n✅ 완료! ${updated}개 작품 업데이트됨`);
    log(`📊 최종 통계: ${finalWithMeta}/${artworks.length}개 작품에 메타데이터 있음`);
    
  } catch (error) {
    log(`❌ 오류 발생: ${error.message}`);
    console.error(error);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
