const puppeteer = require('rebrowser-puppeteer');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/crystal-bridges-collection.json');

(async () => {
  console.log('Launching rebrowser-puppeteer...');
  const browser = await puppeteer.launch({
    headless: false, // Use headful to help pass CF
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  // Navigate to 'collections' to start (sometimes less protected than direct search)
  // Or straight to search results
  const url = 'https://crystalbridges.emuseum.com/objects/images';
  
  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });

  // Use waitForFunction to wait until title is NOT verification
  console.log('Waiting for verification challenge...');
  try {
      await page.waitForFunction(
          () => !document.title.includes('Verification') && !document.title.includes('Attention'),
          { timeout: 30000 }
      );
      console.log('Passed verification title check.');
  } catch (e) {
      console.log('Timeout waiting for title change. Checking selectors...');
  }

  // Wait for item selector
  try {
    await page.waitForSelector('.emuseum-object-item, .item-renderer, .grid-item, div[class*="object-item"]', { timeout: 15000 });
    console.log('Selector found!');
  } catch (e) {
    console.log('Selector not found. Dumping body text...');
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300));
    console.log('Body:', bodyText);
    const content = await page.content();
    fs.writeFileSync('crystal-failed.html', content);
    await browser.close();
    return;
  }

  const title = await page.title();
  console.log(`Page Title: ${title}`);

  // OK, we are likely in. Let's look for how many pages/items.
  
  // Scrape items
  const items = await page.evaluate(() => {
    // Try to find the container
    const nodes = Array.from(document.querySelectorAll('.emuseum-object-item, .item-renderer, .grid-item'));
    return nodes.map(node => {
        const img = node.querySelector('img');
        const links = Array.from(node.querySelectorAll('a'));
        const text = node.innerText;
        return {
            id: links[0]?.href?.split('/').slice(-2)[0] || Math.random().toString(), // rough ID extraction
            image: img?.src,
            textLines: text.split('\n').map(s => s.trim()).filter(Boolean),
            url: links[0]?.href
        };
    });
  });

  console.log(`Found ${items.length} items on page 1.`);
  if (items.length > 0) {
      console.log('Sample:', items[0]);
  }
  
  // If we found items, save them as a preliminary dump
  if (items.length > 0) {
      const cleanItems = items.map(i => ({
        id: i.id,
        title: i.textLines[0] || 'Untitled', // Guessing first line is title
        artist: i.textLines[1] || 'Unknown', // Guessing second is artist
        image: i.image,
        url: i.url
      }));
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(cleanItems, null, 2));
      console.log(`Saved ${cleanItems.length} items to ${OUTPUT_FILE}`);
  }

  await browser.close();
})();

