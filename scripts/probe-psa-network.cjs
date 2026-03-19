const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  const page = await browser.newPage();
  
  // Capture requests
  page.on('request', req => {
    const url = req.url();
    if (url.includes('api') && url.includes('collections')) {
      console.log('REQ:', url, req.method());
      console.log('HEADERS:', JSON.stringify(req.headers(), null, 2));
    }
  });

  page.on('response', async res => {
    const url = res.url();
    if ((url.includes('api') || url.includes('json')) && res.status() === 200) {
      try {
        const ct = res.headers()['content-type'] || '';
        if (ct.includes('json')) {
            const data = await res.json();
            // Try to detect if it's the collection
            if (url.includes('collections') || (data && (data.items || data.data || Array.isArray(data)))) {
                console.log('--- RESP ---', url);
                const snip = JSON.stringify(data).slice(0, 300);
                console.log(snip);
            }
        }
      } catch (e) {}
    }
  });

  console.log('Navigating...');
  await page.goto('https://www.powerstationofart.com/psa-collections?artworkType=painting', { waitUntil: 'networkidle0' });
  
  console.log('Done.');
  await browser.close();
})();
