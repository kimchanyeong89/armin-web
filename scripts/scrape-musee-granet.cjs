/**
 * Musée Granet Scraper
 * 컬렉션별 갤러리 이미지+캡션 추출
 * TYPO3 기반 CMS, 정적 HTML
 */
const { chromium } = require('playwright');
const fs = require('fs');

const OUTPUT_DIR = '/Users/kietzsche/armin-web-main/public/data';
const OUTPUT_FILE = `${OUTPUT_DIR}/musee-granet-collection.json`;
const BASE_URL = 'https://www.museegranet-aixenprovence.fr';

// 7개 컬렉션 페이지
const COLLECTION_PAGES = [
  { 
    url: '/en/collections/collections/french-northern-european-and-italian-painting-of-the-14th-18th-centuries',
    category: '14th-18th Century Painting'
  },
  { 
    url: '/en/collections/collections/french-19th-century-painting-granet-ingres-provencal-painting',
    category: '19th Century French Painting'
  },
  { 
    url: '/en/collections/collections/cezanne-at-the-musee-granet',
    category: 'Cézanne'
  },
  { 
    url: '/en/collections/collections/from-cezanne-to-giacometti',
    category: 'From Cézanne to Giacometti'
  },
  { 
    url: '/en/collections/collections/granet-xxth-jean-planque-collection',
    category: 'Granet XXth - Jean Planque'
  },
  { 
    url: '/en/collections/collections/sculpture-gallery',
    category: 'Sculpture'
  },
  { 
    url: '/en/collections/collections/archaeology',
    category: 'Archaeology'
  }
];

