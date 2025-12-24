/**
 * Lille + Rouen 스크래퍼 V4
 * Lille: 7페이지 전체, Rouen: 모든 카테고리
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
  
  console.log(`[${timestamp()}] [Lille] 🏛️ 7페이지 전체 수집 시작`);
  
  // 7페이지 직접 순회 (offset 0, 16, 32, 48, 64, 80, 96)
  const offsets = [0, 16, 32, 48, 64, 80, 96];
  
  for (const offset of offsets) {
    const pageUrl = offset === 0 
      ? 'https://pba.lille.fr/en/Collections/Highlights'
      : `https://pba.lille.fr/en/Collections/Highlights/(offset)/${offset}`;
    
    try {
      await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(2000);
      
      // 작품 링크 수집
      const links = await page.evaluate(() => {
        return [...document.querySelectorAll('a[href*="/Highlights/"]')]
          .filter(a => {
            const href = a.href;
            if (href.includes('(offset)')) return false;
            // 카테고리/작품이름 형식인지 확인
            const path = href.replace('https://pba.lille.fr/en/Collections/Highlights/', '');
            const parts = path.split('/').filter(p => p);
            return parts.length >= 2;
          })
          .map(a => a.href);
      });
      
      const uniqueLinks = [...new Set(links)];
      uniqueLinks.forEach(link => {
        if (!visited.has(link)) {
          visited.add(link);
        }
      });
      
      console.log(`[${timestamp()}] [Lille] 페이지 ${offset/16 + 1}/7: ${uniqueLinks.length}개 발견, 총 ${visited.size}개`);
    } catch (e) {
      console.log(`[${timestamp()}] [Lille] 페이지 오류: offset ${offset}`);
    }
  }
  
  const artworkLinks = [...visited];
  console.log(`[${timestamp()}] [Lille] 총 ${artworkLinks.length}개 링크, 상세 수집 시작`);
  
  // 각 작품 상세
  for (let i = 0; i < artworkLinks.length; i++) {
    const link = artworkLinks[i];
    try {
      await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(500);
      
      const artwork = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        
        // 제목 - h2 또는 대문자로 된 제목
        let title = '';
        const h2 = document.querySelector('h2');
        if (h2) title = h2.textContent.trim();
        if (!title || title === 'COOKIES') {
          // 본문에서 찾기 - Highlights 다음 줄
          const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l);
          const hlIdx = lines.findIndex(l => l === 'Highlights' || l.includes('HIGHLIGHTS'));
          if (hlIdx >= 0 && hlIdx + 1 < lines.length) {
            title = lines[hlIdx + 1];
          }
        }
        
        // 작가 - 년도 패턴 앞의 이름
        let artist = 'Unknown';
        const artistMatch = bodyText.match(/\n([A-Z][a-zA-Zéèêëàâäôöûüçí\s-]+)\n\s*\d{4}\s*[-–]\s*\d{4}/);
        if (artistMatch) {
          artist = artistMatch[1].trim();
        } else {
          // About 뒤의 이름
          const aboutMatch = bodyText.match(/About\s+(\d{4})/i);
          if (!aboutMatch) {
            const nameMatch = bodyText.match(/\n([A-Z][a-z]+ [A-Z][a-z]+)\n/);
            if (nameMatch) artist = nameMatch[1];
          }
        }
        
        // 년도
        const yearMatch = bodyText.match(/\n(\d{4})\n/);
        const year = yearMatch ? yearMatch[1] : '';
        
        // 매체
        const mediumMatch = bodyText.match(/(Oil on canvas|Oil on wood|Marble|Bronze|Ceramic|Tempera|Watercolor|Drawing|Sculpture|Pastel)[^\n]*/i);
        const medium = mediumMatch ? mediumMatch[0].trim() : '';
        
        // 이미지
        const imgs = [...document.querySelectorAll('img')];
        const artImg = imgs.find(i => 
          i.src.includes('artwork_illustration') || 
          i.src.includes('storage/images') ||
          i.src.includes('oeuvre')
        );
        const image = artImg?.src || '';
        
        return { title, artist, year, medium, image };
      });
      
      if (artwork.title && artwork.title !== 'Cookies' && artwork.title !== 'COOKIES') {
        artworks.push({
          id: `lille-${artworks.length + 1}`,
          title: artwork.title,
          artist: artwork.artist,
          year: artwork.year,
          medium: artwork.medium,
          imageUrl: artwork.image,
          sourceUrl: link,
          museum: 'Palais des Beaux-Arts de Lille'
        });
      }
      
      if ((i + 1) % 20 === 0) {
        console.log(`[${timestamp()}] [Lille] ${i + 1}/${artworkLinks.length} 수집됨 (${artworks.length}개 성공)`);
      }
    } catch (e) {
      // skip
    }
  }
  
  await page.close();
  return artworks;
}

async function scrapeRouen(browser) {
  const page = await browser.newPage();
  const artworks = [];
  const visited = new Set();
  
  console.log(`[${timestamp()}] [Rouen] 🏛️ 전체 카테고리 수집 시작`);
  
  // 모든 카테고리
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
    'genre-painting-in-france-in-the-18th-century',
    'the-drawing-collection'
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
      
      const uniqueLinks = [...new Set(links)];
      const newLinks = uniqueLinks.filter(l => !visited.has(l));
      newLinks.forEach(l => visited.add(l));
      
      console.log(`[${timestamp()}] [Rouen] ${category}: ${newLinks.length}개 발견`);
      
      // 각 작품 상세
      for (const link of newLinks) {
        try {
          await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await page.waitForTimeout(500);
          
          const artwork = await page.evaluate(() => {
            const title = document.querySelector('h1')?.textContent?.trim() || '';
            const bodyText = document.body.innerText;
            
            // 작가 - 제목 다음 줄
            let artist = 'Unknown';
            const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l);
            const titleIdx = lines.findIndex(l => l === title);
            if (titleIdx >= 0 && titleIdx + 1 < lines.length) {
              const nextLine = lines[titleIdx + 1];
              if (nextLine && !nextLine.match(/^\d{4}/) && nextLine.length < 100) {
                artist = nextLine;
              }
            }
            
            // 년도
            const yearMatch = bodyText.match(/\n(\d{4})\n/);
            const year = yearMatch ? yearMatch[1] : '';
            
            // 매체
            const mediumMatch = bodyText.match(/(Oil on canvas|Huile sur toile|Bronze|Marble|Pastel|Watercolor|Pencil)[^\n]*/i);
            const medium = mediumMatch ? mediumMatch[0].trim() : '';
            
            // 이미지 - og:image 우선
            const ogImage = document.querySelector('meta[property="og:image"]')?.content || '';
            const image = ogImage || '';
            
            return { title, artist, year, medium, image };
          });
          
          if (artwork.title && artwork.title.length > 0) {
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
      
      // 중간 저장
      if (artworks.length > 0 && artworks.length % 30 === 0) {
        console.log(`[${timestamp()}] [Rouen] 중간 저장: ${artworks.length}개`);
      }
    } catch (e) {
      console.log(`[${timestamp()}] [Rouen] 카테고리 오류: ${category} - ${e.message?.slice(0, 50)}`);
    }
  }
  
  await page.close();
  return artworks;
}

async function main() {
  console.log('═'.repeat(60));
  console.log('  🏛️  Lille + Rouen Scraper V4');
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
