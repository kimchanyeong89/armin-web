const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const START_URL = 'https://emuseum.mfah.org/search/*/objects/images?filter=classifications%3APAINTING%3Bcatalogueonly%3Afalse%3BmediaExistence%3Atrue';
const OUTPUT_FILE = path.join(__dirname, '../public/data/mfah-paintings.json');
const MAX_PAGES = process.env.LIMIT ? parseInt(process.env.LIMIT) : 0; // 0 for all

async function scrape() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // Set viewport to look like a desktop
  await page.setViewport({ width: 1366, height: 768 });

  console.log(`Navigating to start...`);
  let currentUrl = START_URL;
  let allItems = [];
  let pageNum = 1;

  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const data = fs.readFileSync(OUTPUT_FILE, 'utf8');
      allItems = JSON.parse(data);
      if (allItems.length > 0) {
        // Assume 24 items per page roughly, or just find the max page in URL if we tracked it?
        // But we didn't track page number in item.
        // Easiest is to just calculate:
        const itemsPerPage = 24;
        pageNum = Math.ceil(allItems.length / itemsPerPage) + 1;
        console.log(`Resuming from file with ${allItems.length} items. Starting at page ${pageNum}.`);
        
        // Construct resume URL
        if (pageNum > 1) {
            currentUrl = `${START_URL}&page=${pageNum}`;
        }
      }
    } catch (e) {
      console.error('Error reading existing file:', e);
    }
  }

  try {
    // Initial navigation
    await page.goto(currentUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    while (true) {
      console.log(`Processing page ${pageNum}...`);

      // Wait for results
      try {
        await page.waitForSelector('.result.item', { timeout: 10000 });
      } catch (e) {
        console.log('No results found on this page (timeout). Ending.');
        break;
      }

      // Extract items
      const items = await page.evaluate(() => {
        const els = document.querySelectorAll('.result.item');
        return Array.from(els).map(el => {
          const getTxt = (sel) => el.querySelector(sel)?.innerText.trim() || '';
          const getHref = (sel) => el.querySelector(sel)?.getAttribute('href') || '';
          const getSrc = (sel) => el.querySelector(sel)?.getAttribute('src') || '';
          const getId = () => el.getAttribute('data-emuseum-id') || '';

          const titleEl = el.querySelector('.title a');
          const imgEl = el.querySelector('.primaryMedia img');

          return {
            id: getId(),
            title: titleEl ? titleEl.innerText.trim() : '',
            url: titleEl ? titleEl.getAttribute('href') : '',
            artist: getTxt('.primaryMaker'),
            date: getTxt('.displayDate'),
            medium: getTxt('.medium'),
            invno: getTxt('.invno'),
            image: imgEl ? imgEl.getAttribute('src') : '',
            source: 'MFAH'
          };
        });
      });

      console.log(`Found ${items.length} items on page ${pageNum}.`);
      allItems.push(...items);

      // Save progress periodically
      if (pageNum % 5 === 0) {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
        console.log(`Saved ${allItems.length} items to ${OUTPUT_FILE}`);
      }

      if (MAX_PAGES > 0 && pageNum >= MAX_PAGES) {
        console.log(`Reached limit of ${MAX_PAGES} pages.`);
        break;
      }

      // Find next link
      const nextHref = await page.evaluate(() => {
        const a = document.querySelector('a.next-page-link');
        return a ? a.getAttribute('href') : null;
      });

      if (!nextHref) {
        console.log('No next page link found. Finished.');
        break;
      }

      // Construct absolute URL
      // eMuseum often uses relative URLs
      const nextUrl = new URL(nextHref, currentUrl).href;
      console.log(`Next page: ${nextUrl}`);
      
      currentUrl = nextUrl;
      pageNum++;

      // Polite delay
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
      
      // Navigate
      await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }

  } catch (error) {
    console.error('Scraping failed:', error);
  } finally {
    // Final save
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
    console.log(`Total ${allItems.length} items saved to ${OUTPUT_FILE}`);
    await browser.close();
  }
}

scrape();
