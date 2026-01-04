const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  
  // Check Napoli - look for artwork detail pages
  console.log('Loading Napoli on-display page...');
  await page.goto('https://www.museoarcheologiconapoli.it/en/portfolio-category/on-display/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  
  await page.waitForTimeout(2000);
  
  // Get all portfolio links (these are collections)
  const collections = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="portfolio-item"]');
    return Array.from(new Set(Array.from(links).map(a => a.href)));
  });
  
  console.log('Collections found:', collections);
  
  // Now check if Farnese page has individual artworks
  console.log('\nChecking Farnese collection for artwork items...');
  await page.goto('https://www.museoarcheologiconapoli.it/en/portfolio-item/farnese-collection/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  
  // Scroll the page
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
  }
  
  const pageData = await page.evaluate(() => {
    // Get all anchor tags
    const allLinks = Array.from(document.querySelectorAll('a'));
    const uniqueHrefs = [...new Set(allLinks.map(a => a.href))];
    
    // Get all image sources
    const allImgs = Array.from(document.querySelectorAll('img'));
    const imgSrcs = allImgs.map(img => img.src).filter(s => s.includes('uploads'));
    
    // Get full page text
    const bodyText = document.body.innerText;
    
    return {
      links: uniqueHrefs.filter(h => h.includes('museoarcheologiconapoli')).slice(0, 30),
      images: imgSrcs.slice(0, 20),
      textSample: bodyText.substring(0, 3000)
    };
  });
  
  console.log('\nAll links on Farnese page:');
  pageData.links.forEach(l => console.log('  ', l));
  
  console.log('\nImages:');
  pageData.images.forEach(i => console.log('  ', i));
  
  console.log('\nPage text sample:');
  console.log(pageData.textSample);
  
  await browser.close();
})();
