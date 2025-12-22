/**
 * Debug MAM detail page structure
 */

const { chromium } = require('playwright');

async function debug() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  // Test with the Soutine painting
  const url = 'https://www.navigart.fr/mamparis/artwork/portrait-de-monsieur-almenar-180000000005964';
  
  console.log('Loading:', url);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  
  const data = await page.evaluate(() => {
    // Get all text in left sidebar
    const leftSidebar = document.querySelector('.notice-left, .artwork-details, aside, [class*="notice"]');
    
    const result = {
      bodyText: document.body.innerText.slice(0, 3000),
      classes: []
    };
    
    // Find all elements with class names
    document.querySelectorAll('[class]').forEach(el => {
      if (el.className && typeof el.className === 'string') {
        el.className.split(' ').forEach(c => {
          if (c && !result.classes.includes(c)) {
            result.classes.push(c);
          }
        });
      }
    });
    
    // Get specific text from structured areas
    const notices = document.querySelectorAll('[class*="notice"], [class*="artwork"], [class*="detail"]');
    result.noticeTexts = Array.from(notices).slice(0, 5).map(n => ({
      class: n.className,
      text: n.innerText?.slice(0, 500)
    }));
    
    // Find images
    result.images = Array.from(document.querySelectorAll('img')).map(img => ({
      src: img.src,
      class: img.className,
      alt: img.alt
    })).filter(i => i.src && !i.src.includes('logo') && !i.src.includes('icon'));
    
    return result;
  });
  
  console.log('\n=== Classes found ===');
  console.log(data.classes.filter(c => c.match(/notice|artwork|detail|title|author|artist|image/i)).join(', '));
  
  console.log('\n=== Notice elements ===');
  data.noticeTexts.forEach((n, i) => {
    console.log(`\n[${i}] ${n.class}:`);
    console.log(n.text);
  });
  
  console.log('\n=== Images ===');
  data.images.forEach(i => console.log(i.src));
  
  await page.waitForTimeout(10000);
  await browser.close();
}

debug();
