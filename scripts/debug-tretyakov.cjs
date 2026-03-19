const puppeteer = require('puppeteer');

(async () => {
  console.log('🚀 Launching browser...');
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  console.log('🌍 Navigating to https://my.tretyakov.ru/ ...');
  try {
    await page.goto('https://my.tretyakov.ru/', { waitUntil: 'networkidle2', timeout: 30000 });
  } catch (e) {
    console.log('Navigation timeout or error, but continuing...');
  }

  // Dump all links
  const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).map(a => a.href);
  });
  console.log('Found Links:', links.slice(0, 20));
  
  await browser.close();
  console.log('✨ Done.');
})();
