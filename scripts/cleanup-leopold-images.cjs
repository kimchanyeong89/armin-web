/**
 * Leopold Museum 이미지 검증 및 정리
 * 'default.jpg' 이미지를 가진 작품을 재확인하고, 실제 이미지가 없으면 제거
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '../public/data/leopold-museum-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/leopold-museum-parallel-progress.json');

async function main() {
  console.log('🧹 이미지 검증 및 정리 시작...');
  
  const data = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  let artworks = data.artworks || [];
  const totalBefore = artworks.length;
  
  // 1. default.jpg 또는 이미지 없는 항목 식별
  const targets = [];
  const keep = [];
  
  for (const art of artworks) {
    const img = art.image || '';
    if (!img || img.includes('default.jpg') || img.includes('placeholder')) {
      targets.push(art);
    } else {
      keep.push(art);
    }
  }
  
  console.log(`총 작품: ${totalBefore}개`);
  console.log(`정상 이미지: ${keep.length}개`);
  console.log(`재검증 대상 (기본/없음): ${targets.length}개`);
  
  if (targets.length === 0) {
    console.log('정리할 대상이 없습니다.');
    return;
  }
  
  // 2. 재검증 수행
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  let checked = 0;
  let recovered = 0;
  let removed = 0;
  
  for (const art of targets) {
    checked++;
    process.stdout.write(`\r검증 중... ${checked}/${targets.length} (복구: ${recovered}, 삭제: ${removed})`);
    
    try {
      await page.goto(art.originalUrl || art.sourceUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      
      // 이미지 다시 찾기
      const newImg = await page.evaluate(() => {
        // default.jpg가 아닌 이미지 찾기
        const imgs = Array.from(document.querySelectorAll('img'));
        for (const img of imgs) {
          const src = img.src || img.getAttribute('data-src');
          if (src && (src.includes('.jpg') || src.includes('.png')) && 
              !src.includes('default.jpg') && !src.includes('logo') && !src.includes('icon')) {
            return src.startsWith('http') ? src : 'https://onlinecollection.leopoldmuseum.org' + (src.startsWith('/') ? '' : '/') + src;
          }
        }
        return null;
      });
      
      if (newImg) {
        art.image = newImg;
        keep.push(art); // 복구됨
        recovered++;
      } else {
        removed++; // 진짜 없음 -> 제거
      }
      
    } catch (e) {
      removed++; // 접속 실패 -> 제거
    }
    
    // 중간 저장 (안전장치)
    if (checked % 50 === 0) {
      data.artworks = keep.concat(targets.slice(checked)); // 검증된 것 + 남은 것
      data.total = data.artworks.length;
      fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
    }
  }
  
  await browser.close();
  
  // 3. 최종 저장
  // ID 기준으로 정렬
  keep.sort((a, b) => {
    const idA = parseInt(a.id.replace('leopold-', '')) || 0;
    const idB = parseInt(b.id.replace('leopold-', '')) || 0;
    return idA - idB;
  });
  
  data.artworks = keep;
  data.total = keep.length;
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  
  // Progress 파일도 업데이트
  if (fs.existsSync(PROGRESS_FILE)) {
    const progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    progress.artworks = keep;
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  }
  
  console.log(`\n\n✨ 완료!`);
  console.log(`최종 작품 수: ${keep.length}개 (삭제됨: ${removed}개)`);
}

main().catch(console.error);
