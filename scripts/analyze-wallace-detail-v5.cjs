const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('Step 1: Starting from main search page...');
  
  // Start from the main collection search
  await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=collection&moduleFunction=search&filterFunction=filter&filterField=filter_room&filterValue=*', { 
    waitUntil: 'networkidle',
    timeout: 45000 
  });
  
  await page.waitForTimeout(2000);
  
  // Check for room links
  console.log('Step 2: Looking for room links...');
  const roomLinks = await page.$$('.listImg a, .resultList a, a[href*="room"]');
  console.log('Found', roomLinks.length, 'room links');
  
  if (roomLinks.length > 0) {
    console.log('Clicking first room link...');
    await roomLinks[0].click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    console.log('Current URL:', page.url());
    
    // Check for artwork links
    const artworkLinks = await page.$$('.listImg a, .resultList a, .objectList a');
    console.log('Found', artworkLinks.length, 'artwork links');
    
    if (artworkLinks.length > 0) {
      console.log('Step 3: Clicking first artwork...');
      await artworkLinks[0].click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
      console.log('Detail page URL:', page.url());
      
      const bodyText = await page.$eval('body', el => el.innerText);
      console.log('\n=== Detail Page Text ===\n');
      console.log(bodyText.substring(0, 5000));
      
      // Look for field patterns
      console.log('\n\n=== Field Analysis ===');
      const lines = bodyText.split('\n').filter(l => l.trim());
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.match(/^(Artist|Maker|Author|Creator|Date|Year|Created|Medium|Materials|Technique|Dimensions|Size|Object|Category|Period|Century|Title|Inscriptions|Name)/i)) {
          console.log(`"${line}" -> "${lines[i+1]?.trim() || 'N/A'}"`);
        }
      }
    }
  } else {
    // Try to find any clickable elements
    console.log('Looking for any links...');
    const allLinks = await page.$$eval('a', els => els.slice(0, 20).map(a => ({ href: a.href, text: a.innerText.substring(0, 50) })));
    console.log('Links found:', JSON.stringify(allLinks, null, 2));
    
    const bodyText = await page.$eval('body', el => el.innerText.substring(0, 3000));
    console.log('\nPage content:\n', bodyText);
  }
  
  await browser.close();
  console.log('\nDone.');
})();
