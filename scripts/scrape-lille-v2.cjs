/**
 * Lille Palais des Beaux-Arts Scraper V2
 * 
 * 릴 미술관 제대로 스크래핑
 * - 각 카테고리별 페이지네이션 처리
 * - 작품 상세 페이지에서 작가, 이미지, 연도 추출
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/lille-pba.json');

const CATEGORIES = [
  { name: '16th-20th-century-Paintings', url: 'https://pba.lille.fr/en/Collections/Highlights/16th-20th-century-Paintings' },
  { name: 'Antiquity', url: 'https://pba.lille.fr/en/Collections/Highlights/Antiquity' },
  { name: 'Middle-Ages-Renaissance', url: 'https://pba.lille.fr/en/Collections/Highlights/Middle-Ages-Renaissance' },
  { name: 'Ceramics-and-Decorative-Arts', url: 'https://pba.lille.fr/en/Collections/Highlights/Ceramics-and-Decorative-Arts' },
  { name: 'Drawings', url: 'https://pba.lille.fr/en/Collections/Highlights/Drawings-and-photographies' },
  { name: 'Relief-maps', url: 'https://pba.lille.fr/en/Collections/Highlights/Relief-maps' },
  { name: 'Sculptures', url: 'https://pba.lille.fr/en/Collections/Highlights/19th-century-sculptures' },
  { name: 'Medals', url: 'https://pba.lille.fr/en/Collections/Highlights/Medals-and-medallions' }
];

const timestamp = () => {
  const now = new Date();
  return `[${now.getHours()}시 ${now.getMinutes()}분 ${now.getSeconds()}초]`;
};

async function scrapeCategory(browser, category) {
  const page = await browser.newPage();
  const artworks = [];
  let offset = 0;
  let consecutiveEmpty = 0;
  
  console.log(`${timestamp()} [${category.name}] 수집 시작...`);
  
  while (consecutiveEmpty < 2) {
    const url = offset === 0 ? category.url : `${category.url}/(offset)/${offset}`;
    
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(2000);
      
      // 작품 링크 수집
      const artworkLinks = await page.evaluate((catName) => {
        return [...document.querySelectorAll('a[href]')]
          .map(a => ({ text: a.textContent?.trim(), href: a.href }))
          .filter(l => {
            const parts = l.href.split('/');
            // 카테고리 내의 작품 링크인지 확인 (마지막 부분이 작품 슬러그)
            return l.href.includes('/Highlights/') && 
                   parts.length > 6 && 
                   !l.href.includes('(offset)') &&
                   !l.href.includes('switchlanguage') &&
                   !l.href.includes('facebook') &&
                   !l.href.includes('twitter');
          });
      }, category.name);
      
      // 중복 제거
      const uniqueLinks = [...new Map(artworkLinks.map(l => [l.href, l])).values()];
      
      if (uniqueLinks.length === 0) {
        consecutiveEmpty++;
        console.log(`${timestamp()} [${category.name}]    Page ${offset/16 + 1}: 0개 (빈 ${consecutiveEmpty}/2)`);
      } else {
        consecutiveEmpty = 0;
        console.log(`${timestamp()} [${category.name}]    Page ${offset/16 + 1}: ${uniqueLinks.length}개 링크 발견`);
        
        // 각 작품 상세 페이지 방문
        for (const link of uniqueLinks) {
          try {
            await page.goto(link.href, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(1000);
            
            const artworkData = await page.evaluate(() => {
              // 제목
              const h1 = document.querySelector('h1');
              let title = h1?.textContent?.trim() || '';
              // "Cookies" 등 잘못된 제목 필터링
              if (title.toLowerCase() === 'cookies') {
                const headings = [...document.querySelectorAll('h1, h2, .title')];
                for (const h of headings) {
                  const t = h.textContent?.trim();
                  if (t && t.toLowerCase() !== 'cookies' && t.length > 2) {
                    title = t;
                    break;
                  }
                }
              }
              
              // 작가 정보 (작품 페이지 구조에서)
              const bodyText = document.body.innerText;
              const artistMatch = bodyText.match(/\n([A-Z][a-zà-ÿ]+(?: [A-Za-zà-ÿ'-]+)+)\n(\d{4})\s*[-–]\s*(\d{4})/);
              let artist = '';
              let birthYear = '';
              let deathYear = '';
              
              if (artistMatch) {
                artist = artistMatch[1].trim();
                birthYear = artistMatch[2];
                deathYear = artistMatch[3];
              }
              
              // 연도 (작품 제작년도)
              const yearMatch = bodyText.match(/\n(\d{4})\n/g);
              let year = '';
              if (yearMatch && yearMatch.length > 0) {
                // 마지막 4자리 숫자가 아닌, 작가 수명 다음에 오는 연도
                const years = yearMatch.map(y => parseInt(y.trim()));
                year = years.find(y => y > 1000 && y < 2025 && y !== parseInt(birthYear) && y !== parseInt(deathYear)) || '';
              }
              
              // 이미지
              const images = [...document.querySelectorAll('img')]
                .map(img => img.src)
                .filter(src => src && 
                  src.includes('artwork') || 
                  src.includes('oeuvre') ||
                  src.includes('storage/images'));
              const image = images[0] || '';
              
              // 매체
              const mediumMatch = bodyText.match(/(Oil on canvas|Oil on wood|Bronze|Marble|Ceramic|Watercolor|Pencil|Pastel|Gouache|Tempera|Fresco|Alabaster|Terracotta|Porcelain)/i);
              const medium = mediumMatch ? mediumMatch[1] : '';
              
              // 장소
              const placeMatch = bodyText.match(/\n([A-Za-z]+)\n(Belgium|France|Italy|Netherlands|Germany|Spain|England)/);
              const place = placeMatch ? `${placeMatch[1]}, ${placeMatch[2]}` : '';
              
              return {
                title,
                artist,
                birthYear,
                deathYear,
                year: year ? String(year) : '',
                image,
                medium,
                place
              };
            });
            
            if (artworkData.title && artworkData.title.toLowerCase() !== 'cookies') {
              artworks.push({
                title: artworkData.title,
                artist: artworkData.artist || 'Unknown',
                year: artworkData.year,
                imageUrl: artworkData.image,
                sourceUrl: link.href,
                medium: artworkData.medium,
                artworkType: category.name,
                museum: 'Palais des Beaux-Arts de Lille'
              });
            }
          } catch (err) {
            console.log(`${timestamp()} [${category.name}]    상세 페이지 오류: ${link.href.slice(-30)}`);
          }
        }
        
        console.log(`${timestamp()} [${category.name}]    누적 ${artworks.length}개`);
      }
      
      offset += 16;
      
    } catch (err) {
      console.log(`${timestamp()} [${category.name}] 페이지 오류:`, err.message);
      break;
    }
  }
  
  await page.close();
  console.log(`${timestamp()} [${category.name}] ✅ 완료: ${artworks.length}개`);
  return artworks;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🏛️  Lille Palais des Beaux-Arts Scraper V2');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  시작: ${new Date().toLocaleString()}`);
  console.log('───────────────────────────────────────────────────────────────\n');
  
  const browser = await chromium.launch({ headless: true });
  const allArtworks = [];
  
  // 순차적으로 카테고리 수집 (사이트 부하 방지)
  for (const category of CATEGORIES) {
    const artworks = await scrapeCategory(browser, category);
    allArtworks.push(...artworks);
  }
  
  await browser.close();
  
  // 중복 제거
  const unique = [...new Map(allArtworks.map(a => [a.sourceUrl, a])).values()];
  
  // 저장
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(unique, null, 2));
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  ✅ 스크래핑 완료!');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  총: ${unique.length}개`);
  console.log(`  저장: ${OUTPUT_FILE}`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
