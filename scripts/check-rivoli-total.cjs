const { chromium } = require('playwright');

(async () => {
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    console.log('=== Checking Rivoli total artworks ===');
    await page.goto('https://www.castellodirivoli.org/en/collections/', { 
      waitUntil: 'load',
      timeout: 60000 
    });
    
    console.log('Page loaded, scrolling...');
    
    let prevCount = 0;
    let sameCountStreak = 0;
    
    for (let i = 0; i < 50; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 1500));
      
      const currentCount = await page.evaluate(() => {
        const links = document.querySelectorAll('a[href*="/en/opera/"]');
        return new Set(Array.from(links).map(a => a.href)).size;
      });
      
      console.log('Scroll ' + (i + 1) + ': Found ' + currentCount + ' unique artworks');
      
      if (currentCount === prevCount) {
        sameCountStreak++;
        if (sameCountStreak >= 3) {
          console.log('No new artworks after 3 scrolls, stopping.');
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
    console.log('\nFirst 5:', finalUrls.slice(0, 5));
    console.log('\nLast 5:', finalUrls.slice(-5));
    
    await browser.close();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
