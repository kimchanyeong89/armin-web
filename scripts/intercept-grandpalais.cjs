/**
 * Intercept network requests from Grand Palais RMN to find API
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function interceptRequests() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  const apiRequests = [];
  
  // Intercept all network requests
  page.on('request', request => {
    const url = request.url();
    if (url.includes('api') || url.includes('search') || url.includes('json') || url.includes('ajax')) {
      console.log('API Request:', url);
      apiRequests.push({
        url: url,
        method: request.method(),
        type: 'request'
      });
    }
  });
  
  page.on('response', async response => {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';
    
    if (contentType.includes('json') || url.includes('ajax') || url.includes('api')) {
      console.log('JSON Response:', url);
      try {
        const body = await response.text();
        if (body && body.length < 50000) {
          fs.writeFileSync(
            path.join(__dirname, '../downloads', `grandpalais-api-${Date.now()}.json`),
            body
          );
        }
      } catch (e) {}
    }
  });
  
  const url = 'https://images.grandpalaisrmn.fr/search-result?CS_MERGE=media%2Ccollections&SEARCHTXT1=%22conde%22&SEARCHMODE=NEW&CATEGORY[]=275846&CATEGORY[]=271490&EVENT=WEBSHOP_SEARCH';
  
  console.log('Navigating to:', url);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  
  // Accept cookies
  try {
    await page.click('button:has-text("Accept all cookies")');
    await page.waitForTimeout(3000);
  } catch (e) {}
  
  // Scroll and wait
  await page.waitForTimeout(5000);
  
  // Try scrolling to trigger more loads
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
  }
  
  // Try clicking next page
  try {
    const paginationLinks = await page.$$('.media-item-paging a');
    for (const link of paginationLinks) {
      const text = await link.textContent();
      console.log('Pagination link:', text);
    }
  } catch (e) {}
  
  console.log('\n=== Captured Requests ===');
  apiRequests.forEach(r => console.log(r.method, r.url));
  
  await page.waitForTimeout(10000);
  await browser.close();
}

interceptRequests().catch(console.error);
