const puppeteer = require('puppeteer');

async function main() {
  const url = 'https://www.mahmah.ch/collection/recherche?f%5B0%5D=artwork_property%3A%C5%92uvres%20avec%20images&f%5B1%5D=collections%3A57484';
  const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  page.on('request', (req) => {
    const reqUrl = req.url();
    if (reqUrl.includes('/views/ajax')) {
      console.log('REQUEST URL:', reqUrl);
      console.log('METHOD:', req.method());
      console.log('POST DATA:', req.postData() || '');
    }
  });

  page.on('response', async (res) => {
    const resUrl = res.url();
    if (resUrl.includes('/views/ajax')) {
      console.log('RESPONSE STATUS:', res.status());
      try {
        const txt = await res.text();
        console.log('RESPONSE SNIP:', txt.slice(0, 500));
      } catch (e) {
        console.log('RESPONSE READ ERROR:', e.message);
      }
    }
  });

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  const pageTitle = await page.title();
  console.log('PAGE TITLE:', pageTitle);
  const html = await page.content();
  require('fs').writeFileSync('debug-mah-capture-page.html', html);
  await page.waitForSelector('a.mah-button--load-more, [data-drupal-views-infinite-scroll-pager] a', { timeout: 30000 });
  await page.click('a.mah-button--load-more, [data-drupal-views-infinite-scroll-pager] a');
  await page.waitForTimeout(4000);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
