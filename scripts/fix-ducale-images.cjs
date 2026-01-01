#!/usr/bin/env node
/**
 * Palazzo Ducale - 이미지 URL 수정
 * viewer URL을 실제 이미지 URL로 교체
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../public/data/palazzo-ducale-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/ducale-fix-progress.json');

const TEST_MODE = process.argv.includes('--test');
const MAX_ITEMS_TEST = 10;
const BATCH_SIZE = 20;

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch {
    return { processed: {} };
  }
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function main() {
  console.log('🏛️ Palazzo Ducale - 이미지 URL 수정\n');
  
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const progress = loadProgress();
  
  // 수정이 필요한 작품 찾기 (viewer URL 사용하거나, ../../ 패턴이 있는 것들)
  const itemsToFix = [];
  data.artworks.forEach((art, idx) => {
    if (progress.processed[art.inventoryId]) return;
    // viewer URL 또는 잘못된 ../../ 패턴
    const needsFix = art.image && (
      art.image.includes('/viewer/OA/') || 
      art.image.includes('../../')
    );
    if (needsFix) {
      itemsToFix.push({ idx, art });
    }
  });
  
  console.log(`📋 수정 필요: ${itemsToFix.length}개`);
  
  if (itemsToFix.length === 0) {
    console.log('✅ 모든 이미지가 수정되었습니다.');
    return;
  }
  
  const toProcess = TEST_MODE ? itemsToFix.slice(0, MAX_ITEMS_TEST) : itemsToFix;
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    viewport: { width: 1400, height: 900 },
  });
  
  const page = await context.newPage();
  let fixed = 0;
  let noImage = 0;
  let artistFixed = 0;
  
  try {
    for (let i = 0; i < toProcess.length; i++) {
      const { idx, art } = toProcess[i];
      
      if ((i + 1) % 20 === 1 || i === 0) {
        console.log(`\n[${i + 1}/${toProcess.length}] 처리 중... (수정: ${fixed}, 이미지없음: ${noImage})`);
      }
      
      try {
        await page.goto(art.sourceUrl, { waitUntil: 'networkidle', timeout: 20000 });
        await delay(1000);
        
        const result = await page.evaluate(() => {
          const data = { image: '', artist: '' };
          
          // 이미지 추출 - ThumbJpeg 우선, 없으면 ThumbGif
          const jpegImgs = document.querySelectorAll('img[src*="ThumbJpeg"]');
          if (jpegImgs.length > 0) {
            let src = jpegImgs[0].getAttribute('src') || '';
            if (src.startsWith('../')) {
              src = '/sicap/' + src.replace(/^\.\.\/+/g, '');
            } else if (!src.startsWith('/') && !src.startsWith('http')) {
              src = '/sicap/' + src;
            }
            data.image = src;
          } else {
            const gifImgs = document.querySelectorAll('img[src*="ThumbGif"]');
            for (const img of gifImgs) {
              const src = img.getAttribute('src') || '';
              if (src.includes('FileName=') && !src.includes('CSSImage')) {
                let fixedSrc = src;
                if (src.startsWith('../')) {
                  fixedSrc = '/sicap/' + src.replace(/^\.\.\/+/g, '');
                } else if (!src.startsWith('/') && !src.startsWith('http')) {
                  fixedSrc = '/sicap/' + src;
                }
                data.image = fixedSrc;
                break;
              }
            }
          }
          
          // Author 추출 시도 (테이블에서)
          const tables = document.querySelectorAll('table');
          for (const table of tables) {
            const rows = table.querySelectorAll('tr');
            for (const row of rows) {
              const cells = row.querySelectorAll('td');
              for (let i = 0; i < cells.length - 1; i++) {
                const label = cells[i].textContent?.toLowerCase() || '';
                if (label.includes('author') || label.includes('autore')) {
                  const value = cells[i + 1].textContent?.trim();
                  if (value && value !== 'Unknown' && value.length > 1) {
                    data.artist = value;
                  }
                }
              }
            }
          }
          
          return data;
        });
        
        if (result.image) {
          // 전체 URL로 변환 - ../../ 패턴 정리
          let cleanUrl = result.image;
          // Remove ../ patterns and normalize
          cleanUrl = cleanUrl.replace(/\.\.\/+/g, '');
          if (!cleanUrl.startsWith('/')) {
            cleanUrl = '/' + cleanUrl;
          }
          if (!cleanUrl.startsWith('/sicap')) {
            cleanUrl = '/sicap' + cleanUrl;
          }
          const fullUrl = 'https://www.archiviodellacomunicazione.it' + cleanUrl;
          data.artworks[idx].image = fullUrl;
          fixed++;
        } else {
          noImage++;
        }
        
        // Artist 업데이트 (기존이 Unknown인 경우만, "AUTHOR" 같은 라벨 제외)
        if (result.artist && 
            data.artworks[idx].artist === 'Unknown' && 
            result.artist.toLowerCase() !== 'author' &&
            result.artist.toLowerCase() !== 'autore' &&
            result.artist.length > 2) {
          data.artworks[idx].artist = result.artist;
          artistFixed++;
        }
        
        progress.processed[art.inventoryId] = { success: true, image: result.image, artist: result.artist };
        
      } catch (err) {
        progress.processed[art.inventoryId] = { success: false, error: err.message.substring(0, 50) };
      }
      
      // 배치마다 저장
      if ((i + 1) % BATCH_SIZE === 0) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        saveProgress(progress);
      }
      
      await delay(300);
    }
    
  } catch (err) {
    console.error('오류:', err.message);
  } finally {
    await browser.close();
  }
  
  // 최종 저장
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  saveProgress(progress);
  
  console.log('\n' + '='.repeat(50));
  console.log(`✅ 완료! 이미지 ${fixed}개 수정, ${artistFixed}개 작가 수정, ${noImage}개 이미지없음`);
}

main().catch(console.error);
