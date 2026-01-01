/**
 * Navigart 상세 페이지 구조 디버그
 */
const { chromium } = require('playwright');

async function debug() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const url = 'https://www.navigart.fr/mamcs/artwork/francois-adam-soldats-250000000001488';
  
  console.log('페이지 로딩...');
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // 전체 페이지 텍스트
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('\n=== 페이지 전체 텍스트 ===');
  console.log(bodyText.substring(0, 2000));
  
  // 모든 P 태그
  console.log('\n=== 모든 P 태그 ===');
  const pTags = await page.$$eval('p', els => els.map(e => e.textContent?.trim()).filter(t => t));
  pTags.forEach((p, i) => console.log(`P[${i}]: ${p}`));
  
  // 모든 SPAN 태그
  console.log('\n=== 주요 SPAN 태그 ===');
  const spanTags = await page.$$eval('span', els => 
    els.map(e => e.textContent?.trim()).filter(t => t && t.length < 100)
  );
  spanTags.slice(0, 20).forEach((s, i) => console.log(`SPAN[${i}]: ${s}`));
  
  // 모든 H1, H2, H3 태그
  console.log('\n=== H1-H3 태그 ===');
  const headers = await page.$$eval('h1, h2, h3', els => 
    els.map(e => ({ tag: e.tagName, text: e.textContent?.trim() }))
  );
  headers.forEach(h => console.log(`${h.tag}: ${h.text}`));
  
  // 이미지
  console.log('\n=== 이미지 URLs ===');
  const imgs = await page.$$eval('img', els => 
    els.map(e => e.src).filter(s => s && !s.startsWith('data:'))
  );
  imgs.forEach(img => console.log(img));
  
  // 주요 클래스를 가진 요소들
  console.log('\n=== 주요 클래스 요소 ===');
  const classes = ['title', 'artist', 'author', 'name', 'artwork', 'description', 'info'];
  for (const cls of classes) {
    const els = await page.$$eval(`[class*="${cls}"]`, (els, c) => 
      els.map(e => ({ class: e.className, text: e.textContent?.trim().substring(0, 100) })), cls
    );
    if (els.length > 0) {
      console.log(`\n.${cls}* 클래스:`);
      els.slice(0, 5).forEach(e => console.log(`  [${e.class}] ${e.text}`));
    }
  }
  
  await browser.close();
  console.log('\n완료!');
}

debug().catch(console.error);
