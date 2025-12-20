/**
 * 기존 GAC 컬렉션 데이터에서 영상 항목을 식별하고 youtubeId를 추가합니다.
 * 영상 여부는 각 작품 페이지에서 YouTube iframe을 찾아서 판단합니다.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const readline = require('readline');

// 테스트할 컬렉션
const COLLECTION_FILE = './public/data/royal-academy-collection.json';

// 추가로 확인할 특정 URL들
const SPECIFIC_URLS = [
  'https://artsandculture.google.com/asset/the-story-of-the-royal-academy-of-arts/OgHJE6uHmR2BVA'
];

function waitForEnter(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => {
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
}

async function detectVideos() {
  // 컬렉션 로드
  const data = JSON.parse(fs.readFileSync(COLLECTION_FILE, 'utf-8'));
  console.log(`총 ${data.objects.length}개 항목`);
  
  // 영상 가능성이 높은 항목들 (더 넓은 키워드)
  const videoKeywords = /video|film|minute|second|tour|movie|documentary|interview|talk|lecture|performance|story/i;
  
  // 아직 youtubeId가 없는 항목만 확인
  const potentialVideos = data.objects.filter(o => 
    videoKeywords.test(o.title) && !o.youtubeId
  );
  
  console.log(`영상 키워드 포함 (미확인): ${potentialVideos.length}개`);
  potentialVideos.forEach(o => console.log(`  - ${o.title}`));
  
  if (potentialVideos.length === 0) {
    console.log('확인할 항목이 없습니다.');
    return;
  }
  
  // 브라우저 시작
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // 첫 페이지 열기
  await page.goto(potentialVideos[0].sourceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  console.log('\n========================================');
  console.log('브라우저가 열렸습니다.');
  console.log('CAPTCHA가 있으면 풀어주세요.');
  console.log('준비되면 Enter를 누르세요.');
  console.log('========================================\n');
  
  await waitForEnter('>>> Enter를 눌러 계속...');
  
  let updatedCount = 0;
  
  for (let i = 0; i < potentialVideos.length; i++) {
    const item = potentialVideos[i];
    console.log(`\n[${i + 1}/${potentialVideos.length}] ${item.title}`);
    
    try {
      await page.goto(item.sourceUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await new Promise(r => setTimeout(r, 2000));
      
      // YouTube iframe에서 ID 추출
      const youtubeId = await page.evaluate(() => {
        const iframes = document.querySelectorAll('iframe[src*="youtube.com/embed"]');
        if (iframes.length > 0) {
          const src = iframes[0].src;
          const match = src.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
          if (match) return match[1];
        }
        // HTML에서도 찾기
        const html = document.documentElement.innerHTML;
        const match = html.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
        return match ? match[1] : null;
      });
      
      if (youtubeId) {
        console.log(`  ✅ YouTube ID: ${youtubeId}`);
        
        // 원본 데이터에서 해당 항목 찾아서 업데이트
        const originalItem = data.objects.find(o => o.id === item.id);
        if (originalItem) {
          originalItem.youtubeId = youtubeId;
          originalItem.mediaType = 'video';
          updatedCount++;
        }
      } else {
        console.log(`  ❌ 영상 아님`);
      }
      
    } catch (e) {
      console.log(`  ⚠️ 에러: ${e.message}`);
    }
  }
  
  await browser.close();
  
  // 파일 저장
  if (updatedCount > 0) {
    fs.writeFileSync(COLLECTION_FILE, JSON.stringify(data, null, 2));
    console.log(`\n✅ ${updatedCount}개 영상 항목 업데이트 완료`);
  } else {
    console.log('\n업데이트할 영상 항목이 없습니다.');
  }
}

detectVideos().catch(console.error);
