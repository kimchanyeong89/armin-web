const fs = require('fs');
const { chromium } = require('playwright');

const DATA_FILE = './public/data/louvre-painting-collection.json';

// 박물관 패턴 - 잘못된 작가명
const museumPatterns = ['Musée', 'Museum', 'Massey', 'Augustins', 'Mirande', 'Tarbes', 'Toulouse', 'Bordeaux', 'Lyon', 'Grenoble', 'Dijon', 'Strasbourg', 'Arts,', 'Beaux-Arts', 'Palais', 'Château', 'Cahors'];

function needsFix(artist) {
  if (!artist) return false;
  return museumPatterns.some(p => artist.includes(p));
}

// "Lastname, Firstname" → "Firstname Lastname" 변환
function formatArtist(artist) {
  if (!artist) return 'Unknown';
  
  // 쉼표가 있으면 순서 바꾸기
  if (artist.includes(', ')) {
    const parts = artist.split(', ');
    if (parts.length === 2) {
      return `${parts[1]} ${parts[0]}`.trim();
    }
  }
  return artist.trim();
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  
  // 1. 먼저 모든 작가명의 쉼표 형식 수정
  let commaFixed = 0;
  data.objects.forEach(obj => {
    if (obj.artist && obj.artist.includes(', ')) {
      const original = obj.artist;
      obj.artist = formatArtist(obj.artist);
      if (original !== obj.artist) commaFixed++;
    }
  });
  console.log('쉼표 형식 수정:', commaFixed, '개');
  
  // 2. 잘못된 작가명 찾기
  const needsRescrape = data.objects.filter(o => needsFix(o.artist));
  console.log('잘못된 작가명:', needsRescrape.length, '개');
  
  if (needsRescrape.length === 0) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log('저장 완료!');
    return;
  }
  
  // 3. 잘못된 작가명 재스크래핑
  console.log('\n재스크래핑 시작...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  
  let fixed = 0;
  let failed = 0;
  
  // 5개씩 병렬 처리
  const BATCH_SIZE = 5;
  for (let i = 0; i < needsRescrape.length; i += BATCH_SIZE) {
    const batch = needsRescrape.slice(i, i + BATCH_SIZE);
    
    await Promise.all(batch.map(async (obj) => {
      if (!obj.detailUrl) {
        failed++;
        return;
      }
      
      try {
        const page = await context.newPage();
        await page.goto(obj.detailUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        
        // 작가명 추출 - 루브르 페이지 구조에서
        const artistEl = await page.$('a[href*="author"]');
        let artist = artistEl ? await artistEl.textContent() : null;
        
        if (!artist) {
          // 대체 방법
          const artistSection = await page.$('text=Artist/maker');
          if (artistSection) {
            const parent = await artistSection.evaluateHandle(el => el.closest('li') || el.parentElement);
            const links = await parent.$$('a');
            for (const link of links) {
              const href = await link.getAttribute('href');
              if (href && href.includes('author')) {
                artist = await link.textContent();
                break;
              }
            }
          }
        }
        
        await page.close();
        
        if (artist && !needsFix(artist)) {
          // 원본 객체 찾아서 업데이트
          const idx = data.objects.findIndex(o => o.id === obj.id);
          if (idx !== -1) {
            data.objects[idx].artist = formatArtist(artist.trim());
            fixed++;
          }
        } else {
          // 작가를 못 찾으면 Unknown
          const idx = data.objects.findIndex(o => o.id === obj.id);
          if (idx !== -1) {
            data.objects[idx].artist = 'Unknown';
            failed++;
          }
        }
      } catch (err) {
        const idx = data.objects.findIndex(o => o.id === obj.id);
        if (idx !== -1) {
          data.objects[idx].artist = 'Unknown';
        }
        failed++;
      }
    }));
    
    process.stdout.write(`\r진행: ${Math.min(i + BATCH_SIZE, needsRescrape.length)}/${needsRescrape.length} (수정: ${fixed}, 실패: ${failed})`);
  }
  
  await browser.close();
  
  console.log('\n\n완료!');
  console.log('수정됨:', fixed);
  console.log('실패 (Unknown):', failed);
  
  // 저장
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  console.log('저장 완료!');
}

main().catch(console.error);
