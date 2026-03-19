const puppeteer = require('puppeteer');

async function main() {
  const url = 'https://www.mahmah.ch/collection/recherche?f%5B0%5D=artwork_property%3A%C5%92uvres%20avec%20images&f%5B1%5D=collections%3A57484';
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  let ok = false;
  for (let i = 0; i < 8; i += 1) {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    const title = await page.title();
    console.log('try', i + 1, 'title:', title);
    if (!title.includes('Erreur 500')) {
      ok = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (!ok) {
    console.log('Could not bypass 500');
    await browser.close();
    return;
  }

  const data = await page.evaluate(() => {
    const title = document.querySelector('.search-artworks-title')?.textContent?.trim() || '';
    const forms = Array.from(document.querySelectorAll('form')).map((form) => {
      const inputs = Array.from(form.querySelectorAll('input,select,textarea')).map((el) => {
        const tag = el.tagName.toLowerCase();
        const type = (el.getAttribute('type') || '').toLowerCase();
        const name = el.getAttribute('name') || '';
        let value = '';
        if (tag === 'select') {
          value = el.value || '';
        } else if (type === 'checkbox' || type === 'radio') {
          if (!el.checked) return null;
          value = el.value || 'on';
        } else {
          value = el.value || '';
        }
        return { name, value, type, id: el.id || '' };
      }).filter(Boolean);
      return {
        id: form.id || '',
        className: form.className || '',
        action: form.getAttribute('action') || '',
        method: form.getAttribute('method') || 'get',
        inputs
      };
    });

    const drupalSettingsEl = document.querySelector('[data-drupal-selector="drupal-settings-json"]');
    let views = null;
    if (drupalSettingsEl) {
      try {
        const settings = JSON.parse(drupalSettingsEl.textContent || '{}');
        views = settings?.views?.ajaxViews || null;
      } catch {}
    }

    return { title, forms, views };
  });

  console.log(JSON.stringify(data, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
