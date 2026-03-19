/**
 * Debug British Museum search API calls
 * Opens the paintings search page and logs XHR/fetch URLs.
 */
const { chromium } = require('playwright');

const SEARCH_URL = 'https://www.britishmuseum.org/collection/search?object=painting';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  page.on('request', (req) => {
    const url = req.url();
    if (req.resourceType() === 'xhr' || req.resourceType() === 'fetch') {
      if (url.includes('/collection/') || url.includes('search') || url.includes('api')) {
        console.log('XHR:', url);
      }
    }
  });

  console.log('Opening search page...');
  await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  console.log('If Cloudflare check appears, solve it in the browser, then press Enter in this terminal.');
  await new Promise((resolve) => process.stdin.once('data', resolve));

  // Wait a bit to capture network
  await page.waitForTimeout(5000);

  console.log('Scroll to trigger more requests...');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(5000);

  console.log('Done. Close browser to finish.');
})();
