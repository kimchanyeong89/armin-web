const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  const url = 'https://collections.mfa.org/search/Objects/classifications%3APaintings%3Bonview%3Atrue%3BimageExistence%3Atrue/*';
  console.log('Navigating to:', url);

  const browser = await puppeteer.launch({
    headless: true, // Set to false if you want to see what's happening
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  page.on('response', async response => {
    const url = response.url();
    const type = response.request().resourceType();
    if (type === 'xhr' || type === 'fetch' || url.includes('json')) {
      try {
        const text = await response.text();
        if (text.startsWith('{') || text.startsWith('[')) {
             console.log(`\n--- API Response: ${url} ---`);
             console.log(text.slice(0, 500)); // Print first 500 chars
        }
      } catch (e) {
        // ignore
      }
    }
  });

  await page.goto(url, { waitUntil: 'networkidle2' });

  // Check for items in the DOM
  const itemSelector = '.emuseum-result-grid-item, .result-item, .Grid-item'; // Guessing selectors
  // Let's dump the HTML of the first item to see structure
  const content = await page.content();
  console.log('\n--- Page Content Snippet ---');
  console.log(content.slice(0, 1000));

  // Try to find list items
  const items = await page.evaluate(() => {
    // Try to find common eMuseum selectors
    const nodes = document.querySelectorAll('.emuseum-objects-grid-item, .item-container, .grid-item, a[href*="/objects/"]');
    return Array.from(nodes).slice(0, 3).map(n => ({
        html: n.outerHTML.slice(0, 300),
        text: n.innerText
    }));
  });

  console.log('\n--- DOM Items ---');
  console.log(items);

  await browser.close();
})();
