const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  console.log('Launching Playwright...');
  // Attempt with params often successful against bot detection
  const browser = await chromium.launch({ 
    headless: true, // Try true first, maybe "new" isn't needed in playwright
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
    ]
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    javaScriptEnabled: true
  });

  const page = await context.newPage();
  
  // Custom headers to look even more real
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  });

  const url = 'https://crystalbridges.emuseum.com/objects/images';
  console.log(`Navigating to ${url}...`);
  
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('Response status:', response.status());
    
    // Wait for something distinctive
    // Check if we hit the WAF content
    const title = await page.title();
    console.log('Title:', title);
    
    if (title.includes('Verification') || title.includes('Human')) {
        console.log('Hit WAF. Waiting...');
        await page.waitForTimeout(5000);
        // Maybe try to find the "Begin" button?
        // But AWS WAF might just block headless completely.
    }
    
    // Check for item
    try {
        await page.waitForSelector('.emuseum-object-item, .item-renderer', { timeout: 10000 });
        console.log('Success! Found object items.');
        
        // Extract 5 items
        const results = await page.evaluate(() => {
            const nodes = Array.from(document.querySelectorAll('.emuseum-object-item, .item-renderer, .grid-item'));
            return nodes.slice(0, 5).map(n => {
                const img = n.querySelector('img');
                const link = n.querySelector('a');
                return {
                    src: img?.src,
                    href: link?.href,
                    text: n.innerText
                };
            });
        });
        
        console.log('Items:', results);
        
    } catch (e) {
        console.log('Timeout waiting for object items. Dumping content...');
        const content = await page.content();
        fs.writeFileSync('crystal-playwright-fail.html', content);
    }
    
  } catch (e) {
      console.error('Error likely navigation:', e.message);
  }

  await browser.close();
})();
