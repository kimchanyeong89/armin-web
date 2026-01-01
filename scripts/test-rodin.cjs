const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  try {
    console.log('Loading list page...');
    await page.goto('https://collections.musee-rodin.fr/page/peintures/66615c6ab358e62d33dee7c9?v=mosaic&pgn=0', { waitUntil: 'networkidle2', timeout: 60000 });
    
    const urls = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="/document/"]');
      const results = [];
      links.forEach(link => {
        const href = link.getAttribute('href');
        if (href && href.includes('/document/')) {
          const urlParts = href.split('?')[0];
          const fullUrl = urlParts.startsWith('http') ? urlParts : 'https://collections.musee-rodin.fr' + urlParts;
          if (results.indexOf(fullUrl) === -1) results.push(fullUrl);
        }
      });
      return results;
    });
    
    console.log('Found', urls.length, 'artworks:');
    urls.slice(0, 5).forEach(u => console.log(' -', u));
    
    // Test first detail page
    if (urls.length > 0) {
      console.log('\nTesting first detail page...');
      await page.goto(urls[0], { waitUntil: 'networkidle2', timeout: 60000 });
      
      const data = await page.evaluate(() => {
        const title = document.querySelector('h2.mt-3.ps-0')?.textContent?.trim() || '';
        const img = document.querySelector('img[src*="/media/cache/big/"]');
        return { title, image: img?.getAttribute('src') || '' };
      });
      
      console.log('Detail page title:', data.title);
      console.log('Detail page image:', data.image);
    }
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await browser.close();
  }
})();
