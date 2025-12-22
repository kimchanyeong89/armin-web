/**
 * MEP Collection Scraper - v2
 * 실제 페이지 구조에 맞춰 수정 (이미지 + 텍스트 블록)
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
        artistBio: '',
        artworks: []
      };
      
      // 작가 이름 (h1)
      const h1 = document.querySelector('h1');
      result.artistName = h1?.textContent?.trim() || '';
      
      // 작가 소개 (첫 번째 p)
      const intro = document.querySelector('.intro, .description, p');
      result.artistBio = intro?.textContent?.trim()?.substring(0, 300) || '';
      
      // 이미지들 찾기 - mb-xlarge 클래스를 가진 부모 안에 있음
      const images = document.querySelectorAll('img');
      
      images.forEach((img) => {
        const src = img.src || '';
        // 로고, 아이콘, GIF 등 제외
        if (!src || src.includes('logo') || src.includes('icon') || src.includes('.gif')) return;
        if (!src.includes('mep-fr.org/wp-content')) return;
        
        // 부모 요소 탐색해서 캡션 찾기
        let captionText = '';
        let parent = img.parentElement;
        
        // 여러 레벨 위로 올라가면서 텍스트 찾기
        for (let i = 0; i < 4 && parent; i++) {
          const text = parent.textContent?.trim();
          if (text && text.includes(',') && (text.includes('cm') || text.match(/\d{4}/))) {
            captionText = text;
            break;
          }
          parent = parent.parentElement;
        }
        
        if (!captionText) return;
        
        // 캡션 파싱
        // 형식: "BRASSAÏ, Le rouge et le noir, 1958-1960 \n Tirage couleur...; 80 x 54 cm x 2 cm"
        let title = '';
        let artist = '';
        let year = '';
        let dimensions = '';
        let medium = '';
        
        // 줄 단위로 분리
        const lines = captionText.split('\n').map(l => l.trim()).filter(Boolean);
        
        if (lines.length > 0) {
          const firstLine = lines[0];
          
          // "ARTIST, Title, Year" 패턴
          // 또는 "ARTIST, Title, YYYY-YYYY"
          const match = firstLine.match(/^([^,]+),\s*(.+),\s*(\d{4}(?:-\d{4})?)/);
          
          if (match) {
            artist = match[1].trim();
            title = match[2].trim();
            year = match[3].trim();
          } else {
            // 다른 패턴 시도
            const parts = firstLine.split(',').map(p => p.trim());
            if (parts.length >= 2) {
              artist = parts[0];
              title = parts[1];
              // 년도 찾기
              const yearMatch = firstLine.match(/(\d{4}(?:-\d{4})?)/);
              if (yearMatch) year = yearMatch[1];
            }
          }
        }
        
        // 치수 찾기
        for (const line of lines) {
          const dimMatch = line.match(/(\d+\s*x\s*\d+(?:\s*x\s*\d+)?\s*cm)/i);
          if (dimMatch) {
            dimensions = dimMatch[1];
          }
          // 기법 (Tirage, Print 등)
          if (line.toLowerCase().includes('tirage') || 
              line.toLowerCase().includes('print') ||
              line.toLowerCase().includes('épreuve')) {
            medium = line.split(';')[0].trim();
          }
        }
        
        // 중복 체크
        const exists = result.artworks.some(a => a.image === src);
        if (!exists && title) {
          result.artworks.push({
            image: src,
            title: title,
            artist: artist,
            year: year,
            dimensions: dimensions,
            medium: medium
          });
        }
      });
      
      return result;
    });
    
    await context.close();
    
    console.log(`   ✅ ${data.artistName}: ${data.artworks.length} works`);
    data.artworks.slice(0, 3).forEach(a => {
      console.log(`      - "${a.title}" (${a.year}) [${a.dimensions}]`);
    });
    
    return data;
    
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
    await context.close();
    return null;
  }
}

async function main() {
  console.log('🏛️ MEP Scraper v2 - Fixed structure\n');
  
  const browser = await chromium.launch({ headless: true });
  const allArtists = [];
  
  for (const url of TEST_ARTISTS) {
    const data = await scrapeArtistPage(browser, url);
    if (data) {
      allArtists.push(data);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  
  await browser.close();
  
  // 결과 저장
  const output = {
    museum: 'Maison Européenne de la Photographie',
    scrapeDate: new Date().toISOString(),
    artists: allArtists,
    totalWorks: allArtists.reduce((sum, a) => sum + a.artworks.length, 0)
  };
  
  fs.writeFileSync(
    'downloads/mep-test-v2.json',
    JSON.stringify(output, null, 2)
  );
  
  console.log(`\n\n🎉 Done! Total: ${output.totalWorks} works from ${allArtists.length} artists`);
  console.log('📄 Saved to: downloads/mep-test-v2.json');
}

main().catch(console.error);
