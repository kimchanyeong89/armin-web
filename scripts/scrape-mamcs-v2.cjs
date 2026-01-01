/**
 * MAMCS Navigart Scraper V2
 * - 페이지 구조 분석 기반으로 제대로 추출
 * - Artist: 첫 번째 P 태그
 * - Title: SPAN 태그
 * - 이미지: API 또는 img.src에서 실제 URL
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = '/Users/kietzsche/armin-web-main/public/data';

const CATEGORIES = {
  drawings: { filter: 'Dessin', type: 'Drawing' },
  paintings: { filter: 'Peinture', type: 'Painting' },
  photography: { filter: 'Photographie', type: 'Photography' },
  graphicdesign: { filter: 'Design%20graphique', type: 'Graphic Design' }
};

function log(msg) {
  const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  console.log(`[${time}] ${msg}`);
}

async function scrapeMAMCS(categoryKey = 'drawings', maxPages = 100) {
  const cat = CATEGORIES[categoryKey];
  if (!cat) {
    console.error('Unknown category:', categoryKey);
    return;
  }
  
  console.log('═'.repeat(60));
  console.log(`  🏛️  MAMCS ${cat.type} 스크래핑`);
  console.log('═'.repeat(60));
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  const artworks = [];
  
  try {
    // 1. 리스트 페이지에서 모든 작품 링크 수집
    let page = 1;
    let hasMore = true;
    const allLinks = [];
    
    while (hasMore && page <= maxPages) {
      const listPage = await context.newPage();
      const url = `https://www.navigart.fr/mamcs/artworks/tree_domain_all/${cat.filter}/checkbox:withimage/Avec%20image?page=${page}`;
      
      try {
        await listPage.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await listPage.waitForTimeout(2000);
        
        // 스크롤해서 모든 아이템 로드
        for (let i = 0; i < 3; i++) {
          await listPage.evaluate(() => window.scrollBy(0, 2000));
          await listPage.waitForTimeout(500);
        }
        
        // 작품 링크 추출
        const links = await listPage.$$eval('a[href*="/artwork/"]', els => 
          [...new Set(els.map(a => a.href).filter(h => h.includes('/artwork/')))]
        );
        
        if (links.length === 0) {
          hasMore = false;
        } else {
          // 이미지 URL도 같이 수집
          const items = await listPage.evaluate(() => {
            const results = [];
            document.querySelectorAll('a[href*="/artwork/"]').forEach(a => {
              const href = a.href;
              // 부모에서 이미지 찾기
              const parent = a.closest('div');
              const img = parent?.querySelector('img');
              let imageUrl = '';
              
              if (img && img.src && !img.src.startsWith('data:')) {
                imageUrl = img.src.replace('/400/', '/1200/');
              }
              
              // 이미 있으면 스킵
              if (!results.find(r => r.url === href)) {
                results.push({ url: href, imageUrl });
              }
            });
            return results;
          });
          
          allLinks.push(...items);
          log(`페이지 ${page}: ${items.length}개 (총 ${allLinks.length}개)`);
          page++;
        }
      } catch (e) {
        log(`페이지 ${page} 오류: ${e.message}`);
        hasMore = false;
      }
      
      await listPage.close();
      
      // 일정 수 이상이면 중단 (테스트용)
      if (allLinks.length >= 500) {
        log('500개 도달, 상세 수집 시작...');
        break;
      }
    }
    
    log(`총 ${allLinks.length}개 링크, 상세 수집 시작...`);
    
    // 2. 상세 페이지에서 정보 추출 (5개씩 병렬)
    for (let i = 0; i < allLinks.length; i += 5) {
      const batch = allLinks.slice(i, i + 5);
      
      await Promise.all(batch.map(async ({ url, imageUrl: listImageUrl }) => {
        const detailPage = await context.newPage();
        
        try {
          await detailPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await detailPage.waitForTimeout(1500);
          
          const data = await detailPage.evaluate(() => {
            // P 태그들에서 순서대로 정보 추출
            const pTags = [...document.querySelectorAll('p')].map(p => p.textContent?.trim()).filter(t => t);
            const spanTags = [...document.querySelectorAll('span')].map(s => s.textContent?.trim()).filter(t => t && t.length < 200);
            
            // Artist - 첫 번째 P 태그 (보통 이름 형식: LAST FIRST)
            let artist = 'Unknown';
            for (const p of pTags) {
              // 대문자로 시작하고 이름 패턴인 경우
              if (p && p.length > 2 && p.length < 50 && /^[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ]/.test(p)) {
                // 연도, 치수 등이 아닌지 확인
                if (!/^\d{4}|^\d+.*cm|^Inv\s*:/i.test(p)) {
                  artist = p;
                  break;
                }
              }
            }
            
            // Title - SPAN 태그에서 찾기 (보통 제목)
            let title = 'Untitled';
            for (const s of spanTags) {
              if (s && s.length > 1 && s.length < 100) {
                // ID, 저작권 등 제외
                if (!/^\d+\.\d+|^©|^Inv|^droits/i.test(s)) {
                  title = s;
                  break;
                }
              }
            }
            
            // Year - 연도 패턴 찾기
            let year = '';
            const bodyText = document.body.innerText;
            const yearMatch = bodyText.match(/(?:^|\s)(\d{4})(?:\s|$|-|–)/);
            if (yearMatch && parseInt(yearMatch[1]) >= 1400 && parseInt(yearMatch[1]) <= 2025) {
              year = yearMatch[1];
            }
            
            // Medium
            let medium = '';
            for (const p of pTags) {
              if (/huile|aquarelle|encre|crayon|pastel|gouache|oil|canvas|paper|toile/i.test(p)) {
                medium = p;
                break;
              }
            }
            
            // Dimensions
            let dimensions = '';
            for (const p of pTags) {
              if (/\d+.*x.*\d+.*cm/i.test(p)) {
                dimensions = p;
                break;
              }
            }
            
            // Image - navigart 이미지 URL
            let imageUrl = '';
            const imgs = document.querySelectorAll('img');
            for (const img of imgs) {
              if (img.src && img.src.includes('images.navigart.fr')) {
                imageUrl = img.src.replace('/400/', '/1200/').replace('/1000/', '/1200/');
                break;
              }
            }
            
            return { title, artist, year, medium, dimensions, imageUrl };
          });
          
          // 이미지 URL fallback
          const finalImageUrl = data.imageUrl || listImageUrl || '';
          
          if (finalImageUrl && !finalImageUrl.startsWith('data:')) {
            artworks.push({
              id: `mamcs-${categoryKey}-${artworks.length}`,
              title: data.title,
              artist: data.artist,
              year: data.year,
              medium: data.medium,
              dimensions: data.dimensions,
              imageUrl: finalImageUrl,
              sourceUrl: url,
              artworkType: cat.type,
              museum: 'MAMCS Strasbourg'
            });
          }
          
        } catch (e) {
          // 오류 무시
        }
        
        await detailPage.close();
      }));
      
      // 진행 로그 & 저장
      if ((i + 5) % 50 === 0 || i + 5 >= allLinks.length) {
        log(`${Math.min(i + 5, allLinks.length)}/${allLinks.length} 수집 (${artworks.length}개 유효)`);
        
        // 중간 저장
        const outputFile = path.join(OUTPUT_DIR, `mamcs-strasbourg-${categoryKey}-collection.json`);
        fs.writeFileSync(outputFile, JSON.stringify(artworks, null, 2));
      }
    }
    
    // 최종 저장
    const outputFile = path.join(OUTPUT_DIR, `mamcs-strasbourg-${categoryKey}-collection.json`);
    fs.writeFileSync(outputFile, JSON.stringify(artworks, null, 2));
    
    console.log('═'.repeat(60));
    console.log(`  ✅ 완료: ${artworks.length}개`);
    console.log(`  📁 ${outputFile}`);
    console.log('═'.repeat(60));
    
  } finally {
    await browser.close();
  }
  
  return artworks.length;
}

// 실행
const category = process.argv[2] || 'drawings';
scrapeMAMCS(category, 200);
