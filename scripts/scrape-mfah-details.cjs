const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const DATA_FILE = path.join(__dirname, '../public/data/mfah-paintings.json');
const CONCURRENCY = process.env.CONCURRENCY ? parseInt(process.env.CONCURRENCY) : 3;

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
  return [];
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

async function scrapeDetails() {
  const items = loadData();
  const limit = process.env.LIMIT ? parseInt(process.env.LIMIT) : 0;
  let itemsToProcess = items.filter(i => !i.processed && !i.dimensions);
  
  if (limit > 0) {
      itemsToProcess = itemsToProcess.slice(0, limit);
  }
  
  if (itemsToProcess.length === 0) {
    console.log('No items to process.');
    return;
  }

  console.log(`Found ${itemsToProcess.length} items to process.`);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  // Process in chunks
  for (let i = 0; i < itemsToProcess.length; i += CONCURRENCY) {
    const chunk = itemsToProcess.slice(i, i + CONCURRENCY);
    console.log(`Processing chunk ${i / CONCURRENCY + 1} (${chunk.length} items)...`);

    await Promise.all(chunk.map(async (item) => {
      let page;
      try {
        page = await browser.newPage();
        // Construct absolute URL if relative
        let url = item.url;
        if (url && !url.startsWith('http')) {
          url = `https://emuseum.mfah.org${url}`;
        }

        if (!url) {
          console.log(`No URL for item ${item.id}`);
          item.processed = true; // Skip
          item.error = 'No URL';
          return;
        }

        // console.log(`Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Scrape details
        const details = await page.evaluate(() => {
          const getTxt = (sel) => {
             const el = document.querySelector(sel);
             return el ? el.innerText.trim() : null;
          };
          const getHtml = (sel) => {
             const el = document.querySelector(sel);
             return el ? el.innerHTML : null;
          }

          return {
            dimensions: getTxt('.detailField.dimensionsField .detailFieldValue'),
            culture: getTxt('.detailField.cultureField .detailFieldValue'),
            creditLine: getTxt('.detailField.creditlineField .detailFieldValue'),
            department: getTxt('.detailField.departmentField .detailFieldValue'),
            classification: getTxt('.detailField.classificationsField .detailFieldValue'),
            description: getTxt('.detailField.descriptionField .toggleContent'), // simplified
            tombstone: getTxt('.detailField.tombstoneField .detailFieldValue') // some sites use this
          };
        });

        // Update item
        Object.assign(item, details);
        
        // Upgrade image URL
        if (item.image && item.image.includes('/thumbnail')) {
            item.image = item.image.replace('/thumbnail', '/resize:format=full');
        }

        item.processed = true;
        console.log(`Processed ${item.id}: ${item.title.substring(0, 20)}...`);

      } catch (e) {
        console.error(`Error processing ${item.id}: ${e.message}`);
        item.error = e.message; // Mark error but continue
        // item.processed = true; // Optional: mark processed to avoid retry loop if persistent error?
        // Better to check specific errors.
      } finally {
        if (page) await page.close();
      }
    }));

    // Save after each chunk
    saveData(items);
    
    // Memory release
    // global.gc(); // optional

    // Delay
    await new Promise(r => setTimeout(r, 1000));
  }

  await browser.close();
  console.log('Done.');
}

scrapeDetails();
