/**
 * Ambrosiana 작품 상세 페이지 분석
 */
const { chromium } = require('playwright');

async function main() {
  console.log('🔍 Ambrosiana 상세 페이지 분석...');
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    // 상세 페이지로 직접 이동
    const detailUrl = 'https://www.ambrosiana.it/en/pinacoteca-collections/#/dettaglio/f893635c-1ca7-4ed8-95ac-9fdc91fbd99a';
    console.log('URL:', detailUrl);
    
    await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    
    const details = await page.evaluate(() => {
      const plugin = document.querySelector('.coMwork-catalog-plugin');
      if (!plugin) return { error: 'Plugin not found' };
      
      // 모든 텍스트 요소 분석
      const allText = [];
      plugin.querySelectorAll('h1, h2, h3, h4, p, span, div').forEach(el => {
        const text = el.textContent?.trim();
        if (text && text.length > 2 && text.length < 200 && !text.includes('\n')) {
          allText.push({
            tag: el.tagName,
            class: el.className?.substring?.(0, 50) || '',
            text
          });
        }
      });
      
      // 이미지 찾기
      const images = [];
      plugin.querySelectorAll('img').forEach(img => {
        if (img.src && !img.src.includes('icon') && !img.src.includes('logo')) {
          images.push({
            src: img.src,
            alt: img.alt
          });
        }
      });
      
      // 특정 필드 셀렉터 시도
      const fields = {};
      const labelSelectors = [
        '[class*="label"]', '[class*="field"]', 'dt', 'th',
        '[class*="key"]', '[class*="property"]'
      ];
      
      labelSelectors.forEach(sel => {
        const els = plugin.querySelectorAll(sel);
        els.forEach(el => {
          const label = el.textContent?.trim();
          const value = el.nextElementSibling?.textContent?.trim();
          if (label && value) {
            fields[label] = value;
          }
        });
      });
      
      return { allText: allText.slice(0, 30), images, fields, html: plugin.innerHTML.substring(0, 3000) };
    });
    
    console.log('\n=== 이미지 ===');
    console.log(details.images);
    
    console.log('\n=== 텍스트 요소 ===');
    details.allText?.forEach(t => {
      console.log(`  ${t.tag} (${t.class}): ${t.text.substring(0, 80)}`);
    });
    
    console.log('\n=== 필드 ===');
    console.log(details.fields);
    
    // 스크린샷
    await page.screenshot({ path: 'downloads/ambrosiana-detail.png', fullPage: true });
    console.log('\n📸 스크린샷 저장: downloads/ambrosiana-detail.png');
    
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  await browser.close();
}

main().catch(console.error);
