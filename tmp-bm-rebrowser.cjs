const puppeteer = require('rebrowser-puppeteer');
const fs = require('fs');

(async () => {
  try {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage'
      ]
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
    await page.goto('https://www.britishmuseum.org/collection/search?keyword=rosetta&image=true', {
      waitUntil: 'domcontentloaded',
      timeout: 120000
    });

    await page.waitForTimeout(5000);
    const title = await page.title();
    const dataStr = await page.evaluate(() => document.querySelector('#__NEXT_DATA__')?.textContent || null);

    const output = {
      title,
      hasData: Boolean(dataStr)
    };

    if (dataStr) {
      const data = JSON.parse(dataStr);
      const results = data?.props?.pageProps?.search?.results?.results || [];
      output.count = results.length;
      output.sample = results.slice(0, 3).map((item) => ({
        id: item.id,
        title: item.title,
        image: item.image?.src || null
      }));
    }

    fs.writeFileSync('bm-rebrowser-debug.json', JSON.stringify(output, null, 2));
    await browser.close();
  } catch (error) {
    console.error('ERR', error);
  }
})();
