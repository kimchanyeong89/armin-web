/**
 * Lille + Rouen 스크래퍼 V3
 * 정확한 구조 분석 기반
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

async function scrapeLille(browser) {
  const page = await browser.newPage();
  const artworks = [];
  const visited = new Set();
  
  console.log(`[${timestamp()}] [Lille] 🏛️ Highlights 수집 시작`);
  
  // 첫 페이지에서 모든 페이지네이션 파악
  await page.goto('https://pba.lille.fr/en/Collections/Highlights', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  
  // 모든 페이지 URL 수집
  const pageUrls = await page.evaluate(() => {
    const urls = ['https://pba.lille.fr/en/Collections/Highlights'];
    const paginationLinks = [...document.querySelectorAll('a[href*="(offset)"]')];
    paginationLinks.forEach(a => {
      if (!urls.includes(a.href)) urls.push(a.href);
    });
    return urls;
  });
  
  console.log(`[${timestamp()}] [Lille] 총 ${pageUrls.length}개 페이지 발견`);
  
  // 각 페이지에서 작품 링크 수집
  const artworkLinks = [];
  for (const pageUrl of pageUrls) {
    await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);
    
    const links = await page.evaluate(() => {
      return [...document.querySelectorAll('a[href*="/Highlights/"]')]
        .filter(a => {
          const href = a.href;
          if (href.includes('(offset)')) return false;
          const path = href.replace('https://pba.lille.fr/en/Collections/Highlights/', '');
          const parts = path.split('/').filter(p => p);
          return parts.length >= 2; // 카테고리/작품이름
        })
        .map(a => a.href);
    });
    
    links.forEach(link => {
      if (!visited.has(link)) {
        visited.add(link);
        artworkLinks.push(link);
      }
    });
    
    console.log(`[${timestamp()}] [Lille] 페이지 완료, 누적 ${artworkLinks.length}개 링크`);
  }
  
  console.log(`[${timestamp()}] [Lille] 총 ${artworkLinks.length}개 작품 링크, 상세 수집 시작`);
  
  // 각 작품 상세 페이지 수집
  for (let i = 0; i < artworkLinks.length; i++) {
    const link = artworkLinks[i];
    try {
      await page.goto(link, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(800);
      
      const artwork = await page.evaluate(() => {
        // 제목
        const titleEl = document.querySelector('h1, .artwork-title, [class*="title"]');
        let title = titleEl?.textContent?.trim() || '';
        if (title === 'Cookies' || title === 'COOKIES') {
          // 쿠키 배너가 제목으로 잡힌 경우
          const h2 = document.querySelector('h2');
          title = h2?.textContent?.trim() || '';
        }
        
        // 작가 - 여러 패턴 시도
        let artist = 'Unknown';
        const bodyText = document.body.innerText;
        
        // 패턴: 이름 다음에 년도 (1624 - 1693 같은)
        const artistMatch = bodyText.match(/([A-Z][a-zA-Zéèêëàâäôöûüç\s-]+)\n\s*\d{4}\s*-\s*\d{4}/);
        if (artistMatch) {
          artist = artistMatch[1].trim();
        }
        
        // 년도
        const yearMatch = bodyText.match(/\n(\d{4})\n/);
        const year = yearMatch ? yearMatch[1] : '';
        
        // 매체
        const mediumMatch = bodyText.match(/(Oil on canvas|Marble|Bronze|Ceramic|Tempera|Watercolor|Drawing|Sculpture)[^\n]*/i);
        const medium = mediumMatch ? mediumMatch[0].trim() : '';
        
        // 이미지
        const imgs = [...document.querySelectorAll('img[src*="artwork"], img[src*="oeuvre"], img[src*="storage/images"]')];
        const image = imgs.find(i => i.src.includes('artwork_illustration') || i.src.includes('oeuvre'))?.src || 
                      imgs[0]?.src || '';
        
        return { title, artist, year, medium, image };
      });
      
      if (artwork.title && artwork.title !== 'Cookies') {
        artworks.push({
          id: `lille-${i + 1}`,
          title: artwork.title,
          artist: artwork.artist,
          year: artwork.year,
          medium: artwork.medium,
          imageUrl: artwork.image,
          sourceUrl: link,
          museum: 'Palais des Beaux-Arts de Lille'
        });
      }
      
      if ((i + 1) % 10 === 0) {
        console.log(`[${timestamp()}] [Lille] ${i + 1}/${artworkLinks.length} 수집됨`);
      }
    } catch (e) {
      console.log(`[${timestamp()}] [Lille] 오류: ${link.slice(-30)}`);
    }
  }
  
  await page.close();
  return artworks;
}

