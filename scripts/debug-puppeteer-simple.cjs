const puppeteer = require('puppeteer');

(async () => {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node debug-puppeteer-simple.cjs <url>');
    process.exit(1);
  }
  console.log(`Navigating to ${url}...`);
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
  
  try {
    const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    console.log(`Status: ${response.status()}`);
    
    const title = await page.title();
    console.log(`Title: ${title}`);

    // Check for specific selectors based on the site
    const content = await page.content();
    console.log(`Content length: ${content.length}`);
    
    if (content.length < 2000) {
      console.log('--- Content Preview ---');
      console.log(content);
    }

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await browser.close();
  }
})();
