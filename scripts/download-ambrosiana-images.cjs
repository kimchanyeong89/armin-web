/**
 * Ambrosiana 이미지 다운로드 및 R2 업로드
 * 
 * museum.comwork.eu API는 인증이 필요하므로 
 * Playwright로 이미지를 캡처해서 R2에 업로드
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DATA_FILE = path.join(__dirname, '../public/data/ambrosiana-collection.json');
const IMAGE_DIR = path.join(__dirname, '../temp-ambrosiana-images');
const R2_BUCKET = 'armin-atlas';
const R2_PREFIX = 'ambrosiana';

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  // 이미지 디렉토리 생성
  if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
  }
  
  // 데이터 로드
  const collection = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  console.log(`총 ${collection.objects.length}개 작품`);
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // 메인 페이지 방문하여 세션 초기화
  console.log('세션 초기화 중...');
  await page.goto('https://www.ambrosiana.it/en/pinacoteca-collections/#/category', {
    waitUntil: 'networkidle',
    timeout: 60000
  });
  await delay(5000);
  
  let updated = 0;
  
  for (let i = 0; i < collection.objects.length; i++) {
    const obj = collection.objects[i];
    const id = obj.id.replace('ambrosiana-', '');
    const imageFile = path.join(IMAGE_DIR, `${id}.jpg`);
    
    // 이미 다운로드된 경우 스킵
    if (fs.existsSync(imageFile)) {
      console.log(`[${i + 1}/${collection.objects.length}] 스킵 (이미 있음): ${obj.title.substring(0, 30)}`);
      continue;
    }
    
    try {
      // 상세 페이지 방문
      await page.goto(obj.url, { waitUntil: 'networkidle', timeout: 30000 });
      await delay(3000);
      
      // 이미지 요소 찾기 및 스크린샷
      const imgElement = await page.$('canvas, .openseadragon-canvas, img[src*="comwork"], img[src*="museum"]');
      
      if (imgElement) {
        // 이미지 영역 스크린샷
        await imgElement.screenshot({ path: imageFile, type: 'jpeg', quality: 85 });
        console.log(`[${i + 1}/${collection.objects.length}] ✓ 캡처: ${obj.title.substring(0, 30)}`);
        updated++;
      } else {
        // 전체 뷰어 영역 스크린샷 시도
        const viewerArea = await page.$('.coMwork-catalog-plugin, .viewer-container, main');
        if (viewerArea) {
          await viewerArea.screenshot({ path: imageFile, type: 'jpeg', quality: 85 });
          console.log(`[${i + 1}/${collection.objects.length}] ✓ 뷰어 캡처: ${obj.title.substring(0, 30)}`);
          updated++;
        } else {
          console.log(`[${i + 1}/${collection.objects.length}] ✗ 이미지 없음: ${obj.title.substring(0, 30)}`);
        }
      }
      
    } catch (e) {
      console.log(`[${i + 1}/${collection.objects.length}] ⚠ 오류: ${e.message.substring(0, 40)}`);
    }
    
    await delay(500);
  }
  
  await browser.close();
  
  // R2에 업로드
  console.log('\n📤 R2 업로드 중...');
  const files = fs.readdirSync(IMAGE_DIR).filter(f => f.endsWith('.jpg'));
  
  for (const file of files) {
    const localPath = path.join(IMAGE_DIR, file);
    const r2Key = `${R2_PREFIX}/${file}`;
    
    try {
      execSync(`npx wrangler r2 object put ${R2_BUCKET}/${r2Key} --file="${localPath}" --content-type="image/jpeg"`, {
        stdio: 'pipe'
      });
      console.log(`  ✓ ${file}`);
    } catch (e) {
      console.log(`  ✗ ${file}: ${e.message.substring(0, 30)}`);
    }
  }
  
  // JSON 데이터 업데이트 (R2 URL로)
  console.log('\n📝 JSON 업데이트...');
  for (const obj of collection.objects) {
    const id = obj.id.replace('ambrosiana-', '');
    const r2Url = `https://pub-8da64319007a4d5c8bc904caaffe9d65.r2.dev/${R2_PREFIX}/${id}.jpg`;
    obj.image = r2Url;
  }
  
  collection.coverImage = collection.objects[0]?.image || '';
  fs.writeFileSync(DATA_FILE, JSON.stringify(collection, null, 2));
  
  console.log(`\n✅ 완료: ${updated}개 이미지 처리`);
}

main().catch(console.error);
