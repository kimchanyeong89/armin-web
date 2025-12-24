/**
 * MAM Paris - Photography Collection Full Scraper
 * 
 * 병렬 처리 + 진행 상황 저장 + 재시작 가능
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.navigart.fr/mamparis/#/artworks/checkbox:withimage/Avec%20image/tree_domain_all/Photographie';
const PROGRESS_FILE = path.join(__dirname, '../downloads/mam-photography-progress.json');
const FINAL_OUTPUT = path.join(__dirname, '../public/data/mam-photography-collection.json');

const MAX_PAGES = 300; // Photography는 더 많을 수 있음
const PARALLEL_COUNT = 5;
const SAVE_INTERVAL = 30;

// 필터링할 네비게이션/UI 텍스트
const FILTER_TEXTS = [
  'Notice artiste',
  "Notice de l'artiste",
  'AWARE',
  'Navigart',
  'Retour',
  'Partager',
  'Télécharger',
  'Imprimer',
  'Fermer',
  'Menu',
  'Recherche',
  'Accueil',
  'Collection',
  'MUSÉE',
  'mamparis',
  'En savoir plus',
  'Voir plus',
  'Afficher'
];

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    console.log(`📂 이전 진행 상황 로드: ${data.artworks?.length || 0}개 작품, 페이지 ${data.lastPage || 0}`);
    return data;
  }
  return { lastPage: 0, artworks: [], scrapedUrls: [] };
}

function saveProgress(lastPage, artworks, scrapedUrls) {
  const data = {
    lastPage,
    savedAt: new Date().toISOString(),
    artworks,
    scrapedUrls: Array.from(scrapedUrls)
  };
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

function saveFinal(artworks) {
  const finalOutput = {
    museum: 'Musée d\'Art Moderne de Paris',
    museumId: 'mam-paris',
    collectionName: 'Photography Collection',
    scrapedAt: new Date().toISOString(),
    totalObjects: artworks.length,
    coverImage: artworks[0]?.image || '',
    objects: artworks
  };
  fs.writeFileSync(FINAL_OUTPUT, JSON.stringify(finalOutput, null, 2));
}

async function scrapeDetail(context, url, listImage, retryCount = 0) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    
    try {
      await page.waitForSelector('img[src*="navigart.fr"]', { timeout: 8000 });
    } catch {
      // 이미지가 없어도 계속
    }
    
    await page.waitForTimeout(2000);
    
    const data = await page.evaluate((filterTexts) => {
      let image = null;
      const imgElements = Array.from(document.querySelectorAll('img'));
      for (const img of imgElements) {
        const src = img.src || '';
        if (src.includes('images.navigart.fr') && !src.includes('data:image')) {
          image = src.replace(/images\.navigart\.fr\/\d+\//, 'images.navigart.fr/1000/');
          break;
        }
        const dataSrc = img.getAttribute('data-src') || '';
        if (dataSrc.includes('images.navigart.fr')) {
          image = dataSrc.replace(/images\.navigart\.fr\/\d+\//, 'images.navigart.fr/1000/');
          break;
        }
      }
      
      const mainContent = document.querySelector('.artwork-detail, .notice, .content, main, [class*="detail"]');
      const textSource = mainContent || document.body;
      const pageText = textSource.innerText;
      
      const lines = pageText.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .filter(l => !filterTexts.some(ft => l.toLowerCase().includes(ft.toLowerCase())))
        .filter(l => l.length < 200)
        .filter(l => !/^(http|www\.)/i.test(l));
      
      let artist = null;
      let title = null;
      let year = null;
      let medium = null;
      let dimensions = null;
      
      const hasDash = lines[0]?.startsWith('-') || lines[0]?.startsWith('–') || lines[0]?.startsWith('—');
      
      if (hasDash) {
        artist = lines[0].replace(/^[-–—]\s*/, '').trim();
        if (lines[1] && !filterTexts.some(ft => lines[1].includes(ft))) {
          title = lines[1];
        }
      } else {
        artist = lines[0] || null;
        const isLifespan = lines[1] && /^\d{4}/.test(lines[1]) && /[-–,]/.test(lines[1]);
        const titleIdx = isLifespan ? 2 : 1;
        if (lines[titleIdx] && !filterTexts.some(ft => lines[titleIdx].includes(ft))) {
          title = lines[titleIdx];
        }
      }
      
      for (let i = 0; i < Math.min(lines.length, 20); i++) {
        const line = lines[i];
        if (!year && /^(vers\s+)?\d{4}$/.test(line)) year = line.trim();
        if (!medium && /^(Photographie|Tirage|Épreuve|Cibachrome|Gélatino|Print|Silver)/i.test(line)) medium = line;
        if (!dimensions && /^\d+[,.]?\d*\s*[x×]\s*\d+[,.]?\d*\s*(cm|mm)?$/i.test(line)) dimensions = line;
      }
      
      if (title) {
        if (/^(vers\s+)?\d{4}$/.test(title)) title = null;
        if (/^(Photographie|Tirage|Épreuve)/i.test(title)) title = null;
        if (/^\d+[,.]?\d*\s*[x×]/.test(title)) title = null;
      }
      
      return { image, artist, title, year, medium, dimensions };
    }, FILTER_TEXTS);
    
    await page.close();
    
    if (!data.artist && !data.title && retryCount < 2) {
      await new Promise(r => setTimeout(r, 500));
      return scrapeDetail(context, url, listImage, retryCount + 1);
    }
    
    return { ...data, listImage, detailUrl: url };
  } catch (e) {
    await page.close();
    if (retryCount < 2) {
      await new Promise(r => setTimeout(r, 1000));
      return scrapeDetail(context, url, listImage, retryCount + 1);
    }
    return { error: e.message, detailUrl: url, listImage };
  }
}

