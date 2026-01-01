/**
 * 샤갈 미술관 플레이스홀더 이미지 수정
 * - 삭제 없이 이미지 URL만 수정
 * - 실패 시 재시도 (최대 3회)
 * - 모든 플레이스홀더를 고칠 때까지 반복
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../public/data/musee-chagall-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/chagall-fix-progress.json');
const LOG_FILE = path.join(__dirname, '../logs/chagall-fix.log');

const PARALLEL_PAGES = 5;
const DELAY_BETWEEN_BATCHES = 2000;
const MAX_RETRIES = 3;

function log(msg) {
  const timestamp = new Date().toLocaleTimeString('ko-KR');
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch (e) {}
  return { fixed: {}, failed: {}, noImage: {} };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function fetchImageUrl(page, sourceUrl, retries = 0) {
  try {
    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // og:image 메타 태그에서 이미지 URL 추출
    const ogImage = await page.$eval('meta[property="og:image"]', el => el.content).catch(() => null);
    
    if (ogImage && ogImage.includes('?ID=')) {
      return { success: true, url: ogImage };
    }
    
    // 대체 방법: 이미지 태그에서 직접 추출
    const imgUrl = await page.evaluate(() => {
      const img = document.querySelector('.notice-image img, .media-image img, img[src*="thumb.php"]');
      return img ? img.src : null;
    });
    
    if (imgUrl && imgUrl.includes('?ID=')) {
      return { success: true, url: imgUrl };
    }
    
    // 이미지를 찾을 수 없음
    return { success: false, reason: 'NO_IMAGE_FOUND' };
    
  } catch (error) {
    if (retries < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, 2000));
      return fetchImageUrl(page, sourceUrl, retries + 1);
    }
    return { success: false, reason: 'FETCH_FAILED', error: error.message };
  }
}

async function main() {
  // 로그 파일 초기화
  fs.writeFileSync(LOG_FILE, `=== 샤갈 플레이스홀더 수정 시작: ${new Date().toISOString()} ===\n`);
  
  // 데이터 로드
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const originalCount = data.objects.length;
  log(`총 작품 수: ${originalCount}`);
  
  // 플레이스홀더 찾기
  const placeholderIndices = [];
  data.objects.forEach((obj, idx) => {
    const img = obj.image || '';
    if (/eJx/.test(img)) {
      placeholderIndices.push(idx);
    }
  });
  
  log(`플레이스홀더 이미지: ${placeholderIndices.length}개`);
  
  if (placeholderIndices.length === 0) {
    log('모든 이미지가 유효합니다!');
    return;
  }
  
  // 진행 상황 로드
  const progress = loadProgress();
  const alreadyProcessed = new Set([
    ...Object.keys(progress.fixed),
    ...Object.keys(progress.noImage)
  ]);
  
  // 아직 처리되지 않은 항목 필터링
  const toProcess = placeholderIndices.filter(idx => {
    const id = data.objects[idx].id;
    return !alreadyProcessed.has(id);
  });
  
  log(`이미 처리됨: ${alreadyProcessed.size}개`);
  log(`처리 필요: ${toProcess.length}개`);
  
  if (toProcess.length === 0) {
    log('모든 플레이스홀더가 이미 처리되었습니다.');
    return;
  }
  
  // 브라우저 시작
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  // 쿠키 수락 (첫 페이지에서)
  const initPage = await context.newPage();
  try {
    await initPage.goto('https://images.grandpalaisrmn.fr', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await initPage.click('button:has-text("Accepter"), .accept-cookies, #didomi-notice-agree-button').catch(() => {});
    await new Promise(r => setTimeout(r, 1000));
  } catch (e) {}
  await initPage.close();
  
  let fixed = Object.keys(progress.fixed).length;
  let noImage = Object.keys(progress.noImage).length;
  let failed = 0;
  
  // 배치 처리
  for (let i = 0; i < toProcess.length; i += PARALLEL_PAGES) {
    const batch = toProcess.slice(i, i + PARALLEL_PAGES);
    
    const pages = await Promise.all(batch.map(() => context.newPage()));
    
    const results = await Promise.all(batch.map(async (idx, j) => {
      const obj = data.objects[idx];
      const page = pages[j];
      
      try {
        const result = await fetchImageUrl(page, obj.sourceUrl);
        return { idx, obj, result };
      } catch (e) {
        return { idx, obj, result: { success: false, reason: 'ERROR', error: e.message } };
      }
    }));
    
    // 결과 처리
    for (const { idx, obj, result } of results) {
      if (result.success) {
        // 이미지 수정
        data.objects[idx].image = result.url;
        if (data.objects[idx].highResImage) {
          data.objects[idx].highResImage = result.url;
        }
        progress.fixed[obj.id] = result.url;
        fixed++;
      } else if (result.reason === 'NO_IMAGE_FOUND') {
        progress.noImage[obj.id] = true;
        noImage++;
      } else {
        progress.failed[obj.id] = result.error || result.reason;
        failed++;
      }
    }
    
    // 페이지 닫기
    await Promise.all(pages.map(p => p.close()));
    
    // 진행 상황 저장 (10개마다)
    if ((i + PARALLEL_PAGES) % 50 === 0 || i + PARALLEL_PAGES >= toProcess.length) {
      saveProgress(progress);
      // 데이터 파일도 저장
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
      log(`진행: ${Math.min(i + PARALLEL_PAGES, toProcess.length)}/${toProcess.length} (수정: ${fixed}, 없음: ${noImage}, 실패: ${failed})`);
    }
    
    await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
  }
  
  await browser.close();
  
  // 최종 저장
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  saveProgress(progress);
  
  log('=== 완료 ===');
  log(`수정됨: ${fixed}`);
  log(`이미지 없음: ${noImage}`);
  log(`실패 (재시도 필요): ${failed}`);
  
  // 실패한 항목이 있으면 재시도 안내
  if (failed > 0) {
    log(`\n${failed}개 항목이 실패했습니다. 스크립트를 다시 실행하면 재시도합니다.`);
  }
}

main().catch(console.error);
