const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const pagesToCheck = [120, 140, 150, 160, 180];
  
  for (const p of pagesToCheck) {
    await page.goto(`https://www.navigart.fr/mamparis/#/artworks/checkbox:withimage/Avec%20image/tree_domain_all/Peinture?page=${p}&sort=random&layout=box`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    const items = await page.$$('a[href*="/artwork/"]');
    console.log(`Page ${p}: ${items.length} items`);
  }
  
  await browser.close();
})();
