/**
 * Navigart 페이지 구조 분석
 */
const { chromium } = require('playwright');

async function analyze() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://www.navigart.fr/mamcs/artwork/francois-adam-soldats-250000000001488', {
    waitUntil: 'networkidle',
    timeout: 30000
  });
  
  await page.waitForTimeout(3000);
  
  const data = await page.evaluate(() => {
    // 모든 텍스트 노드 수집
    const textNodes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while(walker.nextNode()) {
      const text = walker.currentNode.textContent.trim();
      if (text && text.length > 1 && text.length < 100) {
        const parent = walker.currentNode.parentElement;
        textNodes.push({
          text,
          tag: parent?.tagName,
          class: parent?.className
        });
      }
    }
    
    // 특정 요소들 확인
    const h1 = document.querySelector('h1')?.textContent?.trim();
    const h2s = [...document.querySelectorAll('h2')].map(h => h.textContent?.trim());
    const links = [...document.querySelectorAll('a')].slice(0, 20).map(a => ({
      text: a.textContent?.trim()?.slice(0, 50),
      href: a.href?.slice(0, 80)
    }));
    
    // 이미지 찾기
    const imgs = [...document.querySelectorAll('img')].slice(0, 5).map(i => ({
      src: i.src?.slice(0, 100),
      alt: i.alt
    }));
    
    return { h1, h2s, links: links.slice(0, 10), imgs, textNodes: textNodes.slice(0, 30) };
  });
  
  console.log('=== Page Analysis ===');
  console.log('H1:', data.h1);
  console.log('H2s:', data.h2s);
  console.log('\n=== Images ===');
  console.log(JSON.stringify(data.imgs, null, 2));
  console.log('\n=== Text Nodes ===');
  data.textNodes.forEach(t => console.log(`[${t.tag}.${t.class}] ${t.text}`));
  
  await browser.close();
}

analyze();
