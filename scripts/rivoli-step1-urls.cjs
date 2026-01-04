/**
 * Step 1: Collect all Rivoli URLs by clicking Load More
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '../downloads/rivoli-urls.json');

(async () => {
  console.log('=== Collecting Rivoli URLs ===');
  
  const browser = await puppeteer.launch({ 
    headless: 'new', 
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  const page = await browser.newPage();
  
  console.log('Loading collection page...');
  await page.goto('https://www.castellodirivoli.org/en/collections/', { 
    waitUntil: 'networkidle2', 
    timeout: 120000 
  });
  await new Promise(r => setTimeout(r, 3000));
  
  // Click Load More repeatedly
  for (let i = 0; i < 25; i++) {
    const count = await page.evaluate(() => {
      return new Set(Array.from(document.querySelectorAll('a[href*="/opera/"]')).map(l => l.href)).size;
    });
    console.log(`Click ${i}: ${count} URLs`);
    
    const hasButton = await page.evaluate(() => {
      const btn = document.querySelector('a.btn-loadmore');
      if (btn && btn.offsetParent !== null) {
        btn.click();
        return true;
      }
      return false;
    });
    
    if (!hasButton) {
      console.log('No more Load More button');
      break;
    }
    
    await new Promise(r => setTimeout(r, 3000));
  }
  
  // Collect URLs
  const urls = await page.evaluate(() => {
    return Array.from(new Set(Array.from(document.querySelectorAll('a[href*="/opera/"]')).map(l => l.href)));
  });
  
  fs.writeFileSync(OUTPUT, JSON.stringify(urls, null, 2));
  console.log(`\nSaved ${urls.length} URLs to ${OUTPUT}`);
  
  await browser.close();
})();
