/**
 * Rouen MBA Scraper V6
 * - 14개 카테고리 전체
 * - 이미지 추출 수정 (og:image 또는 썸네일)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = '/Users/kietzsche/armin-web-main/public/data/rouen-mba.json';

// 14개 전체 카테고리
const CATEGORIES = [
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
  'the-drawing-collection',
  'sculpture',
  'who-owns-these-paintings'
];

function log(msg) {
  const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  console.log(`[${time}] ${msg}`);
}

async function scrapeRouen() {
  console.log('═'.repeat(60));
  console.log('  🏛️  Rouen MBA Scraper V6 - 14개 카테고리');
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
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(1500);
        
        const links = await page.$$eval('a[href*="/oeuvres/"]', els => 
          [...new Set(els.map(a => a.href))]
        );
        
        links.forEach(link => {
          if (!allLinks.find(l => l.url === link)) {
            allLinks.push({ url: link, category: cat });
          }
        });
        
        log(`${cat}: ${links.length}개`);
      } catch (e) {
        log(`${cat} 오류: ${e.message}`);
      }
      
      await page.close();
    }
    
    log(`총 ${allLinks.length}개 작품, 상세 수집 시작...`);
    
    // 2. 각 작품 상세 페이지 - 3개씩 병렬 처리
    const batchSize = 3;
    for (let i = 0; i < allLinks.length; i += batchSize) {
      const batch = allLinks.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async ({ url, category }) => {
        count++;
        const page = await context.newPage();
        
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(800);
          
          const data = await page.evaluate(() => {
            // Title
            let title = '';
            const h1 = document.querySelector('h1');
            if (h1) title = h1.textContent.trim();
            
            // Artist - content 영역의 h2
            let artist = '';
            const contentH2s = document.querySelectorAll('.node-content h2, .field-group-format h2');
            for (const h2 of contentH2s) {
              const txt = h2.textContent.trim();
              if (txt && txt.length < 100 && !/EXHIBITION|COLLECTION|NEWSLETTER|SITE|PLAN|LEGAL/i.test(txt)) {
                artist = txt;
                break;
              }
            }
            // 폴백: 첫 번째 h2
            if (!artist) {
              const firstH2 = document.querySelector('h2');
              if (firstH2) {
                const txt = firstH2.textContent.trim();
                if (txt.length < 100) artist = txt;
              }
            }
            
            // Date & Medium
            let year = '';
            let medium = '';
            const bodyText = document.body.innerText;
            const dateMatch = bodyText.match(/DATE\s*:\s*(\d{4})/i);
            if (dateMatch) year = dateMatch[1];
            const mediumMatch = bodyText.match(/MEDIUM\s*:\s*([^\n|]+)/i);
            if (mediumMatch) medium = mediumMatch[1].trim();
            
            // Image - 우선순위: og:image > 컬렉션 썸네일 > 기타
            let imageUrl = '';
            
            // 1. og:image
            const ogImage = document.querySelector('meta[property="og:image"]');
            if (ogImage && ogImage.content) {
              imageUrl = ogImage.content;
            }
            
            // 2. 컬렉션 페이지의 썸네일 이미지
            if (!imageUrl) {
              const mainImg = document.querySelector('.field-name-field-oeuvre-image img');
              if (mainImg && mainImg.src) imageUrl = mainImg.src;
            }
            
            // 3. 아트워크 이미지
            if (!imageUrl) {
              const artImg = document.querySelector('.artwork-image img, .oeuvre-image img');
              if (artImg && artImg.src) imageUrl = artImg.src;
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
          // 오류 시에도 기본 정보 저장
          artworks.push({
            id: `rouen-${count}`,
            title: 'Unknown',
            artist: 'Unknown',
            year: '',
            medium: '',
            imageUrl: '',
            sourceUrl: url,
            artworkType: category,
            museum: 'Musée des Beaux-Arts de Rouen'
          });
        }
        
        await page.close();
      }));
      
      // 진행 상황 로그 & 중간 저장
      if ((i + batchSize) % 30 === 0 || i + batchSize >= allLinks.length) {
        log(`${Math.min(i + batchSize, allLinks.length)}/${allLinks.length} 수집`);
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
      }
    }
    
    // 최종 저장
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
    
    // 이미지 있는 개수 확인
    const withImage = artworks.filter(a => a.imageUrl).length;
    
    console.log('═'.repeat(60));
    console.log(`  ✅ 완료: ${artworks.length}개 (이미지: ${withImage}개)`);
    console.log('═'.repeat(60));
    
  } catch (e) {
    console.error('오류:', e);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
  } finally {
    await browser.close();
  }
}

scrapeRouen();
