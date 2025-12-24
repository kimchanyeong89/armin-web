/**
 * Rouen MBA Scraper V5
 * - 상세 페이지 파싱 수정
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = '/Users/kietzsche/armin-web-main/public/data';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'rouen-mba.json');

const CATEGORIES = [
  'impressionism', 'landscapes', 'the-renaissance', 'baroque-europe',
  'the-french-grand-siecle', 'romanticism', 'the-salon', 'portraits',
  'still-lifes', 'rouen', 'genre-painting-in-france-in-the-18th-century',
  'the-drawing-collection'
];

function log(msg) {
  const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  console.log(`[${time}] ${msg}`);
}

async function scrapeRouen() {
  console.log('═'.repeat(60));
  console.log('  🏛️  Rouen MBA Scraper V5 - 상세 페이지 파싱 수정');
  console.log('═'.repeat(60));
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  const artworks = [];
  let count = 0;
  
  try {
    // 1. 모든 카테고리에서 링크 수집
    const allLinks = [];
    
    for (const cat of CATEGORIES) {
      const page = await context.newPage();
      const url = `https://mbarouen.fr/en/collections/${cat}`;
      
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);
        
        const links = await page.$$eval('a[href*="/oeuvres/"]', els => 
          [...new Set(els.map(a => a.href))]
        );
        
        links.forEach(link => {
          if (!allLinks.find(l => l.url === link)) {
            allLinks.push({ url: link, category: cat });
          }
        });
        
        log(`${cat}: ${links.length}개 발견`);
      } catch (e) {
        log(`${cat} 오류: ${e.message}`);
      }
      
      await page.close();
    }
    
    log(`총 ${allLinks.length}개 작품 링크 발견, 상세 수집 시작`);
    
    // 2. 각 작품 상세 페이지 방문
    for (const { url, category } of allLinks) {
      count++;
      const page = await context.newPage();
      
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(1500);
        
        const data = await page.evaluate(() => {
          // Title - h1.page-header__title 또는 main h1
          let title = '';
          const h1 = document.querySelector('h1.page-header__title') || 
                     document.querySelector('main h1') ||
                     document.querySelector('h1');
          if (h1) title = h1.textContent.trim();
          
          // Artist - 첫 번째 h2 (보통 작가명)
          let artist = '';
          const h2s = document.querySelectorAll('.field-group-format h2, .content h2, main h2');
          for (const h2 of h2s) {
            const text = h2.textContent.trim();
            // 섹션 제목이 아닌 작가명 찾기
            if (text && !text.includes('EXHIBITIONS') && !text.includes('COLLECTIONS') && 
                !text.includes('NEWSLETTER') && !text.includes('SITES') && !text.includes('PLAN')) {
              artist = text;
              break;
            }
          }
          
          // Date & Medium
          let year = '';
          let medium = '';
          const text = document.body.innerText;
          const dateMatch = text.match(/DATE\s*:\s*(\d{4})/i);
          if (dateMatch) year = dateMatch[1];
          
          const mediumMatch = text.match(/MEDIUM\s*:\s*([^\n|]+)/i);
          if (mediumMatch) medium = mediumMatch[1].trim();
          
          // Image - deepzoom 이미지 또는 og:image
          let imageUrl = '';
          
          // deepzoom 이미지 찾기
          const deepzoomImgs = document.querySelectorAll('img[src*="deepzoom"]');
          if (deepzoomImgs.length > 0) {
            // 가장 큰 이미지 찾기 (보통 10/0_0.jpg 형식)
            for (const img of deepzoomImgs) {
              const src = img.src;
              if (src.includes('/10/') || src.includes('/9/')) {
                imageUrl = src;
                break;
              }
            }
            if (!imageUrl && deepzoomImgs[0]) {
              imageUrl = deepzoomImgs[0].src;
            }
          }
          
          // og:image 폴백
          if (!imageUrl) {
            const ogImage = document.querySelector('meta[property="og:image"]');
            if (ogImage) imageUrl = ogImage.content;
          }
          
          // 일반 이미지 폴백
          if (!imageUrl) {
            const mainImg = document.querySelector('.field-name-field-oeuvre-image img, .artwork-image img');
            if (mainImg) imageUrl = mainImg.src;
          }
          
          return { title, artist, year, medium, imageUrl };
        });
        
        artworks.push({
          id: `rouen-${count}`,
          title: data.title || 'Unknown',
          artist: data.artist || 'Unknown',
          year: data.year,
          medium: data.medium,
          imageUrl: data.imageUrl,
          sourceUrl: url,
          artworkType: category,
          museum: 'Musée des Beaux-Arts de Rouen'
        });
        
        if (count % 20 === 0) {
          log(`${count}/${allLinks.length} 수집됨`);
          fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
        }
        
      } catch (e) {
        log(`작품 ${count} 오류: ${e.message}`);
      }
      
      await page.close();
    }
    
    // 저장
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
    
    console.log('═'.repeat(60));
    console.log(`  ✅ 완료: ${artworks.length}개`);
    console.log('═'.repeat(60));
    
  } catch (e) {
    console.error('오류:', e);
  } finally {
    await browser.close();
  }
}

scrapeRouen();