async function scrape() {
  console.log('📷 MAM Paris - Photography Collection Scraper');
  console.log('='.repeat(50));
  console.log(`최대 페이지: ${MAX_PAGES}, 병렬: ${PARALLEL_COUNT}개씩`);
  console.log('='.repeat(50) + '\n');
  
  const startTime = Date.now();
  
  const progress = loadProgress();
  let artworks = progress.artworks || [];
  let scrapedUrls = new Set(progress.scrapedUrls || []);
  let startPage = (progress.lastPage || 0) + 1;
  
  if (artworks.length > 0) {
    console.log(`\n▶ 페이지 ${startPage}부터 재시작\n`);
  }
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const mainPage = await context.newPage();
  
  let emptyPagesInRow = 0;
  
  try {
    for (let pageNum = startPage; pageNum <= MAX_PAGES; pageNum++) {
      const pageUrl = `${BASE_URL}?page=${pageNum}&sort=random&layout=box`;
      
      try {
        await mainPage.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });
      } catch (e) {
        console.log(`\n⚠️ 페이지 ${pageNum} 로드 실패, 재시도...`);
        await mainPage.waitForTimeout(3000);
        await mainPage.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });
      }
      
      await mainPage.waitForTimeout(2000);
      await mainPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await mainPage.waitForTimeout(1500);
      
      const items = await mainPage.$$eval('a[href*="/artwork/"]', (elements, scrapedList) => {
        const seen = new Set(scrapedList);
        return elements.filter(el => {
          if (seen.has(el.href)) return false;
          seen.add(el.href);
          return true;
        }).map(el => {
          const img = el.querySelector('img');
          let listImage = null;
          if (img) {
            const src = img.src || img.getAttribute('data-src') || '';
            if (src.includes('navigart.fr') && !src.includes('data:image')) {
              listImage = src.replace(/images\.navigart\.fr\/\d+\//, 'images.navigart.fr/1000/');
            }
          }
          return { detailUrl: el.href, listImage };
        });
      }, Array.from(scrapedUrls));
      
      if (items.length === 0) {
        emptyPagesInRow++;
        console.log(`\n페이지 ${pageNum}: 새 항목 없음 (${emptyPagesInRow}/3)`);
        if (emptyPagesInRow >= 3) {
          console.log('3페이지 연속 빈 페이지, 종료');
          break;
        }
        continue;
      }
      emptyPagesInRow = 0;
      
      process.stdout.write(`\n📄 페이지 ${pageNum}: ${items.length}개 → `);
      
      // 병렬 스크래핑
      for (let i = 0; i < items.length; i += PARALLEL_COUNT) {
        const batch = items.slice(i, i + PARALLEL_COUNT);
        
        const results = await Promise.all(
          batch.map(item => scrapeDetail(context, item.detailUrl, item.listImage))
        );
        
        for (const data of results) {
          scrapedUrls.add(data.detailUrl);
          
          if (!data.error) {
            artworks.push({
              id: `mam-photo-${artworks.length + 1}`,
              title: data.title || 'Sans titre',
              artist: data.artist || 'Artiste inconnu',
              year: data.year || null,
              image: data.image || data.listImage,
              dimensions: data.dimensions || null,
              medium: data.medium || 'Photographie',
              source: 'Musée d\'Art Moderne de Paris',
              collectionArea: 'Photography',
              detailUrl: data.detailUrl
            });
            process.stdout.write('✓');
          } else {
            process.stdout.write('✗');
          }
        }
        
        await new Promise(r => setTimeout(r, 300));
      }
      
      // 주기적 저장
      if (artworks.length % SAVE_INTERVAL < PARALLEL_COUNT) {
        saveProgress(pageNum, artworks, scrapedUrls);
        saveFinal(artworks);
        process.stdout.write(` [저장: ${artworks.length}개]`);
      }
    }
    
    // 최종 저장
    saveProgress(MAX_PAGES, artworks, scrapedUrls);
    saveFinal(artworks);
    
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    const withData = artworks.filter(a => a.artist !== 'Artiste inconnu' && a.title !== 'Sans titre').length;
    
    console.log('\n\n' + '='.repeat(50));
    console.log('✅ 완료!');
    console.log(`  - 총 수집: ${artworks.length}개`);
    console.log(`  - 데이터 있음: ${withData}개 (${((withData/artworks.length)*100).toFixed(1)}%)`);
    console.log(`  - 소요시간: ${elapsed}분`);
    console.log(`📁 저장: ${FINAL_OUTPUT}`);
    
  } catch (e) {
    console.error('\n❌ 오류:', e.message);
    saveProgress(progress.lastPage, artworks, scrapedUrls);
    saveFinal(artworks);
    console.log(`⚠️ 진행 상황 저장됨: ${artworks.length}개`);
  }
  
  await browser.close();
}

scrape();
