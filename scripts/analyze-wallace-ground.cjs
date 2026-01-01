const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  // Go to the main collection page first
  await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=collection&viewType=detailList', { waitUntil: 'networkidle', timeout: 60000 });
  
  await page.waitForTimeout(3000);
  
  // Get page title and count
  const title = await page.title();
  console.log('Page title:', title);
  
  // Find total items
  const resultText = await page.textContent('.searchResultText').catch(() => '');
  console.log('Result text:', resultText);
  
  // Get current room name
  const roomName = await page.textContent('.mpFilterActiveItem').catch(() => '');
  console.log('Active room:', roomName);
  
  // Get all items on page
  const items = await page.$$('.contentBlock');
  console.log('Items on page:', items.length);
  
  // List all room filters in the sidebar
  const allFilters = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll('.mpFilterItem, .mpFilterActiveItem').forEach(el => {
      const text = el.textContent.trim();
      const href = el.getAttribute('href') || el.querySelector('a')?.getAttribute('href') || '';
      const onclick = el.getAttribute('onclick') || '';
      results.push({ text: text.substring(0, 50), href: href.substring(0, 100), onclick: onclick.substring(0, 50) });
    });
    return results;
  });
  
  console.log('\nAll filters found:', allFilters.length);
  allFilters.forEach((f, i) => console.log(`  ${i+1}. ${f.text}`));
  
  // Get the filter structure
  const filterHtml = await page.evaluate(() => {
    const filterSection = document.querySelector('.mpFilterSection');
    return filterSection ? filterSection.innerHTML.substring(0, 5000) : 'No filter section';
  });
  console.log('\nFilter HTML sample:', filterHtml.substring(0, 2000));
  
  await browser.close();
})();
