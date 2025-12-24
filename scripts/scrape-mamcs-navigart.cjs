/**
 * MAMCS Strasbourg - Navigart 기반 스크래핑 (공통 모듈)
 * 드로잉, 페인팅, 사진, 그래픽디자인 등 카테고리별 사용
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const LOG_DIR = path.join(__dirname, '../downloads');
const CONCURRENCY = 5;

// 카테고리 설정
const CATEGORIES = {
  drawings: {
    id: 'mamcs-strasbourg-drawings',
    name: 'MAMCS Strasbourg - Drawings',
    filter: 'Dessin',
    artworkType: 'Drawing'
  },
  paintings: {
    id: 'mamcs-strasbourg-paintings',
    name: 'MAMCS Strasbourg - Paintings',
    filter: 'Peinture',
    artworkType: 'Painting'
  },
  photography: {
    id: 'mamcs-strasbourg-photography',
    name: 'MAMCS Strasbourg - Photography',
    filter: 'Photographie',
    artworkType: 'Photography'
  },
  graphicdesign: {
    id: 'mamcs-strasbourg-graphic-design',
    name: 'MAMCS Strasbourg - Graphic Design',
    filter: 'Design%20graphique',
    artworkType: 'Graphic Design'
  }
};

const MUSEUM_INFO = {
  name: 'Musée d\'Art Moderne et Contemporain de Strasbourg',
  city: 'Strasbourg',
  country: 'France'
};

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function scrapeCategory(categoryKey, maxItems = 2000) {
  const category = CATEGORIES[categoryKey];
  if (!category) {
    console.error(`Unknown category: ${categoryKey}`);
    return;
  }
  
  console.log(`\n🏛️  ${category.name} 스크래핑 시작...`);
  console.log(`   필터: ${category.filter}`);
  
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  const artworks = [];
  let page = 1;
  let hasMore = true;
  
  try {
    while (hasMore && artworks.length < maxItems) {
      const pageUrl = `https://www.navigart.fr/mamcs/artworks/tree_domain_all/${category.filter}/checkbox:withimage/Avec%20image?page=${page}`;
      console.log(`\n📄 Page ${page} 로드 중...`);
      
      const browserPage = await context.newPage();
      await browserPage.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await delay(5000);
      
      // 스크롤하여 모든 이미지 로드
      for (let i = 0; i < 5; i++) {
        await browserPage.evaluate(() => window.scrollBy(0, 1000));
        await delay(500);
      }
      
      // 작품 데이터 추출
      const pageData = await browserPage.evaluate((artType) => {
        const items = [];
        const cards = document.querySelectorAll('a[href*="/artwork/"]');
        
        cards.forEach((card, idx) => {
          const href = card.href;
          // 이름에서 작가와 제목 추출 (URL 구조: /artwork/작가-제목-id)
          const urlParts = href.split('/artwork/')[1]?.split('?')[0] || '';
          
          // 부모 요소에서 이미지 찾기
          let img = card.querySelector('img');
          if (!img) {
            const parent = card.closest('div');
            if (parent) {
              // 같은 레벨의 이미지 찾기
              const siblingImgs = parent.parentElement?.querySelectorAll('img');
              if (siblingImgs && siblingImgs.length > idx) {
                img = siblingImgs[idx];
              }
            }
          }
          
          // 텍스트 정보 추출
          const textContent = card.textContent?.trim() || '';
          const lines = textContent.split('\n').map(l => l.trim()).filter(l => l);
          
          // 이미지 URL 파싱
          let imageUrl = img?.src || '';
          if (imageUrl.includes('images.navigart.fr')) {
            // 고화질 URL로 변환
            imageUrl = imageUrl.replace('/400/', '/1200/');
          }
          
          if (imageUrl && !imageUrl.startsWith('data:')) {
            items.push({
              sourceUrl: href,
              imageUrl,
              rawText: lines,
              artworkType: artType
            });
          }
        });
        
        return items;
      }, category.artworkType);
      
      console.log(`   ✅ ${pageData.length}개 작품 발견`);
      
      if (pageData.length === 0) {
        hasMore = false;
      } else {
        artworks.push(...pageData);
        page++;
      }
      
      await browserPage.close();
      
      // 페이지당 작품 수가 적으면 더 이상 없음
      if (pageData.length < 10) {
        hasMore = false;
      }
      
      await delay(1000); // 서버 부하 방지
    }
    
    console.log(`\n📝 ${artworks.length}개 작품 상세 정보 추출 중...`);
    
    // 상세 정보 추출 (상세 페이지 방문)
    const detailedArtworks = [];
    for (let i = 0; i < artworks.length; i += CONCURRENCY) {
      const batch = artworks.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map((artwork, j) => scrapeArtworkDetail(context, artwork, i + j, artworks.length))
      );
      results.filter(r => r).forEach(r => detailedArtworks.push(r));
      
      // 진행 상황 표시
      process.stdout.write(`\r   진행: ${Math.min(i + CONCURRENCY, artworks.length)}/${artworks.length}`);
    }
    
    console.log(`\n\n✅ ${detailedArtworks.length}개 작품 스크래핑 완료`);
    
    // 저장
    const outputData = {
      museum: MUSEUM_INFO.name,
      collection: category.name,
      artworkType: category.artworkType,
      city: MUSEUM_INFO.city,
      country: MUSEUM_INFO.country,
      scrapedAt: new Date().toISOString(),
      totalArtworks: detailedArtworks.length,
      artworks: detailedArtworks
    };
    
    const outputPath = path.join(OUTPUT_DIR, `${category.id}-collection.json`);
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    console.log(`💾 저장: ${outputPath}`);
    
    // 로그 저장
    const logPath = path.join(LOG_DIR, `${category.id}-scrape-log.json`);
    fs.writeFileSync(logPath, JSON.stringify({
      category,
      pagesScraped: page - 1,
      totalArtworks: detailedArtworks.length,
      timestamp: new Date().toISOString()
    }, null, 2));
    
  } finally {
    await browser.close();
  }
  
  return artworks.length;
}

async function scrapeArtworkDetail(context, artwork, index, total) {
  const page = await context.newPage();
  try {
    // 상세 페이지에서 추가 정보 추출
    await page.goto(artwork.sourceUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await delay(2000);
    
    const data = await page.evaluate(() => {
      let title = '';
      let artist = 'Unknown';
      let year = null;
      let medium = '';
      let dimensions = '';
      let description = '';
      
      // 제목 추출
      const titleEl = document.querySelector('h1, .artwork-title, .title');
      if (titleEl) {
        title = titleEl.textContent?.trim() || '';
      }
      
      // 작가 추출
      const artistEl = document.querySelector('.author, .artist, [class*="author"], [class*="artist"]');
      if (artistEl) {
        artist = artistEl.textContent?.trim() || 'Unknown';
      }
      
      // 메타데이터 추출
      document.querySelectorAll('.field, .meta-item, .info-item, dl dt, dl dd, .detail-item').forEach(el => {
        const text = el.textContent?.trim() || '';
        const label = (el.previousElementSibling?.textContent?.trim() || 
                      el.querySelector('label, strong')?.textContent?.trim() || '').toLowerCase();
        
        if (label.includes('date') || label.includes('année') || label.includes('year')) {
          const match = text.match(/(\d{4})/);
          if (match) year = match[1];
        }
        if (label.includes('technique') || label.includes('medium') || label.includes('matér')) {
          medium = text;
        }
        if (label.includes('dimension') || label.includes('size') || label.includes('mesure')) {
          dimensions = text;
        }
      });
      
      // 페이지 전체 텍스트에서 연도 추출 시도
      if (!year) {
        const pageText = document.body.textContent || '';
        const yearMatch = pageText.match(/(\d{4})\s*[-–]?\s*(?:\d{4})?/);
        if (yearMatch && parseInt(yearMatch[1]) >= 1400 && parseInt(yearMatch[1]) <= 2025) {
          year = yearMatch[1];
        }
      }
      
      // 고화질 이미지 찾기
      let imageUrl = '';
      const img = document.querySelector('.artwork-image img, .main-image img, .zoom img, img[src*="images.navigart"]');
      if (img) {
        imageUrl = img.src?.replace('/400/', '/1200/') || '';
      }
      
      return { title, artist, year, medium, dimensions, description, imageUrl };
    });
    
    await page.close();
    
    // URL에서 작가/제목 추출 (fallback)
    if (!data.title || data.title.length < 2) {
      const urlSlug = artwork.sourceUrl.split('/artwork/')[1]?.split('?')[0] || '';
      const parts = urlSlug.split('-');
      // 마지막 부분은 ID이므로 제외
      if (parts.length > 1) {
        parts.pop(); // ID 제거
        // 첫 2-3 단어는 보통 작가 이름
        if (parts.length > 3) {
          const artistParts = parts.slice(0, 2);
          const titleParts = parts.slice(2);
          if (data.artist === 'Unknown') {
            data.artist = artistParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
          }
          if (!data.title) {
            data.title = titleParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
          }
        }
      }
    }
    
    return {
      id: `mamcs-${index}`,
      title: data.title || 'Untitled',
      artist: data.artist || 'Unknown',
      year: data.year,
      imageUrl: data.imageUrl || artwork.imageUrl,
      medium: data.medium || '',
      dimensions: data.dimensions || '',
      artworkType: artwork.artworkType,
      description: data.description || '',
      sourceUrl: artwork.sourceUrl,
      museum: MUSEUM_INFO.name,
      city: MUSEUM_INFO.city,
      country: MUSEUM_INFO.country
    };
  } catch (e) {
    await page.close();
    // 기본 정보로 반환
    return {
      id: `mamcs-${index}`,
      title: 'Untitled',
      artist: 'Unknown',
      year: null,
      imageUrl: artwork.imageUrl,
      medium: '',
      artworkType: artwork.artworkType,
      sourceUrl: artwork.sourceUrl,
      museum: MUSEUM_INFO.name,
      city: MUSEUM_INFO.city,
      country: MUSEUM_INFO.country
    };
  }
}

// 커맨드라인 인자로 카테고리 받기
const categoryArg = process.argv[2];
if (categoryArg && CATEGORIES[categoryArg]) {
  scrapeCategory(categoryArg).catch(console.error);
} else if (categoryArg === 'all') {
  // 모든 카테고리 순차 실행
  (async () => {
    for (const key of Object.keys(CATEGORIES)) {
      await scrapeCategory(key);
      await delay(5000);
    }
  })();
} else {
  console.log('Usage: node scrape-mamcs-navigart.cjs <category>');
  console.log('Categories: drawings, paintings, photography, graphicdesign, all');
}

module.exports = { scrapeCategory, CATEGORIES };
