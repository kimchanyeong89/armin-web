/**
 * Ambrosiana iframe 내부 분석
 */
const { chromium } = require('playwright');

async function main() {
  console.log('🔍 Ambrosiana iframe 분석...');
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto('https://www.ambrosiana.it/en/pinacoteca-collections/#/category', { 
      waitUntil: 'domcontentloaded', 
      timeout: 60000 
    });
    await page.waitForTimeout(5000);
    
    // 모든 iframe 찾기
    const frames = page.frames();
    console.log(`프레임 수: ${frames.length}`);
    
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const url = frame.url();
      console.log(`\nFrame ${i}: ${url.substring(0, 100)}`);
      
      if (url.includes('coMwork') || url.includes('catalog') || url.includes('ambrosiana')) {
        try {
          const content = await frame.evaluate(() => {
            const images = document.querySelectorAll('img');
            const cards = document.querySelectorAll('[class*="item"], [class*="card"], [class*="photo"]');
            const links = document.querySelectorAll('a');
            
            return {
              imageCount: images.length,
              cardCount: cards.length,
              linkCount: links.length,
              sampleImages: Array.from(images).slice(0, 3).map(i => ({
                src: i.src?.substring(0, 100),
                alt: i.alt
              })),
              sampleCards: Array.from(cards).slice(0, 3).map(c => ({
                class: c.className,
                text: c.textContent?.trim().substring(0, 50)
              })),
              bodyHTML: document.body?.innerHTML?.substring(0, 500)
            };
          });
          
          if (content.imageCount > 0 || content.cardCount > 0) {
            console.log('  이미지:', content.imageCount);
            console.log('  카드:', content.cardCount);
            console.log('  샘플 이미지:', content.sampleImages);
            console.log('  샘플 카드:', content.sampleCards);
          }
        } catch (e) {
          console.log('  프레임 접근 불가:', e.message.substring(0, 50));
        }
      }
    }
    
    // 메인 페이지에서 coMwork 관련 요소 찾기
    const coMworkInfo = await page.evaluate(() => {
      const plugin = document.querySelector('.coMwork-catalog-plugin');
      if (plugin) {
        return {
          found: true,
          html: plugin.innerHTML.substring(0, 1000),
          children: plugin.children.length
        };
      }
      return { found: false };
    });
    
    console.log('\n=== coMwork Plugin ===');
    console.log(coMworkInfo);
    
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  await browser.close();
  console.log('\n✅ 완료');
}

main().catch(console.error);
