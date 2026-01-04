/**
 * Ambrosiana API 이미지 다운로드
 * Playwright 세션으로 API 인증 후 이미지 다운로드
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../public/data/ambrosiana-collection.json');
const OUTPUT_DIR = path.join(__dirname, '../public/images/ambrosiana');

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  // 출력 디렉토리 생성
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const collection = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  console.log(`총 ${collection.objects.length}개 작품`);
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // 세션 초기화
  console.log('세션 초기화...');
  await page.goto('https://www.ambrosiana.it/en/pinacoteca-collections/#/category', {
    waitUntil: 'networkidle',
    timeout: 60000
  });
  await delay(3000);
  
  let updated = 0;
  
  for (let i = 0; i < collection.objects.length; i++) {
    const obj = collection.objects[i];
    const id = obj.id.replace('ambrosiana-', '');
    const localFile = path.join(OUTPUT_DIR, `${id}.jpg`);
    
    // 이미 있으면 스킵
    if (fs.existsSync(localFile) && fs.statSync(localFile).size > 1000) {
      obj.image = `/images/ambrosiana/${id}.jpg`;
      console.log(`[${i+1}/${collection.objects.length}] 스킵: ${obj.title.substring(0, 25)}`);
      updated++;
      continue;
    }
    
    try {
      // 상세 페이지 방문
      await page.goto(obj.url, { waitUntil: 'networkidle', timeout: 30000 });
      await delay(2000);
      
      // 이미지 URL 찾기
      const imageUrl = await page.evaluate(() => {
        // 다양한 이미지 소스 시도
        const img = document.querySelector('img[src*="museum.comwork"], img[src*="comwork"], img.photo, .photo img');
        if (img) return img.src;
        
        // background-image 체크
        const bgElements = document.querySelectorAll('[style*="background-image"]');
        for (const el of bgElements) {
          const style = el.getAttribute('style');
          const match = style.match(/url\(['"]?([^'"]+)['"]?\)/);
          if (match && match[1].includes('comwork')) return match[1];
        }
        
        // OpenSeadragon tile source
        const canvas = document.querySelector('canvas');
        if (canvas) return 'CANVAS';
        
        return null;
      });
      
      if (imageUrl === 'CANVAS') {
        // OpenSeadragon은 canvas 스크린샷
        const canvas = await page.$('canvas');
        if (canvas) {
          await canvas.screenshot({ path: localFile, type: 'jpeg', quality: 90 });
          obj.image = `/images/ambrosiana/${id}.jpg`;
          console.log(`[${i+1}/${collection.objects.length}] ✓ 캔버스: ${obj.title.substring(0, 25)}`);
          updated++;
        }
      } else if (imageUrl) {
        // 이미지 직접 다운로드 (세션 쿠키 사용)
        const response = await page.goto(imageUrl, { timeout: 30000 });
        if (response && response.ok()) {
          const buffer = await response.body();
          fs.writeFileSync(localFile, buffer);
          obj.image = `/images/ambrosiana/${id}.jpg`;
          console.log(`[${i+1}/${collection.objects.length}] ✓ 다운로드: ${obj.title.substring(0, 25)}`);
          updated++;
        }
        // 원래 페이지로 복귀
        await page.goto(obj.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      } else {
        // 뷰어 영역 스크린샷
        const viewer = await page.$('.coMwork-catalog-plugin, .viewer-container, .artwork-image, main');
        if (viewer) {
          await viewer.screenshot({ path: localFile, type: 'jpeg', quality: 90 });
          obj.image = `/images/ambrosiana/${id}.jpg`;
          console.log(`[${i+1}/${collection.objects.length}] ✓ 뷰어: ${obj.title.substring(0, 25)}`);
          updated++;
        } else {
          console.log(`[${i+1}/${collection.objects.length}] ✗ 실패: ${obj.title.substring(0, 25)}`);
        }
      }
      
    } catch (e) {
      console.log(`[${i+1}/${collection.objects.length}] ⚠ 오류: ${e.message.substring(0, 40)}`);
    }
    
    await delay(500);
  }
  
  await browser.close();
  
  // 데이터 저장
  collection.coverImage = collection.objects[0]?.image || '';
  fs.writeFileSync(DATA_FILE, JSON.stringify(collection, null, 2));
  
  console.log(`\n✅ 완료: ${updated}/${collection.objects.length}개`);
}

main().catch(console.error);
