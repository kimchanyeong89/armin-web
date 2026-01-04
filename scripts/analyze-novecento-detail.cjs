/**
 * Museo Novecento 페이지 상세 분석
 */
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    console.log('🔍 Museo Novecento 상세 분석...');
    await page.goto('https://www.museonovecento.it/en/collezione/alberto-della-ragione-en/', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    await page.waitForTimeout(3000);
    
    // 페이지 전체 스크롤
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, 1000));
      await page.waitForTimeout(500);
    }
    
    const analysis = await page.evaluate(() => {
      const result = {
        artistSections: [],
        artworkItems: [],
        allLinks: []
      };
      
      // 아티스트 섹션 찾기
      document.querySelectorAll('[class*="opera"]').forEach((el, i) => {
        const h2 = el.querySelector('h2, h3, .titolo');
        const subtitle = el.querySelector('.sottotitolo, [class*="subtitle"]');
        const images = el.querySelectorAll('img');
        const links = el.querySelectorAll('a');
        
        result.artistSections.push({
          index: i,
          heading: h2?.textContent?.trim(),
          subtitle: subtitle?.textContent?.trim(),
          imageCount: images.length,
          sampleImage: images[0]?.src,
          linkCount: links.length,
          sampleLinks: Array.from(links).slice(0, 3).map(a => ({
            href: a.href,
            text: a.textContent?.trim().substring(0, 50)
          })),
          html: el.outerHTML.substring(0, 500)
        });
      });
      
      // 개별 작품 아이템
      document.querySelectorAll('article, [class*="item"], [class*="artwork"]').forEach((el, i) => {
        if (i < 10) {
          const title = el.querySelector('h2, h3, h4, .title');
          const artist = el.querySelector('.artist, .author');
          const img = el.querySelector('img');
          const link = el.querySelector('a');
          
          result.artworkItems.push({
            title: title?.textContent?.trim(),
            artist: artist?.textContent?.trim(),
            image: img?.src,
            link: link?.href
          });
        }
      });
      
      // 모든 작품 관련 링크
      document.querySelectorAll('a').forEach(a => {
        const href = a.href || '';
        if (href.includes('/opere/') || href.includes('/work/') || href.includes('/artwork/')) {
          result.allLinks.push(href);
        }
      });
      
      return result;
    });
    
    console.log('\n=== 아티스트 섹션 ===');
    analysis.artistSections.slice(0, 5).forEach(s => {
      console.log(`\n${s.index + 1}. ${s.heading || 'No heading'}`);
      console.log(`   Subtitle: ${s.subtitle || 'None'}`);
      console.log(`   Images: ${s.imageCount}`);
      console.log(`   Sample Image: ${s.sampleImage?.substring(0, 80)}`);
      console.log(`   Links: ${s.linkCount}`);
      s.sampleLinks.forEach(l => console.log(`     - ${l.href.substring(0, 60)} | ${l.text}`));
    });
    
    console.log('\n=== 작품 링크 ===');
    console.log(analysis.allLinks.slice(0, 10));
    
    // 스크린샷
    await page.screenshot({ path: 'downloads/novecento-detail-analysis.png', fullPage: true });
    
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  await browser.close();
}

main().catch(console.error);
