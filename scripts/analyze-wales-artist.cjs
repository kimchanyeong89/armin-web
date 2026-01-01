/**
 * Analyze Museum Wales artist/creator field structure
 */
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    // Search for Augustus John works (known artist)
    console.log('Searching for Augustus John works...');
    await page.goto('https://museum.wales/collections/online/?field=agent_name&query=Augustus+John', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    
    // Get first result link
    const links = await page.$$eval('.search_result a.result_box_image', els => els.slice(0,3).map(a => a.href));
    console.log('Found works:', links.length);
    
    if (links.length > 0) {
      // Go to detail page
      console.log('\nVisiting:', links[0]);
      await page.goto(links[0], { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 1500));
      
      // Get all object fields
      const fields = await page.$$eval('.object_field', els => {
        return els.map(el => {
          const label = el.querySelector('.object_field_label')?.textContent?.trim() || '';
          const value = el.querySelector('.object_field_value')?.textContent?.trim() || '';
          return { label, value };
        });
      });
      
      console.log('\n=== Object Fields ===');
      fields.forEach(f => console.log(`  ${f.label}: ${f.value}`));
      
      // Check credit line area
      const credit = await page.$eval('.credit_line', el => el.textContent.trim()).catch(() => 'none');
      console.log('\n=== Credit Line ===');
      console.log(credit);
      
      // Look for any element containing artist info
      const artistElements = await page.evaluate(() => {
        const results = [];
        
        // Check for maker/artist in any element
        const allText = document.body.innerText;
        const lines = allText.split('\n').filter(l => 
          l.toLowerCase().includes('artist') || 
          l.toLowerCase().includes('maker') || 
          l.toLowerCase().includes('creator') ||
          l.toLowerCase().includes('by ')
        );
        
        // Look for specific selectors
        const agentLink = document.querySelector('a[href*="agent_name"]');
        if (agentLink) results.push('Agent link: ' + agentLink.textContent.trim());
        
        const objectCreator = document.querySelector('.object_creator, .object_artist, .object_maker');
        if (objectCreator) results.push('Creator element: ' + objectCreator.textContent.trim());
        
        return { lines: lines.slice(0, 10), elements: results };
      });
      
      console.log('\n=== Artist-related text ===');
      artistElements.lines.forEach(l => console.log('  ' + l.substring(0, 100)));
      artistElements.elements.forEach(e => console.log('  ' + e));
      
      // Get raw HTML of the object info section
      const infoHtml = await page.$eval('.object_info, .object_details, .object_summary', el => el.innerHTML).catch(() => 'not found');
      console.log('\n=== Info section HTML (first 2000 chars) ===');
      console.log(infoHtml.substring(0, 2000));
    }
    
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
