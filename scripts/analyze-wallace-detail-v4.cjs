const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('Step 1: Loading West Room (Room 1) directly...');
  
  // Go to West Room directly
  await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=direct/1/ResultDetailView/result.inline.list.t1.collection_list.$TspTitleImageLink.link&sp=13&sp=Sartist&sp=SfilterDefinition&sp=0&sp=1&sp=1&sp=SdetailView&sp=0&sp=Sdetail&sp=0&sp=F&sp=0&sp=SdetailList&sp=0&sp=F&sp=Sroom&sp=l100', { 
    waitUntil: 'networkidle',
    timeout: 45000 
  });
  
  // Wait a bit for page to fully load
  await page.waitForTimeout(2000);
  
  // Check if we're on room page with artwork list
  const listImgs = await page.$$('.listImg a');
  console.log('Found', listImgs.length, 'artwork links');
  
  if (listImgs.length > 0) {
    console.log('Step 2: Clicking on first artwork...');
    
    // Click on first artwork
    await listImgs[0].click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    console.log('Step 3: Analyzing detail page...');
    console.log('Current URL:', page.url());
    
    // Get all text content
    const bodyText = await page.$eval('body', el => el.innerText);
    console.log('\n=== Full Page Text ===\n');
    console.log(bodyText.substring(0, 6000));
    
    // Look for specific patterns
    console.log('\n\n=== Looking for Artist/Date/Medium patterns ===');
    const lines = bodyText.split('\n').filter(l => l.trim());
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.match(/^(Artist|Maker|Author|Creator|Date|Year|Created|Medium|Materials|Technique|Dimensions|Size|Object Type|Category|Period|Century|Title|Inscriptions)/i)) {
        console.log(`"${line}" -> "${lines[i+1]?.trim() || 'N/A'}"`);
      }
    }
    
    // Get HTML for data fields
    console.log('\n\n=== Looking for data tables ===');
    const tables = await page.$$eval('table.data, .detailData, #detailContent, .moduleData', 
      els => els.map(el => el.outerHTML.substring(0, 1000))
    );
    console.log('Data tables found:', tables.length);
    tables.forEach((t, i) => console.log(`Table ${i}:`, t.substring(0, 500)));
    
    // Check for fieldsets or definition lists
    const fieldSets = await page.$$eval('fieldset, dl, .fieldGroup', 
      els => els.map(el => ({ tag: el.tagName, html: el.outerHTML.substring(0, 500) }))
    );
    console.log('\nFieldsets/DL found:', fieldSets.length);
    fieldSets.slice(0, 3).forEach((f, i) => console.log(`Fieldset ${i}:`, f.html));
  } else {
    console.log('No artwork links found on page');
    const bodyText = await page.$eval('body', el => el.innerText.substring(0, 2000));
    console.log('Page content:', bodyText);
  }
  
  await browser.close();
  console.log('\nDone.');
})();
