/**
 * Musei Capitolini - Upgrade existing JSON with year, medium, type
 * 기존 244개 항목에 누락된 필드 추가
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '../public/data/musei-capitolini-collection.json');
const OUTPUT_FILE = INPUT_FILE;
const PROGRESS_FILE = path.join(__dirname, '../downloads/capitolini-upgrade-progress.json');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min = 2000, max = 4000) {
  const ms = Math.floor(Math.random() * (max - min)) + min;
  return delay(ms);
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { completed: [] };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function scrapeDetails(page, url) {
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    if (response && response.status() === 403) {
      console.log('🚫 403 차단 - 2분 대기');
      await delay(120000);
      return null;
    }
    
    await delay(1500);
    
    const details = await page.evaluate(() => {
      const data = {};
      
      // 필드 라벨과 값 추출
      const labels = document.querySelectorAll('.field-label');
      labels.forEach(label => {
        const labelText = label.textContent.trim().replace(':', '').toLowerCase();
        const parent = label.closest('.field');
        if (parent) {
          const item = parent.querySelector('.field-item, .field-items');
          if (item) {
            const value = item.textContent.trim();
            if (labelText.includes('year') || labelText.includes('anno') || labelText.includes('date')) {
              data.year = value;
            } else if (labelText.includes('type') || labelText.includes('tipo')) {
              data.type = value;
            } else if (labelText.includes('material') || labelText.includes('techn') || labelText.includes('mater')) {
              data.medium = value;
            }
          }
        }
      });
      
      return data;
    });
    
    return details;
  } catch (e) {
    console.log(`  ⚠️ 에러: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log('🏛️ Musei Capitolini 데이터 업그레이드');
  
  // 기존 데이터 로드
  const collection = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  const objects = collection.objects;
  console.log(`📊 총 ${objects.length}개 항목`);
  
  // 진행 상태 로드
  const progress = loadProgress();
  const completedSet = new Set(progress.completed);
  
  // URL이 있는 항목만 필터
  const toUpdate = objects.filter(obj => obj.url && !completedSet.has(obj.id));
  console.log(`🔄 업데이트 필요: ${toUpdate.length}개`);
  
  if (toUpdate.length === 0) {
    console.log('✅ 모든 항목 업데이트 완료');
    return;
  }
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  let updated = 0;
  let errors = 0;
  
  for (let i = 0; i < toUpdate.length; i++) {
    const obj = toUpdate[i];
    console.log(`[${i + 1}/${toUpdate.length}] ${obj.title?.substring(0, 40)}...`);
    
    const details = await scrapeDetails(page, obj.url);
    
    if (details) {
      // 원본 객체 찾아서 업데이트
      const idx = objects.findIndex(o => o.id === obj.id);
      if (idx !== -1) {
        if (details.year) {
          // year 파싱
          const yearMatch = details.year.match(/(\d{4})/);
          objects[idx].year = yearMatch ? parseInt(yearMatch[1]) : null;
          objects[idx].dateStr = details.year;
        }
        if (details.type) {
          objects[idx].type = details.type;
        }
        if (details.medium) {
          objects[idx].medium = details.medium;
        }
        
        console.log(`  ✓ year: ${details.year || '-'}, type: ${details.type || '-'}, medium: ${details.medium || '-'}`);
        updated++;
      }
      
      progress.completed.push(obj.id);
    } else {
      errors++;
    }
    
    // 10개마다 저장
    if ((i + 1) % 10 === 0) {
      collection.objects = objects;
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2));
      saveProgress(progress);
      console.log(`💾 저장 (${updated}개 업데이트)`);
    }
    
    await randomDelay();
  }
  
  await browser.close();
  
  // 최종 저장
  collection.objects = objects;
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2));
  
  console.log('\n=== 완료 ===');
  console.log(`✅ 업데이트: ${updated}개`);
  console.log(`⚠️ 에러: ${errors}개`);
  
  // 결과 확인
  const withYear = objects.filter(o => o.year || o.dateStr).length;
  const withType = objects.filter(o => o.type).length;
  const withMedium = objects.filter(o => o.medium).length;
  console.log(`\n📊 최종 현황:`);
  console.log(`  Year: ${withYear}/${objects.length}`);
  console.log(`  Type: ${withType}/${objects.length}`);
  console.log(`  Medium: ${withMedium}/${objects.length}`);
}

main().catch(console.error);