async function scrapeRouen(browser) {
  const page = await browser.newPage();
  const artworks = [];
  const visited = new Set();
  
  console.log(`[${timestamp()}] [Rouen] 🏛️ Collections 수집 시작`);
  
  // 카테고리 목록
  const categories = [
    'impressionism',
    'landscapes',
    'the-renaissance',
    'baroque-europe',
    'the-french-grand-siecle',
    'romanticism',
    'the-salon',
    'portraits',
    'still-lifes',
    'rouen',
    'genre-painting-in-france-in-the-18th-century'
  ];
  
  for (const category of categories) {
    const url = `https://mbarouen.fr/en/collections/${category}`;
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(2000);
      
      // 작품 링크 수집
      const links = await page.evaluate(() => {
        return [...document.querySelectorAll('a[href*="/oeuvres/"]')]
          .map(a => a.href)
          .filter(href => href.includes('/en/oeuvres/'));
      });
      
      const newLinks = links.filter(l => !visited.has(l));
      newLinks.forEach(l => visited.add(l));
      
      console.log(`[${timestamp()}] [Rouen] ${category}: ${newLinks.length}개 발견`);
      
      // 각 작품 상세
      for (const link of newLinks) {
        try {
          await page.goto(link, { waitUntil: 'networkidle', timeout: 30000 });
          await page.waitForTimeout(800);
          
          const artwork = await page.evaluate(() => {
            const title = document.querySelector('h1')?.textContent?.trim() || '';
            
            // 작가
            const artistEl = document.querySelector('.oeuvre-content .artist, .oeuvre-author, [class*="artist"]');
            let artist = artistEl?.textContent?.trim() || '';
            
            if (!artist) {
              // 본문에서 추출
              const bodyText = document.body.innerText;
              const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l);
              const titleIdx = lines.findIndex(l => l === title);
              if (titleIdx >= 0 && titleIdx + 1 < lines.length) {
                artist = lines[titleIdx + 1];
              }
            }
            
            // 년도
            const yearMatch = document.body.innerText.match(/(\d{4})/);
            const year = yearMatch ? yearMatch[1] : '';
            
            // 매체
            const mediumMatch = document.body.innerText.match(/(Oil on canvas|Huile sur toile|Bronze|Marble|Pastel|Watercolor)[^\n]*/i);
            const medium = mediumMatch ? mediumMatch[0].trim() : '';
            
            // 이미지 - og:image 또는 큰 이미지
            const ogImage = document.querySelector('meta[property="og:image"]')?.content || '';
            const mainImg = document.querySelector('.oeuvre-visual img, .artwork-image img, img[src*="oeuvres"]')?.src || '';
            const image = ogImage || mainImg;
            
            return { title, artist, year, medium, image };
          });
          
          if (artwork.title) {
            artworks.push({
              id: `rouen-${artworks.length + 1}`,
              title: artwork.title,
              artist: artwork.artist || 'Unknown',
              year: artwork.year,
              medium: artwork.medium,
              imageUrl: artwork.image,
              sourceUrl: link,
              artworkType: category,
              museum: 'Musée des Beaux-Arts de Rouen'
            });
          }
        } catch (e) {
          // skip
        }
      }
    } catch (e) {
      console.log(`[${timestamp()}] [Rouen] 카테고리 오류: ${category}`);
    }
  }
  
  await page.close();
  return artworks;
}

async function main() {
  console.log('═'.repeat(60));
  console.log('  🏛️  Lille + Rouen Scraper V3');
  console.log('═'.repeat(60));
  console.log(`  시작: ${new Date().toLocaleString('ko-KR')}`);
  console.log('─'.repeat(60));
  
  const browser = await chromium.launch({ headless: true });
  
  // 병렬 실행
  const [lilleArtworks, rouenArtworks] = await Promise.all([
    scrapeLille(browser),
    scrapeRouen(browser)
  ]);
  
  await browser.close();
  
  // 저장
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'lille-pba.json'),
    JSON.stringify(lilleArtworks, null, 2)
  );
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'rouen-mba.json'),
    JSON.stringify(rouenArtworks, null, 2)
  );
  
  console.log('');
  console.log('═'.repeat(60));
  console.log('  ✅ 완료!');
  console.log('═'.repeat(60));
  console.log(`  Lille PBA: ${lilleArtworks.length}개`);
  console.log(`  Rouen MBA: ${rouenArtworks.length}개`);
  console.log('═'.repeat(60));
}

main().catch(console.error);
