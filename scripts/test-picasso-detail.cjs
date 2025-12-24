const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  
  // Test a sculpture URL
  const testUrl = 'https://cep.museepicassoparis.fr/explorer/femme-aux-bras-ecartes-mp1830';
  
  console.log('Testing URL:', testUrl);
  
  try {
    await page.goto(testUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);  // Additional wait
    
    const result = await page.evaluate(() => {
      // Get current URL
      const currentUrl = window.location.href;
      
      // Title
      let title = '';
      const titleDiv = document.querySelector('.node__content__title .title');
      if (titleDiv) {
        title = titleDiv.textContent?.trim() || '';
      }
      if (!title) {
        const pageTitle = document.querySelector('title');
        if (pageTitle) {
          title = pageTitle.textContent?.trim() || '';
        }
      }
      
      // Find all images
      const allImages = Array.from(document.querySelectorAll('img')).map(img => ({
        src: img.src,
        alt: img.alt
      })).slice(0, 10);
      
      // Image
      let image = '';
      const imgSelectors = [
        'img[src*="image_liste_visionneuse"]',
        'img[src*="/sites/default/files/"]',
        'figure img',
        'article img'
      ];
      for (const sel of imgSelectors) {
        const imgEl = document.querySelector(sel);
        if (imgEl?.src && !imgEl.src.includes('logo') && !imgEl.src.includes('icon')) {
          image = imgEl.src;
          break;
        }
      }
      
      return { currentUrl, title, image, hasTitle: !!title, hasImage: !!image, allImages };
    });
    
    console.log('Result:', JSON.stringify(result, null, 2));
    console.log('Would return null?', !result.image);
    
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await browser.close();
  }
})();
