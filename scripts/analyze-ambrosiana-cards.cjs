/**
 * Ambrosiana 컬렉션 상세 분석 - 작품 카드 구조 파악
 */
const { chromium } = require('playwright');

async function main() {
  console.log('🔍 Ambrosiana 작품 카드 분석...');
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto('https://www.ambrosiana.it/en/pinacoteca-collections/#/category', { 
      waitUntil: 'networkidle', 
      timeout: 60000 
    });
    await page.waitForTimeout(5000);
    
    // coMwork 플러그인 내부 분석
    const artworks = await page.evaluate(() => {
      const plugin = document.querySelector('.coMwork-catalog-plugin');
      if (!plugin) return { error: 'Plugin not found' };
      
      // 작품 아이템 찾기 - 여러 셀렉터 시도
      const selectors = [
        '.photo-item',
        '[class*="photo"]',
        '[class*="artwork"]',
        '[class*="item"]',
        '[class*="card"]',
        '.MuiCard-root',
        '[class*="grid"] > div > div'
      ];
      
      const results = {};
      
      selectors.forEach(sel => {
        const items = plugin.querySelectorAll(sel);
        if (items.length > 0) {
          results[sel] = {
            count: items.length,
            samples: Array.from(items).slice(0, 2).map(item => {
              const img = item.querySelector('img');
              const title = item.querySelector('h2, h3, h4, [class*="title"], [class*="name"]');
              const artist = item.querySelector('[class*="artist"], [class*="author"]');
              const link = item.querySelector('a');
              
              return {
                html: item.outerHTML.substring(0, 300),
                hasImage: !!img,
                imageSrc: img?.src?.substring(0, 100),
                title: title?.textContent?.trim(),
                artist: artist?.textContent?.trim(),
                link: link?.href
              };
            })
          };
        }
      });
      
      // 전체 HTML 구조 일부
      const gridContainer = plugin.querySelector('[class*="grid"], [class*="container"], [class*="list"]');
      
      return {
        results,
        pluginHTML: plugin.innerHTML.substring(0, 2000),
        gridHTML: gridContainer?.outerHTML?.substring(0, 1000)
      };
    });
    
    console.log('\n=== 셀렉터 분석 결과 ===');
    if (artworks.results) {
      Object.entries(artworks.results).forEach(([sel, data]) => {
        console.log(`\n${sel}: ${data.count}개`);
        data.samples.forEach((s, i) => {
          console.log(`  Sample ${i+1}:`);
          console.log(`    Image: ${s.imageSrc || 'N/A'}`);
          console.log(`    Title: ${s.title || 'N/A'}`);
          console.log(`    Artist: ${s.artist || 'N/A'}`);
          console.log(`    Link: ${s.link || 'N/A'}`);
        });
      });
    }
    
    // 스크린샷
    await page.screenshot({ path: 'downloads/ambrosiana-collection.png', fullPage: true });
    console.log('\n📸 스크린샷 저장됨');
    
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  await browser.close();
}

main().catch(console.error);
