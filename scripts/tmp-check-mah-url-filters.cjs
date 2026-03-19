const puppeteer = require('puppeteer');

async function main() {
  const urls = [
    'https://www.mahmah.ch/collection/recherche?f%5B0%5D=artwork_property%3A%C5%92uvres%20avec%20images&f%5B1%5D=collections%3A57484',
    'https://www.mahmah.ch/collection/recherche?f%5B0%5D=artwork_property%3A%C5%92uvres%20avec%20images&f%5B1%5D=collections%3A57499'
  ];

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();

  for (const inputUrl of urls) {
    await page.goto(inputUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    const info = await page.evaluate(() => {
      const pageTitle = document.title || '';
      const title = document.querySelector('.search-artworks-title')?.textContent?.trim() || '';
      const checked = Array.from(document.querySelectorAll('input[type="checkbox"],input[type="radio"]'))
        .filter((el) => el.checked)
        .map((el) => ({ name: el.name, value: el.value, id: el.id }));

      const views = window?.drupalSettings?.views?.ajaxViews || null;
      const resultCount = window?.drupalSettings?.result_count ?? null;
      const viewEntry = views ? Object.values(views)[0] : null;

      return {
        href: location.href,
        pageTitle,
        title,
        checked: checked.slice(0, 30),
        resultCount,
        viewEntry
      };
    });

    console.log('---');
    console.log('input:', inputUrl);
    console.log('href :', info.href);
    console.log('pageTitle:', info.pageTitle);
    console.log('title:', info.title);
    console.log('resultCount:', info.resultCount);
    console.log('viewEntry:', JSON.stringify(info.viewEntry));
    console.log('checked:', JSON.stringify(info.checked));
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
