const { chromium } = require('playwright');
const fs = require('fs');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  
  await page.goto('https://wallacelive.wallacecollection.org/eMP/eMuseumPlus?service=ExternalInterface&module=collection&objectId=65299&viewType=detailView', { waitUntil: 'networkidle', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  
  const html = await page.content();
  fs.writeFileSync('/tmp/wallace-obj.html', html);
  
  const text = await page.evaluate(() => document.body.innerText);
  console.log(text.substring(0, 3000));
  
  await browser.close();
}
main().catch(console.error);
