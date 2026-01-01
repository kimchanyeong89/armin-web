/**
 * Grand Palais RMN 플레이스홀더 이미지 수정 (범용)
 * 사용법: node fix-grandpalais-all.cjs [파일명]
 * 예: node fix-grandpalais-all.cjs versailles-collection.json
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FILE_NAME = process.argv[2];
if (!FILE_NAME) {
  console.log('사용법: node fix-grandpalais-all.cjs [파일명]');
  console.log('예: node fix-grandpalais-all.cjs versailles-collection.json');
  process.exit(1);
}

const DATA_FILE = path.join(__dirname, '../public/data', FILE_NAME);
const PROGRESS_FILE = path.join(__dirname, '../downloads', `fix-${FILE_NAME.replace('.json', '')}-progress.json`);
const LOG_FILE = path.join(__dirname, '../logs', `fix-${FILE_NAME.replace('.json', '')}.log`);

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
    
    const ogImage = await page.$eval('meta[property="og:image"]', el => el.content).catch(() => null);
    
    if (ogImage && ogImage.includes('?ID=')) {
      return { success: true, url: ogImage };
    }
    
    const imgUrl = await page.evaluate(() => {
      const img = document.querySelector('.notice-image img, .media-image img, img[src*="thumb.php"]');
      return img ? img.src : null;
    });
    
    if (imgUrl && imgUrl.includes('?ID=')) {
      return { success: true, url: imgUrl };
    }
    
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
  if (!fs.existsSync(DATA_FILE)) {
    console.log(`파일을 찾을 수 없습니다: ${DATA_FILE}`);
    process.exit(1);
  }
  
  fs.writeFileSync(LOG_FILE, `=== ${FILE_NAME} 플레이스홀더 수정 시작: ${new Date().toISOString()} ===\n`);
  
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const objects = data.objects || [];
  const originalCount = objects.length;
  log(`파일: ${FILE_NAME}`);
  log(`총 작품 수: ${originalCount}`);
  
  const placeholderIndices = [];
  objects.forEach((obj, idx) => {
    const img = obj.image || obj.highResImage || '';
    if (/eJx/.test(img)) {
      placeholderIndices.push(idx);
    }
  });
  
  log(`플레이스홀더 이미지: ${placeholderIndices.length}개`);
  
  if (placeholderIndices.length === 0) {
    log('모든 이미지가 유효합니다!');
    return;
  }
  
  const progress = loadProgress();
  const alreadyProcessed = new Set([
    ...Object.keys(progress.fixed),
    ...Object.keys(progress.noImage)
  ]);
  
  const toProcess = placeholderIndices.filter(idx => {
    const id = objects[idx].id;
    return !alreadyProcessed.has(id);
  });
  
  log(`이미 처리됨: ${alreadyProcessed.size}개`);
  log(`처리 필요: ${toProcess.length}개`);
  
  if (toProcess.length === 0) {
    log('모든 플레이스홀더가 이미 처리되었습니다.');
    return;
  }
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  // 쿠키 수락
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
  
  for (let i = 0; i < toProcess.length; i += PARALLEL_PAGES) {
    const batch = toProcess.slice(i, i + PARALLEL_PAGES);
    const pages = await Promise.all(batch.map(() => context.newPage()));
    
    const results = await Promise.all(batch.map(async (idx, j) => {
      const obj = objects[idx];
      const page = pages[j];
      
      try {
        const result = await fetchImageUrl(page, obj.sourceUrl);
        return { idx, obj, result };
      } catch (e) {
        return { idx, obj, result: { success: false, reason: 'ERROR', error: e.message } };
      }
    }));
    
    for (const { idx, obj, result } of results) {
      if (result.success) {
        objects[idx].image = result.url;
        if (objects[idx].highResImage) {
          objects[idx].highResImage = result.url;
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
    
    await Promise.all(pages.map(p => p.close()));
    
    if ((i + PARALLEL_PAGES) % 50 === 0 || i + PARALLEL_PAGES >= toProcess.length) {
      saveProgress(progress);
      data.objects = objects;
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
      log(`진행: ${Math.min(i + PARALLEL_PAGES, toProcess.length)}/${toProcess.length} (수정: ${fixed}, 없음: ${noImage}, 실패: ${failed})`);
    }
    
    await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
  }
  
  await browser.close();
  
  data.objects = objects;
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  saveProgress(progress);
  
  log('=== 완료 ===');
  log(`수정됨: ${fixed}`);
  log(`이미지 없음: ${noImage}`);
  log(`실패: ${failed}`);
}

main().catch(console.error);
