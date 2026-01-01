/**
 * FLV 상세 페이지 구조 분석
 */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  await page.goto('https://www.fondationlouisvuitton.fr/en/collection/artworks/angelo-soliman', {
    waitUntil: 'networkidle2',
    timeout: 60000
  });
  
  await new Promise(r => setTimeout(r, 3000));
  
  const html = await page.content();
  fs.writeFileSync('/tmp/flv-detail.html', html);
  console.log('저장: /tmp/flv-detail.html');
  
  // 구조 분석
  const info = await page.evaluate(() => {
    const classes = new Set();
    document.querySelectorAll('[class]').forEach(el => {
      el.className.split(' ').forEach(c => {
        if (c.includes('title') || c.includes('artist') || c.includes('work') || 
            c.includes('name') || c.includes('date') || c.includes('info')) {
          classes.add(c);
        }
      });
    });
    
    // 주요 텍스트 요소
    const h1 = document.querySelector('h1')?.textContent?.trim();
    const h2s = Array.from(document.querySelectorAll('h2')).map(h => h.textContent.trim());
    
    return {
      classes: Array.from(classes),
      h1,
      h2s
    };
  });
  
  console.log('클래스:', info.classes);
  console.log('H1:', info.h1);
  console.log('H2s:', info.h2s);
  
  await browser.close();
})();
