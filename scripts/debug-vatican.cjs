const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://images.grandpalaisrmn.fr/search-result?EVENT=WEBSHOP_SEARCH&SEARCHMODE=DEEP&CATEGORY[]=281634', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 8000));
  
  // Accept cookies
  try {
    const btn = await page.$('button:has-text("Accept")');
    if (btn) await btn.click();
    await new Promise(r => setTimeout(r, 2000));
  } catch(e) {}
  
  const info = await page.evaluate(() => {
    const items = document.querySelectorAll('[data-medianumber]');
    return [...items].slice(0, 10).map(el => ({
      id: el.getAttribute('data-medianumber'),
      classes: el.className,
      tagName: el.tagName,
      hasImg: !!el.querySelector('img'),
      imgSrc: el.querySelector('img')?.src?.substring(0, 80) || ''
    }));
  });
  
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
