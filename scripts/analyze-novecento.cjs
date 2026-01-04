/**
 * Museo Novecento 사이트 구조 분석
 */
const { chromium } = require('playwright');

async function analyzePage(page, name, url) {
  console.log(`\n=== ${name} ===`);
  console.log(`URL: ${url}`);
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    console.log('Title:', await page.title());
    
    const analysis = await page.evaluate(() => {
      const result = {
        images: [],
        artworkCards: [],
        links: [],
        buttons: [],
        headings: []
      };
      
      // 이미지 분석
      document.querySelectorAll('img').forEach(img => {
        if (img.src && !img.src.includes('logo') && !img.src.includes('icon')) {
          result.images.push({
            src: img.src.substring(0, 120),
            alt: (img.alt || '').substring(0, 50),
            parent: img.parentElement?.className || ''
          });
        }
      });
      
      // 작품 카드 후보 찾기
      const cardSelectors = [
        '[class*="artwork"]', '[class*="opera"]', '[class*="work"]',
        '[class*="card"]', '[class*="item"]', '[class*="post"]',
        'article', '.col', '[class*="grid"] > div'
      ];
      
      cardSelectors.forEach(sel => {
        const els = document.querySelectorAll(sel);
        if (els.length > 0 && els.length < 200) {
          result.artworkCards.push({
            selector: sel,
            count: els.length,
            sample: els[0]?.textContent?.trim().substring(0, 100)
          });
        }
      });
      
      // 링크 분석
      document.querySelectorAll('a').forEach(a => {
        const href = a.href || '';
        const text = (a.textContent || '').trim();
        if (href.includes('opera') || href.includes('artwork') || href.includes('work')) {
          result.links.push({ href, text: text.substring(0, 50) });
        }
      });
      
      // 로드모어/페이지네이션
      const loadMore = document.querySelector('[class*="load"], [class*="more"], .next, [class*="pag"]');
      result.hasLoadMore = !!loadMore;
      result.loadMoreText = loadMore?.textContent?.trim().substring(0, 50);
      
      // 헤딩
      document.querySelectorAll('h1, h2, h3').forEach(h => {
        result.headings.push(h.textContent?.trim().substring(0, 80));
      });
      
      return result;
    });
    
    console.log('이미지 수:', analysis.images.length);
    console.log('이미지 샘플:', analysis.images.slice(0, 3));
    console.log('\n작품 카드 후보:');
    analysis.artworkCards.forEach(c => console.log(`  ${c.selector}: ${c.count}개`));
    console.log('\n작품 링크:', analysis.links.slice(0, 5));
    console.log('\nLoad More:', analysis.hasLoadMore, analysis.loadMoreText);
    console.log('\n헤딩:', analysis.headings.slice(0, 5));
    
    // 스크린샷
    const filename = name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    await page.screenshot({ path: `downloads/${filename}.png`, fullPage: true });
    console.log(`📸 스크린샷: downloads/${filename}.png`);
    
  } catch (e) {
    console.log('Error:', e.message);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await analyzePage(page, 'Museo Novecento - Della Ragione', 
    'https://www.museonovecento.it/en/collezione/alberto-della-ragione-en/');
  
  await analyzePage(page, 'Museo Novecento - Rosai',
    'https://www.museonovecento.it/en/collezione/ottone-rosai-en-the-collections/');
  
  await browser.close();
  console.log('\n✅ 분석 완료');
}

main().catch(console.error);
