const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    await page.goto('https://www.britishmuseum.org/collection/search?keyword=rosetta&image=true', {
      waitUntil: 'domcontentloaded',
      timeout: 90000
    });
    await page.waitForTimeout(5000);

    const dataStr = await page.evaluate(() => {
      const el = document.querySelector('#__NEXT_DATA__');
      return el ? el.textContent : null;
    });

    const output = {
      hasData: Boolean(dataStr),
      title: await page.title(),
      url: page.url()
    };

    if (dataStr) {
      const data = JSON.parse(dataStr);
      const results = data?.props?.pageProps?.search?.results?.results || [];
      output.count = results.length;
      output.sample = results.slice(0, 3).map((result) => ({
        id: result.id,
        title: result.title,
        image: result.image?.src || null
      }));
    }

    fs.writeFileSync('bm-debug.json', JSON.stringify(output, null, 2));
    await browser.close();
  } catch (error) {
    console.error('ERR', error);
  }
})();
