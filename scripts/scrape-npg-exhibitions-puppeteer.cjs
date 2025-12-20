const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

puppeteer.use(StealthPlugin());

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

async function scrape() {
  console.log('Launching Puppeteer with Stealth...');
  const browser = await puppeteer.launch({
    headless: false, // Headful is required for manual interaction
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  // Set a realistic viewport
  await page.setViewport({ width: 1280, height: 800 });

  const exhibitions = {
    current: [],
    upcoming: [],
    past: []
  };

  // Helper to scrape a list page
  async function scrapePage(url, type) {
    console.log(`Navigating to ${type} exhibitions: ${url}`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      
      // Check for Cloudflare title just in case
      const title = await page.title();
      if (title.includes('Just a moment') || title.includes('Verifying')) {
        console.log('Cloudflare detected!');
        console.log('Please solve the CAPTCHA in the browser window.');
        await askQuestion('Press ENTER in this terminal when the page has loaded and you can see the exhibitions...');
      } else {
        // Even if not detected immediately, give a chance to inspect
        console.log('Page loaded. If you see a CAPTCHA, solve it now.');
        // Optional: await askQuestion('Press ENTER to continue...');
      }

      // Wait for content
      try {
        await page.waitForSelector('.listing__item, .exhibition-list__item, article, .grid__item, .card', { timeout: 5000 });
      } catch (e) {
        console.log('Timeout waiting for standard selectors. Saving snapshot...');
        fs.writeFileSync(`downloads/npg-${type}-debug.html`, await page.content());
      }

      const items = await page.evaluate(() => {
        const results = [];
        // Try to find exhibition items
        // NPG structure varies, but usually has a list of articles or divs
        const nodes = document.querySelectorAll('.listing__item, .exhibition-list__item, article, .grid__item, .card');
        
        nodes.forEach(node => {
          const titleEl = node.querySelector('h2, h3, .title, .card__title');
          const dateEl = node.querySelector('.date, .meta, .exhibition-date, .card__meta');
          const imgEl = node.querySelector('img');
          const linkEl = node.querySelector('a');
          const descEl = node.querySelector('.description, p, .card__text');

          if (titleEl) {
            results.push({
              name: titleEl.innerText.trim(),
              title: titleEl.innerText.trim(),
              description: descEl ? descEl.innerText.trim() : '',
              dateText: dateEl ? dateEl.innerText.trim() : '',
              image: imgEl ? (imgEl.src || imgEl.dataset.src) : '',
              link: linkEl ? linkEl.href : ''
            });
          }
        });
        return results;
      });

      console.log(`Found ${items.length} items for ${type}.`);
      return items;

    } catch (err) {
      console.error(`Error scraping ${type}:`, err.message);
      return [];
    }
  }

  // 1. Current/Upcoming
  const currentItems = await scrapePage('https://www.npg.org.uk/whatson/exhibitions/all/', 'current');
  exhibitions.current = currentItems;

  // 2. Past
  const pastItems = await scrapePage('https://www.npg.org.uk/whatson/exhibitions/past/', 'past');
  exhibitions.past = pastItems;

  // Save
  const outPath = path.join(__dirname, '..', 'downloads', 'npg-exhibitions-stealth.json');
  fs.writeFileSync(outPath, JSON.stringify(exhibitions, null, 2));
  console.log(`Saved to ${outPath}`);

  await browser.close();
}

scrape();
