const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  try {
    // Go to paintings search page
    console.log('Loading paintings search page...');
    await page.goto('https://cep.museepicassoparis.fr/explorer?text=&field_domaine%5Bpeintures%5D=peintures&sort-image=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    
    // Get first few links
    const links = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a[href*="/explorer/"]');
      const results = [];
      anchors.forEach(a => {
        const href = a.href;
        if (!href.includes('page=') && !href.includes('field_domaine') && 
            href !== 'https://cep.museepicassoparis.fr/explorer' &&
            !href.includes('/personne/') && !href.includes('sort-image')) {
          if (!results.includes(href)) results.push(href);
        }
      });
      return results.slice(0, 5);
    });
    
    console.log('First 5 painting links:');
    links.forEach(l => console.log(l));
    
    // Test first link
    if (links.length > 0) {
      console.log('\nTesting first link...');
      await page.goto(links[0], { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3000);
      
      const title = await page.evaluate(() => {
        const titleDiv = document.querySelector('.node__content__title .title');
        if (titleDiv) return titleDiv.textContent.trim();
        const pageTitle = document.querySelector('title');
        return pageTitle ? pageTitle.textContent.trim() : 'No title found';
      });
      console.log('Title:', title);
      
      const image = await page.evaluate(() => {
        const img = document.querySelector('img[src*="image_liste_visionneuse"]');
        return img ? img.src : 'No image';
      });
      console.log('Image:', image);
    }
    
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await browser.close();
  }
})();
