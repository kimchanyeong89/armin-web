/**
 * MAMCS Navigart Scraper V3
 * - 정확한 CSS 셀렉터 사용:
 *   - Artist: .single-artwork-authors-ua 또는 P[0]
 *   - Title: .single-artwork-title-ua 또는 P[2]
 * - 이미지: 리스트에서 수집하거나 상세 페이지에서 찾기
 */
const { chromium } = require('playwright');
const fs = require('fs');

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

async function scrapeMAMCS(categoryKey = 'drawings', maxArtworks = 10000) {
  const cat = CATEGORIES[categoryKey];
  if (!cat) {
    console.error('Unknown category:', categoryKey);
    return;
  }
  
  console.log('═'.repeat(60));
  console.log(`  🏛️  MAMCS ${cat.type} 스크래핑 V3`);
  console.log('═'.repeat(60));
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  const artworks = [];
  
  try {
    // 1. 리스트 페이지에서 모든 작품 링크 + 이미지 수집
    let page = 1;
    let hasMore = true;
    const allItems = [];
    
    while (hasMore && allItems.length < maxArtworks) {
      const listPage = await context.newPage();
      const url = `https://www.navigart.fr/mamcs/artworks/tree_domain_all/${cat.filter}/checkbox:withimage/Avec%20image?page=${page}`;
      
      try {
        await listPage.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await listPage.waitForTimeout(2000);
        
        // 스크롤해서 이미지 로드
        for (let i = 0; i < 5; i++) {
          await listPage.evaluate(() => window.scrollBy(0, 1000));
          await listPage.waitForTimeout(500);
        }
        
        // 작품 아이템 추출 (링크 + 이미지 + 미리보기 정보)
        const items = await listPage.evaluate(() => {
          const results = [];
          // 각 작품 카드 찾기
          document.querySelectorAll('a[href*="/artwork/"]').forEach(a => {
            const href = a.href;
            if (results.find(r => r.url === href)) return;
            
            // 부모 카드에서 이미지 찾기
            const card = a.closest('div') || a.parentElement;
            let imageUrl = '';
            
            // img 태그에서 이미지 찾기
            const imgs = card ? card.querySelectorAll('img') : [];
            for (const img of imgs) {
              if (img.src && img.src.includes('images.navigart.fr')) {
                imageUrl = img.src.replace(/\/\d+\//, '/1000/');
                break;
              }
            }
            
            // 배경 이미지에서도 찾기
            if (!imageUrl && card) {
              const divs = card.querySelectorAll('div');
              for (const div of divs) {
                const bg = div.style.backgroundImage;
                if (bg && bg.includes('images.navigart.fr')) {
                  const match = bg.match(/url\(["']?([^"')]+)["']?\)/);
                  if (match) {
                    imageUrl = match[1].replace(/\/\d+\//, '/1000/');
                    break;
                  }
                }
              }
            }
            
            results.push({ url: href, imageUrl });
          });
          return results;
        });
        
        if (items.length === 0) {
          hasMore = false;
        } else {
          allItems.push(...items);
          log(`페이지 ${page}: ${items.length}개 (총 ${allItems.length}개)`);
          page++;
        }
      } catch (e) {
        log(`페이지 ${page} 오류: ${e.message}`);
        hasMore = false;
      }
      
      await listPage.close();
      
      if (allItems.length >= maxArtworks) {
        log(`${maxArtworks}개 도달!`);
        break;
      }
    }
    
    log(`총 ${allItems.length}개 링크, 상세 수집 시작...`);
    
    // 2. 상세 페이지에서 정보 추출 (3개씩 병렬)
    for (let i = 0; i < allItems.length; i += 3) {
      const batch = allItems.slice(i, i + 3);
      
      await Promise.all(batch.map(async ({ url, imageUrl: listImageUrl }) => {
        const detailPage = await context.newPage();
        
        try {
          await detailPage.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
          await detailPage.waitForTimeout(1500);
          
          // 정확한 셀렉터로 정보 추출
          const data = await detailPage.evaluate(() => {
            // Artist - 정확한 클래스 셀렉터
            let artist = '';
            const authorEl = document.querySelector('.single-artwork-authors-ua');
            if (authorEl) {
              artist = authorEl.textContent?.trim() || '';
            }
            // fallback: 첫 번째 P 태그
            if (!artist) {
              const firstP = document.querySelector('p');
              if (firstP) {
                const text = firstP.textContent?.trim() || '';
                // 이름 패턴 확인 (대문자로 시작)
                if (/^[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ]/.test(text) && text.length < 60) {
                  artist = text;
                }
              }
            }
            
            // Title - 정확한 클래스 셀렉터
            let title = '';
            const titleEl = document.querySelector('.single-artwork-title-ua');
            if (titleEl) {
              title = titleEl.textContent?.trim() || '';
            }
            // fallback: SPAN 태그 중 첫 번째
            if (!title) {
              const spans = document.querySelectorAll('span');
              for (const span of spans) {
                const text = span.textContent?.trim() || '';
                if (text && text.length > 1 && text.length < 100 && !/^\d|^©|^Inv/i.test(text)) {
                  title = text;
                  break;
                }
              }
            }
            // fallback: P[2] (보통 제목)
            if (!title) {
              const pTags = document.querySelectorAll('p');
              if (pTags[2]) {
                title = pTags[2].textContent?.trim() || '';
              }
            }
            
            // Year
            let year = '';
            const pTags = [...document.querySelectorAll('p')].map(p => p.textContent?.trim() || '');
            for (const p of pTags) {
              const yearMatch = p.match(/^(\d{4})$/);
              if (yearMatch && parseInt(yearMatch[1]) >= 1400 && parseInt(yearMatch[1]) <= 2025) {
                year = yearMatch[1];
                break;
              }
            }
            
            // Medium
            let medium = '';
            for (const p of pTags) {
              if (/huile|aquarelle|encre|crayon|pastel|gouache|toile|papier|carton|canvas|paper/i.test(p)) {
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
            
            // Image - navigart URL 찾기
            let imageUrl = '';
            const imgs = document.querySelectorAll('img');
            for (const img of imgs) {
              if (img.src && img.src.includes('images.navigart.fr')) {
                imageUrl = img.src.replace(/\/\d+\//, '/1000/');
                break;
              }
            }
            // 배경 이미지에서도 찾기
            if (!imageUrl) {
              const divs = document.querySelectorAll('div[style*="background"]');
              for (const div of divs) {
                const bg = div.style.backgroundImage;
                if (bg && bg.includes('images.navigart.fr')) {
                  const match = bg.match(/url\(["']?([^"')]+)["']?\)/);
                  if (match) {
                    imageUrl = match[1].replace(/\/\d+\//, '/1000/');
                    break;
                  }
                }
              }
            }
            
            return { title, artist, year, medium, dimensions, imageUrl };
          });
          
          // 이미지 URL fallback
          const finalImageUrl = data.imageUrl || listImageUrl || '';
          const finalTitle = data.title || 'Untitled';
          const finalArtist = data.artist || 'Unknown';
          
          if (finalImageUrl && !finalImageUrl.startsWith('data:')) {
            artworks.push({
              id: `mamcs-${categoryKey}-${artworks.length}`,
              title: finalTitle,
              artist: finalArtist,
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
          // 에러 무시
        }
        
        await detailPage.close();
      }));
      
      if ((i + 3) % 30 === 0 || i + 3 >= allItems.length) {
        log(`${Math.min(i + 3, allItems.length)}/${allItems.length} 수집 (${artworks.length}개 유효)`);
      }
    }
    
  } finally {
    await browser.close();
  }
  
  // 결과 저장
  const filename = `mamcs-strasbourg-${categoryKey}-collection.json`;
  const outputPath = `${OUTPUT_DIR}/${filename}`;
  fs.writeFileSync(outputPath, JSON.stringify(artworks, null, 2));
  
  console.log('═'.repeat(60));
  console.log(`  ✅ 완료: ${artworks.length}개`);
  console.log(`  📁 ${outputPath}`);
  console.log('═'.repeat(60));
  
  // 샘플 출력
  if (artworks.length > 0) {
    console.log('\n샘플 데이터:');
    console.log(JSON.stringify(artworks[0], null, 2));
  }
}

const category = process.argv[2] || 'drawings';
scrapeMAMCS(category);
