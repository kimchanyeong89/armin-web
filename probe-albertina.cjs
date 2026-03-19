
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const url = 'https://sammlungenonline.albertina.at/en/groups/paintings---sculpture/results/images?filter=namesOnlineenglisch%3APainting&page=1';
  console.log('Navigating to ' + url);
  await page.goto(url, { waitUntil: 'networkidle' });
  
  // Wait a bit
  await page.waitForTimeout(3000);
  
  // Try to find image containers. usually they have classes.
  const content = await page.evaluate(() => {
    const images = Array.from(document.querySelectorAll('img'));
    return images.map(img => ({
       src: img.src,
       alt: img.alt,
       parentClass: img.parentElement ? img.parentElement.className : 'no-parent',
       grandParentClass: img.parentElement && img.parentElement.parentElement ? img.parentElement.parentElement.className : 'no-gp'
    })).slice(0, 5);
  });
  
  console.log('Found images:', JSON.stringify(content, null, 2));

  // Check for article or links
  const links = await page.evaluate(() => {
     // broad selector
     const anchors = Array.from(document.querySelectorAll('a[href*="/objects/"]'));
     return anchors.map(a => ({
       href: a.href,
       text: a.innerText.trim()
     })).slice(0, 5);
  });
  console.log('Found object links:', JSON.stringify(links, null, 2));
  
  await browser.close();
})();
