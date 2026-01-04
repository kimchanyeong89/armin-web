/**
 * Ambrosiana 이미지 수정 스크립트
 * 
 * 기존 데이터에서 이미지가 없는 항목들의 이미지를 수집
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../public/data/ambrosiana-collection.json');

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  // 기존 데이터 로드
  const collection = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  console.log(`총 ${collection.objects.length}개 작품`);
  
  const needsImage = collection.objects.filter(obj => !obj.image);
  console.log(`이미지 없는 작품: ${needsImage.length}개`);
  
  if (needsImage.length === 0) {
    console.log('모든 작품에 이미지가 있습니다.');
    return;
  }
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // 먼저 메인 페이지에서 모든 이미지를 수집
  console.log('\n📜 메인 페이지에서 이미지 수집 중...');
  await page.goto('https://www.ambrosiana.it/en/pinacoteca-collections/#/category', {
    waitUntil: 'networkidle',
    timeout: 60000
  });
  await delay(10000);  // 충분히 대기
  
  // 끝까지 스크롤
  let lastHeight = 0;
  for (let i = 0; i < 100; i++) {
    await page.evaluate(() => window.scrollBy(0, 3000));
    await delay(1000);
    
    const currentHeight = await page.evaluate(() => document.body.scrollHeight);
    if (currentHeight === lastHeight) {
      console.log(`  스크롤 완료 (${i + 1}회)`);
      break;
    }
    lastHeight = currentHeight;
    
    if (i % 10 === 0) {
      process.stdout.write(`\r  스크롤 ${i + 1}회...`);
    }
  }
  console.log('');
  
  // 모든 카드에서 ID와 이미지 매핑 수집
  const imageMap = await page.evaluate(() => {
    const map = {};
    document.querySelectorAll('.photo-item').forEach(item => {
      const link = item.querySelector('a');
      const img = item.querySelector('img');
      if (link && img && img.src) {
        const href = link.href || '';
        const id = href.split('/').pop();
        if (id) {
          // thumbnail 제거하고 원본 이미지 URL 생성
          map[id] = img.src.replace('/thumbnail', '');
        }
      }
    });
    return map;
  });
  
  console.log(`수집된 이미지 매핑: ${Object.keys(imageMap).length}개`);
  
  // 기존 데이터에 이미지 추가
  let updated = 0;
  for (const obj of collection.objects) {
    if (!obj.image && obj.url) {
      const id = obj.url.split('/').pop();
      if (imageMap[id]) {
        obj.image = imageMap[id];
        updated++;
      }
    }
  }
  
  console.log(`업데이트된 이미지: ${updated}개`);
  
  // 여전히 이미지가 없는 항목은 상세 페이지 방문
  const stillMissing = collection.objects.filter(obj => !obj.image);
  console.log(`여전히 이미지 없음: ${stillMissing.length}개`);
  
  if (stillMissing.length > 0 && stillMissing.length <= 50) {
    console.log('\n📖 상세 페이지에서 이미지 수집 중...');
    
    for (let i = 0; i < stillMissing.length; i++) {
      const obj = stillMissing[i];
      try {
        await page.goto(obj.url, { waitUntil: 'networkidle', timeout: 30000 });
        await delay(3000);
        
        const img = await page.evaluate(() => {
          const images = document.querySelectorAll('img[src*="comwork"], img[src*="museum."]');
          for (const img of images) {
            if (img.src && !img.src.includes('logo')) {
              return img.src.replace('/thumbnail', '');
            }
          }
          return null;
        });
        
        if (img) {
          obj.image = img;
          updated++;
          console.log(`  [${i + 1}/${stillMissing.length}] ✓ ${obj.title.substring(0, 30)}`);
        } else {
          console.log(`  [${i + 1}/${stillMissing.length}] ✗ ${obj.title.substring(0, 30)}`);
        }
      } catch (e) {
        console.log(`  [${i + 1}/${stillMissing.length}] ⚠ ${obj.title.substring(0, 30)}: ${e.message.substring(0, 30)}`);
      }
    }
  }
  
  await browser.close();
  
  // 저장
  collection.coverImage = collection.objects.find(o => o.image)?.image || '';
  fs.writeFileSync(DATA_FILE, JSON.stringify(collection, null, 2));
  
  const finalWithImage = collection.objects.filter(o => o.image).length;
  console.log(`\n✅ 완료: ${finalWithImage}/${collection.objects.length} 이미지`);
}

main().catch(console.error);
