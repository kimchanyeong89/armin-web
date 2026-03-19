const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  // Intercept responses to find JSON
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('json') || url.includes('search') || url.includes('objects')) {
      const type = response.headers()['content-type'];
      if (type && type.includes('json')) {
        console.log(`\nCaptured JSON from: ${url}`);
        try {
            const data = await response.json();
            // Log structure
            if (data.objects || data.results) {
                 console.log('Valid object data found!');
                 fs.writeFileSync('crystal-sample.json', JSON.stringify(data, null, 2));
            }
        } catch (e) {} 
      }
    }
  });

  console.log('Navigating to homepage...');
  await page.goto('https://crystalbridges.emuseum.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  
  // Wait a bit for potential redirects
  await new Promise(r => setTimeout(r, 5000));

  console.log('Attempting to fetch /objects/json inside page context...');
  const data = await page.evaluate(async () => {
     try {
       // Try typical eMuseum paths
       const r = await fetch('/objects/json');
       if (r.ok) return await r.json();
       return { error: r.status };
     } catch (e) {
       return { error: e.toString() };
     }
  });

  console.log('Fetch result:', JSON.stringify(data).slice(0, 500));


  
  // Check title
  const title = await page.title();
  console.log('Title:', title);

  await browser.close();
})();
