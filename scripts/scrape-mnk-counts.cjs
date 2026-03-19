const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  try {
    console.log('Navigating to MNK catalog...');
    await page.goto('https://zbiory.mnk.pl/en/catalog', { waitUntil: 'networkidle0' });
    
    // Wait for filters to load
    await page.waitForSelector('.filters', { timeout: 10000 }).catch(() => console.log('No .filters found'));
    
    // Try to find filter headings or labels
    // Based on text dump, "FILTER BY" exists.
    
    // Let's dump all text that looks like a category/filter
    const texts = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('*'));
      return elements
        .filter(el => el.innerText && el.innerText.length < 50)
        .map(el => el.innerText)
        .filter(t => /painting|drawing|illustration|poster|photography|video/i.test(t));
    });
    
    console.log('Potential filter matches:', [...new Set(texts)]);
    
    // Also try to find total count
    const totalCountText = await page.evaluate(() => {
        // Look for text like "1 / 6989" or similar
        return document.body.innerText.match(/\d+\s*\/\s*\d+/);
    });
    console.log('Total count hint:', totalCountText);
    
    page.on('response', async response => {
        const url = response.url();
        if (url.includes('api') || url.includes('search') || url.includes('json')) {
            try {
                const json = await response.json();
                console.log('--- API Response from:', url, '---');
                // Check for filter/facet data in the response
                if (JSON.stringify(json).includes('Painting')) {
                     const fs = require('fs');
                     fs.writeFileSync('logs/mnk-api-response.json', JSON.stringify(json, null, 2));
                     console.log('Found "Painting" in response! Saved to logs/mnk-api-response.json');
                }
            } catch (e) {}
        }
    });

    console.log('Navigating to MNK catalog...');
    await page.goto('https://zbiory.mnk.pl/en/catalog', { waitUntil: 'networkidle0' });
    
    // Check if we saved the log
    // ...


  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
})();
