/**
 * Rouen MBA Scraper V7
 * - 14개 카테고리 전체
 * - noscript 태그에서 이미지 추출
 */
const { chromium } = require('playwright');
const fs = require('fs');

const OUTPUT_FILE = '/Users/kietzsche/armin-web-main/public/data/rouen-mba.json';

const CATEGORIES = [
  'impressionism', 'landscapes', 'the-renaissance', 'baroque-europe',
  'the-french-grand-siecle', 'romanticism', 'the-salon', 'portraits',
  'still-lifes', 'rouen', 'genre-painting-in-france-in-the-18th-century',
  'the-drawing-collection', 'sculpture', 'who-owns-these-paintings'
];

function log(msg) {
  const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  console.log(`[${time}] ${msg}`);
}

async function scrapeRouen() {
  console.log('═'.repeat(60));
  console.log('  🏛️  Rouen MBA V7 - noscript 이미지 추출');
  console.log('═'.repeat(60));
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  const artworks = [];
  let count = 0;
  
  try {
    // 1. 링크 수집
    const allLinks = [];
    
    for (const cat of CATEGORIES) {
      const page = await context.newPage();
      try {
        await page.goto(`https://mbarouen.fr/en/collections/${cat}`, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(1000);
        
        const links = await page.$$eval('a[href*="/oeuvres/"]', els => [...new Set(els.map(a => a.href))]);
        links.forEach(link => {
          if (!allLinks.find(l => l.url === link)) {
            allLinks.push({ url: link, category: cat });
          }
        });
        log(`${cat}: ${links.length}개`);
      } catch (e) {
        log(`${cat} 오류`);
      }
      await page.close();
    }
    
    log(`총 ${allLinks.length}개, 상세 수집...`);
    
    // 2. 상세 페이지 수집 - 2개씩 병렬
    for (let i = 0; i < allLinks.length; i += 2) {
      const batch = allLinks.slice(i, i + 2);
      
      await Promise.all(batch.map(async ({ url, category }) => {
        count++;
        const page = await context.newPage();
        
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(500);
          
          const data = await page.evaluate(() => {
            // Title - h1#page-title 또는 h1.title
            const h1 = document.querySelector('h1#page-title') || document.querySelector('h1.title');
            const title = h1 ? h1.textContent.trim() : '';
            
            // Artist - 첫 번째 의미있는 h2
            let artist = '';
            const h2s = document.querySelectorAll('h2');
            for (const h2 of h2s) {
              const txt = h2.textContent.trim();
              if (txt && txt.length < 80 && !/EXHIBITION|COLLECTION|NEWSLETTER|SITES|PLAN|LEGAL|INSCRIPTION/i.test(txt)) {
                artist = txt;
                break;
              }
            }
            
            // Date & Medium
            const bodyText = document.body.innerText;
            const dateMatch = bodyText.match(/DATE\s*:\s*(\d{4})/i);
            const year = dateMatch ? dateMatch[1] : '';
            const mediumMatch = bodyText.match(/MEDIUM\s*:\s*([^\n|]+)/i);
            const medium = mediumMatch ? mediumMatch[1].trim() : '';
            
            // Image - noscript 태그 안의 img
            let imageUrl = '';
            const noscripts = document.querySelectorAll('noscript');
            for (const ns of noscripts) {
              const match = ns.innerHTML.match(/src="([^"]+\.jpg)"/i);
              if (match) {
                imageUrl = match[1];
                break;
              }
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
          
        } catch (e) {
          artworks.push({
            id: `rouen-${count}`,
            title: 'Unknown',
            artist: 'Unknown',
            year: '', medium: '', imageUrl: '',
            sourceUrl: url,
            artworkType: category,
            museum: 'Musée des Beaux-Arts de Rouen'
          });
        }
        
        await page.close();
      }));
      
      if ((i + 2) % 20 === 0 || i + 2 >= allLinks.length) {
        log(`${Math.min(i + 2, allLinks.length)}/${allLinks.length}`);
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
      }
    }
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
    const withImage = artworks.filter(a => a.imageUrl).length;
    
    console.log('═'.repeat(60));
    console.log(`  ✅ 완료: ${artworks.length}개 (이미지: ${withImage}개)`);
    console.log('═'.repeat(60));
    
  } finally {
    await browser.close();
  }
}

scrapeRouen();
