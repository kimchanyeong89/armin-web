/**
 * MAM Paris - Painting Collection TEST Scraper (3페이지)
 * 
 * 링크: https://www.mam.paris.fr/en/online-collections#/artworks/checkbox:withimage/Avec%20image/tree_domain_all/Peinture
 * 
 * 중요: MAM 사이트는 navigart.fr을 iframe으로 임베딩함
 * → iframe 내부로 직접 접근 필요
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.navigart.fr/mamparis/#/artworks/checkbox:withimage/Avec%20image/tree_domain_all/Peinture';
const OUTPUT_FILE = path.join(__dirname, '../downloads/mam-painting-test.json');
const FINAL_OUTPUT = path.join(__dirname, '../public/data/mam-painting-collection.json');

const TEST_PAGES = 3; // 3페이지 테스트

async function scrape() {
  console.log('🎨 MAM Paris - Painting Collection TEST (3페이지)');
  console.log('='.repeat(50));
  console.log(`테스트: ${TEST_PAGES}페이지 (약 ${TEST_PAGES * 15}개)`);
  console.log('='.repeat(50) + '\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  const artworks = [];
  
  try {
    for (let pageNum = 1; pageNum <= TEST_PAGES; pageNum++) {
      console.log(`\n📄 페이지 ${pageNum}/${TEST_PAGES}`);
      
      const pageUrl = `${BASE_URL}?page=${pageNum}&sort=random&layout=box`;
      await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(3000);
      
      // Scroll to trigger lazy loading
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
      
      // Get artwork items from the list
      const items = await page.$$eval('a[href*="/artwork/"]', elements => {
        const seen = new Set();
        return elements.filter(el => {
          if (seen.has(el.href)) return false;
          seen.add(el.href);
          return true;
        }).map(el => {
          const img = el.querySelector('img');
          let listImage = null;
          
          if (img) {
            const src = img.src || '';
            const dataSrc = img.getAttribute('data-src') || '';
            if (src.includes('navigart.fr') && !src.includes('data:image')) {
              listImage = src.replace('/400/', '/1000/');
            } else if (dataSrc.includes('navigart.fr')) {
              listImage = dataSrc.replace('/400/', '/1000/');
            }
          }
          
          return { detailUrl: el.href, listImage };
        });
      });
      
      console.log(`  ${items.length}개 항목 발견`);
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        // Navigate to detail page
        await page.goto(item.detailUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);
        
        // Scroll to trigger lazy loading
        await page.evaluate(() => window.scrollTo(0, 300));
        await page.waitForTimeout(1000);
        
        const data = await page.evaluate(() => {
          // === IMAGE ===
          let image = null;
          const imgElements = Array.from(document.querySelectorAll('img'));
          for (const img of imgElements) {
            const src = img.src || '';
            if (src.includes('images.navigart.fr') && !src.includes('data:image')) {
              image = src.replace('/400/', '/1000/').replace('/200/', '/1000/').replace('/800/', '/1000/');
              break;
            }
            const dataSrc = img.getAttribute('data-src') || '';
            if (dataSrc.includes('images.navigart.fr')) {
              image = dataSrc.replace('/400/', '/1000/').replace('/200/', '/1000/').replace('/800/', '/1000/');
              break;
            }
          }
          
          // === PARSE FROM TEXT LINES ===
          const pageText = document.body.innerText;
          const lines = pageText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          
          let artist = null;
          let title = null;
          let year = null;
          let medium = null;
          let dimensions = null;
          
          const hasDash = lines[0]?.startsWith('-') || lines[0]?.startsWith('–') || lines[0]?.startsWith('—');
          
          if (hasDash) {
            artist = lines[0].replace(/^[-–—]\s*/, '').trim();
            title = lines[1] || null;
          } else {
            artist = lines[0] || null;
            const isLifespan = lines[1] && /^\d{4}/.test(lines[1]) && /[,\-]/.test(lines[1]);
            title = isLifespan ? lines[2] : lines[1];
          }
          
          for (let i = 0; i < Math.min(lines.length, 15); i++) {
            const line = lines[i];
            if (!year && /^(vers\s+)?\d{4}$/.test(line)) {
              year = line.trim();
            }
            if (!medium && /^(Peinture|Huile|Acrylique|Tempera|Gouache|Aquarelle|Oil|Acrylic)/i.test(line)) {
              medium = line;
            }
            if (!dimensions && /^\d+[,.]?\d*\s*[x×]\s*\d+[,.]?\d*\s*cm$/i.test(line)) {
              dimensions = line;
            }
          }
          
          if (title) {
            if (/^(vers\s+)?\d{4}$/.test(title) || /^(Peinture|Huile)/i.test(title)) {
              title = null;
            }
          }
          
          return { image, artist, title, year, medium, dimensions };
        });
        
        const artwork = {
          id: `mam-painting-${artworks.length + 1}`,
          title: data.title || 'Sans titre',
          artist: data.artist || 'Artiste inconnu',
          year: data.year || null,
          image: data.image || item.listImage,
          dimensions: data.dimensions || null,
          medium: data.medium || 'Peinture',
          source: 'Musée d\'Art Moderne de Paris',
          collectionArea: 'Painting',
          detailUrl: item.detailUrl
        };
        
        artworks.push(artwork);
        process.stdout.write('✓');
      }
      
      console.log(`\n  ✅ 페이지 ${pageNum} 완료 (총 ${artworks.length}개)`);
    }
    
    // Save test results
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ 
      testDate: new Date().toISOString(),
      testPages: TEST_PAGES,
      testCount: artworks.length,
      artworks 
    }, null, 2));
    
    // Save to final output
    const finalOutput = {
      museum: 'Musée d\'Art Moderne de Paris',
      museumId: 'mam-paris',
      collectionName: 'Painting Collection',
      scrapedAt: new Date().toISOString(),
      totalObjects: artworks.length,
      coverImage: artworks[0]?.image || '',
      objects: artworks
    };
    fs.writeFileSync(FINAL_OUTPUT, JSON.stringify(finalOutput, null, 2));
    
    console.log(`\n\n✅ 테스트 완료! ${artworks.length}개 작품`);
    console.log(`📁 테스트 결과: ${OUTPUT_FILE}`);
    console.log(`📁 최종 저장: ${FINAL_OUTPUT}`);
    
    // Print summary
    console.log('\n=== 샘플 (처음 5개) ===');
    artworks.slice(0, 5).forEach((art, i) => {
      console.log(`${i + 1}. ${art.title} - ${art.artist} (${art.year || 'N/A'})`);
    });
    
  } catch (e) {
    console.error('\n❌ 오류:', e.message);
    // Save partial results
    if (artworks.length > 0) {
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ artworks, error: e.message }, null, 2));
      console.log(`💾 부분 저장: ${artworks.length}개`);
    }
  }
  
  await browser.close();
}

scrape();