function log(msg) {
  const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  console.log(`[${time}] ${msg}`);
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeMuseeGranet(testMode = false) {
  console.log('═'.repeat(60));
  console.log(`  🎨 Musée Granet 스크래핑`);
  console.log(`  ${testMode ? '🧪 테스트 모드 (2개 컬렉션만)' : '🚀 전체 모드'}`);
  console.log('═'.repeat(60));
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  const allArtworks = [];
  const collections = testMode ? COLLECTION_PAGES.slice(0, 2) : COLLECTION_PAGES;
  
  try {
    for (const collection of collections) {
      log(`📂 ${collection.category} 스크래핑 중...`);
      
      const page = await context.newPage();
      
      try {
        await page.goto(BASE_URL + collection.url, { waitUntil: 'networkidle', timeout: 30000 });
        await delay(2000);
        
        // 갤러리 슬라이드에서 작품 정보 추출
        const artworks = await page.evaluate((category) => {
          const results = [];
          
          // c-slide-show__slide 안의 figure 요소들
          const slides = document.querySelectorAll('.c-slide-show__slide');
          slides.forEach((slide, idx) => {
            const img = slide.querySelector('img');
            const titleEl = slide.querySelector('.c-slide-show__media-title');
            const captionEl = slide.querySelector('.c-slide-show__media-caption');
            
            if (img) {
              let imageUrl = img.src || '';
              // 원본 크기 이미지로 변환 (processed 폴더에서)
              if (imageUrl.includes('_processed_')) {
                // 이미 처리된 이미지, 더 큰 버전 시도
              }
              // 상대 경로를 절대 경로로
              if (imageUrl.startsWith('/')) {
                imageUrl = 'https://www.museegranet-aixenprovence.fr' + imageUrl;
              }
              
              let title = titleEl ? titleEl.textContent.trim() : '';
              const caption = captionEl ? captionEl.textContent.trim() : '';
              
              // 캡션에서 정보 추출
              let artist = '';
              let year = '';
              let medium = '';
              let dimensions = '';
              
              // 작가 추출: "Paul Cezanne (1839-1906)" 또는 "Paul Cezanne," 패턴
              // 생몰년은 제거하고 작가명만 추출
              const artistMatch = caption.match(/^([A-Za-zÀ-ÿ\s'-]+?)(?:\s*\([^)]+\))?(?:\s*[-–,])/);
              if (artistMatch) {
                artist = artistMatch[1].trim();
              }
              
              // title이 없으면 caption에서 제목 추출
              // 패턴: "작가명, 제목, 연도, ..." 또는 "작가명 (생몰년), 제목, ..."
              if (!title) {
                // "Paul Cezanne, La Montagne Sainte-Victoire, 1897, huile sur toile..."
                // "Paul Cezanne (1839-1906), vers 1895, huile sur toile..." (제목 없는 경우)
                const captionParts = caption.split(',').map(p => p.trim());
                
                if (captionParts.length >= 2) {
                  // 두 번째 부분이 연도인지 확인
                  const secondPart = captionParts[1];
                  const isYear = /^(vers\s+)?\d{4}/.test(secondPart);
                  const isMedium = /(huile|oil|bronze|marble|aquarelle|gouache)/i.test(secondPart);
                  
                  if (!isYear && !isMedium) {
                    // 두 번째 부분이 제목
                    title = secondPart;
                  }
                }
              }
              
              // 연도 추출
              const yearMatch = caption.match(/\b(vers\s+)?(1[4-9]\d{2}|20[0-2]\d)\b/);
              if (yearMatch) {
                year = yearMatch[2] || yearMatch[1];
              }
              
              // 재료 추출: "Huile sur toile" 등
              const mediumMatch = caption.match(/(Huile sur toile|Oil on canvas|Bronze|Marble|huile sur toile|aquarelle|gouache|encre|crayon)/i);
              if (mediumMatch) {
                medium = mediumMatch[1];
              }
              
              // 크기 추출 - 더 정확한 패턴
              const dimMatch = caption.match(/(\d+[,.]?\d*)\s*(?:cm)?\s*[x×]\s*(\d+[,.]?\d*)\s*cm/i);
              if (dimMatch) {
                dimensions = `${dimMatch[1]} x ${dimMatch[2]} cm`;
              } else {
                // "91 cm x 133,8 cm" 패턴
                const dimMatch2 = caption.match(/(\d+[,.]?\d*)\s*cm\s*[x×]\s*(\d+[,.]?\d*)\s*cm/i);
                if (dimMatch2) {
                  dimensions = `${dimMatch2[1]} x ${dimMatch2[2]} cm`;
                }
              }
              
              // 제목에서 연도 정보 분리
              let cleanTitle = title || 'Untitled';
              let extractedYear = year;
              
              // 제목 끝 패턴: ", 1875-1876" 또는 ", 1840"
              const titleEndYearMatch = cleanTitle.match(/,\s*(vers\s+)?(\d{4}(?:-\d{4})?)\s*$/);
              if (titleEndYearMatch) {
                if (!extractedYear) extractedYear = titleEndYearMatch[2];
                cleanTitle = cleanTitle.replace(/,\s*(vers\s+)?\d{4}(?:-\d{4})?\s*$/, '').trim();
              }
              
              // 제목 중간 패턴: "Henri IV (1553-1610), roi de France" - 생몰년은 유지
              // 제목 끝 패턴: "..., 17e siècle" - 세기 표현은 유지
              
              // "vers 1807-1809" 패턴 (끝에)
              const versMatch = cleanTitle.match(/,?\s*vers\s+\d{4}(?:-\d{4})?\s*$/i);
              if (versMatch) {
                cleanTitle = cleanTitle.replace(/,?\s*vers\s+\d{4}(?:-\d{4})?\s*$/i, '').trim();
              }
              
              results.push({
                title: cleanTitle,
                artist,
                year: extractedYear,
                medium,
                dimensions,
                imageUrl,
                caption,
                category
              });
            }
          });
          
          // 갤러리 그리드에서도 추출 (일부 페이지)
          const galleryImages = document.querySelectorAll('.c-gallery__media');
          galleryImages.forEach((img, idx) => {
            // 이미 슬라이드에서 추출한 것과 중복 방지
            const imageUrl = img.src;
            const alreadyExists = results.some(r => r.imageUrl === imageUrl);
            if (!alreadyExists && imageUrl) {
              const fullUrl = imageUrl.startsWith('/') ? 
                'https://www.museegranet-aixenprovence.fr' + imageUrl : imageUrl;
              
              results.push({
                title: img.alt || img.title || 'Untitled',
                artist: '',
                year: '',
                medium: '',
                dimensions: '',
                imageUrl: fullUrl,
                caption: '',
                category
              });
            }
          });
          
          return results;
        }, collection.category);
        
        // ID 할당 및 추가
        artworks.forEach(artwork => {
          allArtworks.push({
            id: `granet-${allArtworks.length}`,
            ...artwork,
            sourceUrl: BASE_URL + collection.url,
            museum: 'Musée Granet'
          });
        });
        
        log(`  ✓ ${artworks.length}개 작품 발견`);
        
      } catch (e) {
        log(`  ✗ 오류: ${e.message}`);
      }
      
      await page.close();
      await delay(2000);
    }
    
    // 저장
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allArtworks, null, 2));
    
    console.log('═'.repeat(60));
    console.log(`  ✅ 완료: ${allArtworks.length}개`);
    console.log(`  📁 ${OUTPUT_FILE}`);
    console.log('═'.repeat(60));
    
    // 카테고리별 통계
    const stats = {};
    allArtworks.forEach(a => {
      stats[a.category] = (stats[a.category] || 0) + 1;
    });
    console.log('\n📊 카테고리별 통계:');
    Object.entries(stats).forEach(([cat, count]) => {
      console.log(`  ${cat}: ${count}개`);
    });
    
    // 샘플 출력
    if (allArtworks.length > 0) {
      console.log('\n샘플 데이터:');
      console.log(JSON.stringify(allArtworks[0], null, 2));
    }
    
  } catch (error) {
    console.error('스크래핑 오류:', error);
  } finally {
    await browser.close();
  }
  
  return allArtworks;
}

// 실행
const testMode = process.argv.includes('--test');
scrapeMuseeGranet(testMode);
