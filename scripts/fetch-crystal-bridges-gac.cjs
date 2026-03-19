const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  console.log('Launching Playwright for Google Arts & Culture...');
  const browser = await chromium.launch({ 
    headless: true, // Google Arts works usually fine with headless
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1400, height: 1000 },
    locale: 'en-US'
  });

  const page = await context.newPage();
  
  // The partner page usually lists items or categories. 
  // We can also try the "items" tab if it exists, but often it's just one scrollable page.
  // We can also try to search within the partner?
  // Let's try the partner items page directly if possible.
  // Often: https://artsandculture.google.com/entity/crystal-bridges-museum-of-american-art/m05q5c_?categoryid=art-movement (no)
  
  // Let's go to the partner page and look for "Items" link or just scrape what's there.
  const url = 'https://artsandculture.google.com/explore/collections/crystal-bridges-museum-of-american-art?c=assets'; 
  
  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle' }); 
  
  // Wait for the grid to appear
  console.log('Waiting for grid...');
  try {
    await page.waitForSelector('a[href^="/asset/"]', { timeout: 15000 });
  } catch(e) { console.log('Timeout waiting for asset links'); }

  // Scroll down to load more items
  console.log('Scrolling to load items (aggressive)...');
  let prevCount = 0;
  for (let i = 0; i < 60; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000); // Wait 2s for layout
      
      // Check if we have more items
      const currentCount = await page.evaluate(() => document.querySelectorAll('a[href^="/asset/"]').length);
      console.log(`Scroll ${i}: Found ${currentCount} items.`);
      
      if (currentCount === prevCount && i > 15) {
          console.log('Count stabilized, stopping scroll.');
          break;
      }
      prevCount = currentCount;
  }

  // Look for links to assets
  // asset links usually look like /asset/title/ID
  console.log('Extracting assets...');
  
  const items = await page.evaluate(() => {
    // Basic item card selector might vary, but they all link to /asset/
    const links = Array.from(document.querySelectorAll('a[href^="/asset/"]'));
    return links.map(a => {
        const href = a.href;
        const id = href.split('/').pop();
        // Image usually in a child img or bg div
        const img = a.querySelector('img')?.src || 
                    a.querySelector('div[style*="background-image"]')?.style.backgroundImage.slice(5, -2);
        const title = a.innerText || a.getAttribute('title') || a.getAttribute('aria-label') || '';
        
        return {
            id,
            title: title.replace(/\n/g, ' ').trim(),
            image: img,
            url: href,
            source: 'Google Arts & Culture'
        };
    }).filter(i => i.title && i.image && !i.title.includes('View all')); // Filter out UI buttons
  });
  
  // Dedup
  const uniqueItems = [];
  const seen = new Set();
  for (const item of items) {
      if (!seen.has(item.id)) {
          seen.add(item.id);
          uniqueItems.push(item);
      }
  }

  console.log(`Found ${uniqueItems.length} unique items.`);
  
  // Phase 2: Visit details for better metadata
  console.log('Phase 2: Use concurrency to fetch details...');
  const finalItems = [];
  const chunkSize = 5; // Parallel tabs
  
  for (let i = 0; i < uniqueItems.length; i += chunkSize) {
      const chunk = uniqueItems.slice(i, i + chunkSize);
      console.log(`Processing chunk ${i} - ${i + chunkSize}...`);
      
      const promises = chunk.map(async (item) => {
          const p = await context.newPage();
          try {
              await p.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
              
              // Extract metadata
              const meta = await p.evaluate(() => {
                  const title = document.querySelector('h1')?.innerText || '';
                  
                  // Text-based extraction for GAC (Google Arts & Culture)
                  const bodyText = document.body.innerText;
                  const lines = bodyText.split('\n');
                  
                  let artist = '';
                  let date = '';
                  let medium = '';
                  let category = ''; // Not explicitly in GAC usually, but we can try "Type" or infer
                  
                  // Helper to find value after label
                  const findValue = (label) => {
                      const prefix = label.toLowerCase() + ':';
                      for (let i = 0; i < lines.length; i++) {
                          const line = lines[i].trim();
                          if (line.toLowerCase().startsWith(prefix)) {
                              // Found "Label: Value"
                              // Get original casing from slice
                              return lines[i].trim().slice(label.length + 1).trim();
                          }
                          
                          // Handle "Label" \n "Value"
                          if (line.toLowerCase() === label.toLowerCase()) {
                              if (lines[i+1]) return lines[i+1].trim();
                          }
                      }
                      return '';
                  };
                  
                  artist = findValue('Creator') || findValue('Artist') || findValue('제작자'); 
                  // Korean support for "제작자", "제작연도", "재료" based on screenshot
                  date = findValue('Date Created') || findValue('Date') || findValue('제작연도');
                  medium = findValue('Medium') || findValue('Material') || findValue('재료');
                  
                  // GAC doesn't always have "Category". If medium contains oil/canvas/paper -> Painting/Drawing
                  if (!category) {
                      const m = (medium || '').toLowerCase();
                      if (m.includes('oil') || m.includes('acrylic') || m.includes('canvas') || m.includes('tempera')) category = 'Painting';
                      else if (m.includes('ink') || m.includes('pencil') || m.includes('chalk') || m.includes('charcoal')) category = 'Drawing';
                      else if (m.includes('sculpture') || m.includes('bronze') || m.includes('marble')) category = 'Sculpture';
                      else category = 'Artwork';
                  }

                  const ogImage = document.querySelector('meta[property="og:image"]')?.content;

                  return {
                      cleanTitle: title,
                      cleanArtist: artist,
                      cleanDate: date,
                      cleanMedium: medium,
                      cleanCategory: category,
                      highResImage: ogImage,
                      debugMedium: `Raw Med: "${medium}"`
                  };
              });
              
              if (item.title.includes('Lantern')) {
                  console.log(`Debug Lantern: Title=${meta.cleanTitle}, Artist=${meta.cleanArtist}, Med=${meta.cleanMedium}, Dbg=${meta.debugMedium}`);
              }
              
              return {
                  ...item,
                  title: meta.cleanTitle || item.title,
                  artist: meta.cleanArtist || '',
                  date: meta.cleanDate || '',
                  medium: meta.cleanMedium || '',
                  category: meta.cleanCategory || 'Artwork',
                  image: meta.highResImage || item.image.replace(/=w\d+.*$/, '=w1000') // Enforce generic resize if og not found
              };
              
          } catch (e) {
              console.error(`Failed ${item.id}:`, e.message);
              return item;
          } finally {
              await p.close();
          }
      });
      
      const results = await Promise.all(promises);
      finalItems.push(...results);
  }

  if (finalItems.length > 0) {
      console.log('Sample detailed:', finalItems[0]);
      fs.writeFileSync('public/data/crystal-bridges-gac.json', JSON.stringify(finalItems, null, 2));
      console.log('Saved to public/data/crystal-bridges-gac.json');
      
      // Also save a minified version for the app if needed
      // fs.writeFileSync('src/data/crystal-bridges.json', ...);
  } else {
      console.log('No items found. Dumping HTML...');
      fs.writeFileSync('crystal-gac-fail.html', await page.content());
  }

  await browser.close();
})();
