/**
 * 4개 사이트 구조 분석 스크립트
 */

const { chromium } = require('playwright');

async function analyzeSite(page, name, url) {
  console.log(`\n=== ${name} 분석 ===`);
  console.log(`URL: ${url}`);
  
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    
    const info = await page.evaluate(() => {
      // 작품 카드 찾기
      const allElements = document.querySelectorAll('*');
      const potentialCards = [];
      
      allElements.forEach(el => {
        const cls = el.className || '';
        if (typeof cls === 'string' && 
            (cls.includes('card') || cls.includes('item') || 
             cls.includes('artwork') || cls.includes('opera') ||
             cls.includes('work') || cls.includes('grid'))) {
          potentialCards.push({
            tag: el.tagName,
            class: cls.substring(0, 80),
            childCount: el.children.length
          });
        }
      });
      
      // 이미지 분석
      const images = Array.from(document.querySelectorAll('img')).map(img => ({
        src: (img.src || '').substring(0, 100),
        alt: img.alt || ''
      })).filter(i => i.src && !i.src.includes('logo') && !i.src.includes('icon'));
      
      // 링크 분석
      const links = Array.from(document.querySelectorAll('a')).filter(a => {
        const href = a.href || '';
        return href.includes('opera') || href.includes('artwork') || 
               href.includes('work') || href.includes('piece');
      }).map(a => a.href);
      
      // 페이지네이션/로드모어
      const loadMore = document.querySelector('[class*="load"], [class*="more"], .next, .pagination');
      const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim());
      
      return {
        title: document.title,
        bodyText: document.body.textContent.substring(0, 500),
        potentialCards: potentialCards.slice(0, 10),
        imageCount: images.length,
        sampleImages: images.slice(0, 3),
        linkCount: links.length,
        sampleLinks: links.slice(0, 5),
        hasLoadMore: !!loadMore,
        buttons: buttons.slice(0, 5)
      };
    });
    
    console.log(JSON.stringify(info, null, 2));
    return info;
  } catch (e) {
    console.log(`Error: ${e.message}`);
    return null;
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const sites = [
    { name: 'Pinacoteca Ambrosiana', url: 'https://www.ambrosiana.it/en/pinacoteca-collections/#/category' },
    { name: 'Museo Novecento - Della Ragione', url: 'https://www.museonovecento.it/en/collezione/alberto-della-ragione-en/' },
    { name: 'Museo Novecento - Rosai', url: 'https://www.museonovecento.it/en/collezione/ottone-rosai-en-the-collections/' }
  ];
  
  for (const site of sites) {
    await analyzeSite(page, site.name, site.url);
  }
  
  await browser.close();
  console.log('\n✅ 분석 완료');
}

main().catch(console.error);
