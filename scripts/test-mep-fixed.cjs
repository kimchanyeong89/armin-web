/**
 * MEP Collection Scraper - FIXED
 * 슬라이더에서 제목, 년도, 치수 추출
 */

const { chromium } = require('playwright');
const fs = require('fs');

const TEST_ARTISTS = [
  'https://www.mep-fr.org/les-collections/brassai/',
  'https://www.mep-fr.org/les-collections/coco-capitan/',
  'https://www.mep-fr.org/les-collections/robert-frank/'
];

async function scrapeArtistPage(browser, artistUrl) {
  console.log(`\n📸 Scraping: ${artistUrl}`);
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  try {
    await page.goto(artistUrl, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(3000);
    
    // 쿠키 배너
    try {
      const btn = await page.$('button:has-text("OK"), .accept');
      if (btn) await btn.click();
    } catch (e) {}
    
    const data = await page.evaluate(() => {
      const result = {
        artistName: '',
        artworks: []
      };
      
      // 작가 이름 (h1)
      const h1 = document.querySelector('h1');
      result.artistName = h1?.textContent?.trim() || '';
      
      // 슬라이더 슬라이드들 찾기
      const slides = document.querySelectorAll('.swiper-slide, .slide, [class*="slide"], figure');
      
      slides.forEach((slide) => {
        const img = slide.querySelector('img');
        if (!img?.src || img.src.includes('logo') || img.src.includes('icon')) return;
        
        // 캡션/텍스트 찾기
        const captionEl = slide.querySelector('figcaption, .caption, [class*="caption"], p');
        const fullText = captionEl?.textContent?.trim() || '';
        
        // "BRASSAÏ, Le rouge et le noir, 1958-1960" 형식 파싱
        // 또는 별도 라인으로 제목, 치수, 기법 등
        let title = '';
        let year = '';
        let dimensions = '';
        let medium = '';
        
        // 첫 번째 줄에서 작가명, 제목, 년도 추출
        const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
        
        if (lines.length > 0) {
          const firstLine = lines[0];
          // "ARTIST, Title, Year" 패턴
          const match = firstLine.match(/^([^,]+),\s*(.+?),\s*(\d{4}(?:-\d{4})?)/);
          if (match) {
            title = match[2].trim();
            year = match[3].trim();
          } else {
            title = firstLine;
          }
        }
        
        // 치수 찾기 (예: "80 x 54 cm")
        for (const line of lines) {
          const dimMatch = line.match(/(\d+\s*x\s*\d+\s*(?:x\s*\d+\s*)?cm)/i);
          if (dimMatch) {
            dimensions = dimMatch[1];
          }
          // 기법 (Tirage로 시작하는 줄)
          if (line.toLowerCase().includes('tirage') || line.toLowerCase().includes('print')) {
            medium = line.split(';')[0].trim();
          }
        }
        
        result.artworks.push({
          image: img.src,
          title: title || 'Untitled',
          year: year,
          dimensions: dimensions,
          medium: medium,
          fullCaption: fullText
        });
      });
      
      return result;
    });
    
    await context.close();
    
    console.log(`   ✅ ${data.artistName}: ${data.artworks.length} works`);
    data.artworks.slice(0, 2).forEach(a => {
      console.log(`      - "${a.title}" (${a.year}) ${a.dimensions}`);
    });
    
    return data;
    
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
    await context.close();
    return null;
  }
}

async function main() {
  console.log('🏛️ MEP Scraper - FIXED (with titles, years, dimensions)\n');
  
  const browser = await chromium.launch({ headless: true });
  const allArtworks = [];
  
  try {
    for (const url of TEST_ARTISTS) {
      const artistData = await scrapeArtistPage(browser, url);
      
      if (artistData && artistData.artworks.length > 0) {
        artistData.artworks.forEach((work, idx) => {
          allArtworks.push({
            id: `mep-${artistData.artistName.toLowerCase().replace(/\s+/g, '-')}-${idx + 1}`,
            title: work.title,
            artist: artistData.artistName,
            year: work.year,
            image: work.image,
            dimensions: work.dimensions,
            medium: work.medium,
            type: '2D',
            source: 'MEP',
            detailUrl: url
          });
        });
      }
    }
    
    console.log(`\n\n📊 Total: ${allArtworks.length} works`);
    
    // 샘플
    console.log('\n📋 Sample:');
    allArtworks.slice(0, 5).forEach((a, i) => {
      console.log(`   ${i+1}. "${a.title}" by ${a.artist}`);
      console.log(`      Year: ${a.year || 'N/A'}, Dim: ${a.dimensions || 'N/A'}`);
    });
    
    // 저장
    const output = {
      museum: 'Maison Européenne de la Photographie',
      museumId: 'mep',
      collectionName: 'Photography Collection',
      scrapedAt: new Date().toISOString(),
      totalObjects: allArtworks.length,
      objects: allArtworks
    };
    
    fs.writeFileSync('downloads/mep-test-fixed.json', JSON.stringify(output, null, 2));
    console.log('\n💾 Saved to downloads/mep-test-fixed.json');
    
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
