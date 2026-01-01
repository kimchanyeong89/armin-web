const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('Loading detail page...');
  
  // Go to a specific artwork detail page
  await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=direct/1/ResultDetailView/result.inline.list.t1.collection_list.$TspTitleImageLink.link&sp=13&sp=Sroom&sp=SfilterDefinition&sp=0&sp=1&sp=3&sp=SdetailView&sp=0&sp=Sdetail&sp=0&sp=T&sp=0&sp=SdetailList&sp=0&sp=F&sp=Scollection&sp=l65299', { 
    waitUntil: 'networkidle',
    timeout: 30000 
  });
  
  console.log('Page loaded. Analyzing structure...\n');
  
  // Get all text content
  const bodyText = await page.$eval('body', el => el.innerText);
  console.log('=== Full Page Text ===\n');
  console.log(bodyText.substring(0, 4000));
  
  // Look for specific patterns
  console.log('\n\n=== Looking for Artist/Date/Medium patterns ===');
  const lines = bodyText.split('\n').filter(l => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.match(/^(Artist|Maker|Author|Creator|Date|Year|Created|Medium|Materials|Technique|Dimensions|Size|Object Type|Category|Period|Century)/i)) {
      console.log(`Line ${i}: "${line}" -> "${lines[i+1]?.trim() || 'N/A'}"`);
    }
  }
  
  // Get HTML structure of data areas
  console.log('\n\n=== HTML Structure (tables/dl/dt/dd) ===');
  const tables = await page.$$eval('table', els => els.map(el => el.outerHTML.substring(0, 500)));
  console.log('Tables found:', tables.length);
  tables.slice(0, 2).forEach((t, i) => console.log(`Table ${i}:`, t));
  
  const dls = await page.$$eval('dl, .data-row, .field-row, .detail-row', els => els.map(el => el.outerHTML.substring(0, 300)));
  console.log('\nDL/data-row elements:', dls.length);
  dls.slice(0, 3).forEach((d, i) => console.log(`DL ${i}:`, d));
  
  await browser.close();
  console.log('\nDone.');
})();
