const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function scrapeNPGExhibitions() {
  const HEADLESS = process.env.HEADLESS === '1';
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  // Helper to wait for user interaction if needed
  async function waitForHuman() {
    console.log('Checking for Cloudflare...');
    try {
      const isCF = await page.evaluate(() => document.body.innerText.includes('Verifying you are human') || document.title.includes('Just a moment'));
      if (isCF) {
        console.log('Cloudflare challenge detected. Please solve it in the browser window.');
        // Wait for the challenge to disappear or content to appear
        // We wait for a specific element that is likely to be on the real page
        // Common NPG selectors: .listing__item, .grid__item, .exhibition-item
        await page.waitForFunction(() => {
          return !document.body.innerText.includes('Verifying you are human') && !document.title.includes('Just a moment');
        }, null, { timeout: 300000 }); // 5 minutes timeout
        console.log('Cloudflare challenge passed (or page changed).');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(3000);
      }
    } catch (e) {
      console.log('Error checking/waiting for Cloudflare:', e.message);
    }
  }

  const exhibitions = {
    current: [],
    upcoming: [],
    past: []
  };

  // 1. Scrape Current and Upcoming
  console.log('Navigating to Current/Upcoming exhibitions...');
  await page.goto('https://www.npg.org.uk/whatson/exhibitions/all/', { waitUntil: 'domcontentloaded' });
  await waitForHuman();

  // Save snapshot for debugging
  fs.writeFileSync(path.join(__dirname, '..', 'downloads', 'npg-current.html'), await page.content());
  console.log('Saved snapshot to downloads/npg-current.html');

  // Extract data
  const currentAndUpcoming = await page.evaluate(() => {
    const items = [];
    // Try multiple potential selectors
    const elements = document.querySelectorAll('.listing__item, .exhibition-list__item, article, .grid__item, .card');
    
    elements.forEach(el => {
      const titleEl = el.querySelector('h2, h3, .title, .card__title');
      const dateEl = el.querySelector('.date, .meta, .exhibition-date, .card__meta');
      const imgEl = el.querySelector('img');
      const linkEl = el.querySelector('a');
      const descEl = el.querySelector('.description, p, .card__text');

      if (titleEl) {
        items.push({
          name: titleEl.innerText.trim(),
          title: titleEl.innerText.trim(),
          description: descEl ? descEl.innerText.trim() : '',
          dateText: dateEl ? dateEl.innerText.trim() : '',
          image: imgEl ? (imgEl.src || imgEl.dataset.src) : '',
          link: linkEl ? linkEl.href : ''
        });
      }
    });
    return items;
  });

  console.log(`Found ${currentAndUpcoming.length} items on Current/Upcoming page.`);
  
  // Simple heuristic to separate current/upcoming if they are mixed
  // Or maybe the page separates them. For now, put all in temporary (current/upcoming).
  // We will refine this.
  exhibitions.current = currentAndUpcoming;

  // 2. Scrape Past (if needed, or if separate page)
  // Usually past exhibitions are on a separate archive page.
  // Let's try to find a link to "Past exhibitions" or go to a known URL.
  // https://www.npg.org.uk/whatson/exhibitions/past/ is a common pattern.
  
  console.log('Navigating to Past exhibitions...');
  try {
    await page.goto('https://www.npg.org.uk/whatson/exhibitions/past/', { waitUntil: 'domcontentloaded' });
    await waitForHuman();
    
    // Save snapshot
    fs.writeFileSync(path.join(__dirname, '..', 'downloads', 'npg-past.html'), await page.content());
    console.log('Saved snapshot to downloads/npg-past.html');

    const pastItems = await page.evaluate(() => {
      const items = [];
      const elements = document.querySelectorAll('.listing__item, .exhibition-list__item, article');
      elements.forEach(el => {
        const titleEl = el.querySelector('h2, h3, .title');
        const dateEl = el.querySelector('.date, .meta, .exhibition-date');
        const imgEl = el.querySelector('img');
        const linkEl = el.querySelector('a');
        const descEl = el.querySelector('.description, p');

        if (titleEl) {
          items.push({
            name: titleEl.innerText.trim(),
            title: titleEl.innerText.trim(),
            description: descEl ? descEl.innerText.trim() : '',
            dateText: dateEl ? dateEl.innerText.trim() : '',
            image: imgEl ? (imgEl.src || imgEl.dataset.src) : '',
            link: linkEl ? linkEl.href : ''
          });
        }
      });
      return items;
    });
    console.log(`Found ${pastItems.length} past items.`);
    exhibitions.past = pastItems;
  } catch (e) {
    console.log('Could not fetch past exhibitions or page does not exist.');
  }

  // Output result
  const outPath = path.join(__dirname, '..', 'downloads', 'npg-exhibitions.json');
  fs.writeFileSync(outPath, JSON.stringify(exhibitions, null, 2));
  console.log(`Saved exhibitions to ${outPath}`);

  await browser.close();
}

scrapeNPGExhibitions();
