const puppeteer = require('puppeteer');

(async () => {
  try {
    console.log('=== Checking Rivoli total artworks with Puppeteer ===');
    
    const browser = await puppeteer.launch({ 
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(120000);
    
    console.log('Loading page...');
    await page.goto('https://www.castellodirivoli.org/en/collections/', { 
      waitUntil: 'networkidle2' 
    });
    
    console.log('Page loaded, scrolling to load all artworks...');
    
    let prevCount = 0;
    let sameCountStreak = 0;
    
    for (let i = 0; i < 50; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 2000));
      
      const currentCount = await page.evaluate(() => {
        const links = document.querySelectorAll('a[href*="/en/opera/"]');
        return new Set(Array.from(links).map(a => a.href)).size;
      });
      
      console.log('Scroll ' + (i + 1) + ': ' + currentCount + ' unique artworks');
      
      if (currentCount === prevCount) {
        sameCountStreak++;
        if (sameCountStreak >= 4) {
          console.log('No new artworks loaded, stopping.');
          break;
        }
      } else {
        sameCountStreak = 0;
      }
      
      prevCount = currentCount;
    }
    
    const finalUrls = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="/en/opera/"]');
      return [...new Set(Array.from(links).map(a => a.href))];
    });
    
    console.log('\n=== FINAL RESULT ===');
    console.log('Total unique artwork URLs:', finalUrls.length);
    
    await browser.close();
    console.log('Done!');
  } catch (error) {
    console.error('Error:', error.message);
  }
})();
