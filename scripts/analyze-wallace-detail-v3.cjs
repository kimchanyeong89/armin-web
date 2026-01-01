const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('Step 1: Loading room list page to establish session...');
  
  // Start from the room list page
  await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=collection&moduleFunction=search&searchType=simpleSearch&filterFunction=filter&filterField=filter_room&filterValue=*', { 
    waitUntil: 'networkidle',
    timeout: 30000 
  });
  
  console.log('Step 2: Clicking on first room...');
  
  // Click on first room
  const roomLink = await page.$('.listImg a, .resultList a');
  if (roomLink) {
    await roomLink.click();
    await page.waitForLoadState('networkidle');
  }
  
  console.log('Step 3: Now on room page, clicking on first artwork...');
  
  // Click on first artwork image to go to detail
  const artworkLink = await page.$('.listImg a, .resultList a');
  if (artworkLink) {
    await artworkLink.click();
    await page.waitForLoadState('networkidle');
  }
  
  console.log('Step 4: Analyzing detail page...\n');
  
  // Get all text content
  const bodyText = await page.$eval('body', el => el.innerText);
  console.log('=== Full Page Text (first 5000 chars) ===\n');
  console.log(bodyText.substring(0, 5000));
  
  // Look for specific patterns
  console.log('\n\n=== Looking for Artist/Date/Medium patterns ===');
  const lines = bodyText.split('\n').filter(l => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.match(/^(Artist|Maker|Author|Creator|Date|Year|Created|Medium|Materials|Technique|Dimensions|Size|Object Type|Category|Period|Century|Title)/i)) {
      console.log(`"${line}" -> "${lines[i+1]?.trim() || 'N/A'}"`);
    }
  }
  
  // Get current URL
  console.log('\n\nCurrent URL:', page.url());
  
  await browser.close();
  console.log('\nDone.');
})();
