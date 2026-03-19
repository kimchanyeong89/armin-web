const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/banrep-collection.json');

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  
  // URL from user, but we might need to handle pagination if possible.
  // The URL has wm=1 and v=mosaic.
  const baseUrl = "https://colecciones.banrepcultural.org/page/coleccin-de-arte/6357aa7ae27d753f221c618d?v=mosaic&wm=1&denominacin%5B0%5D=Pintura%20Tipo%20de%20objeto%20f%C3%ADsico";
  
  console.log(`Navigating to ${baseUrl}...`);
  await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });

  // Scroll to load more items (if infinite scroll) or check pagination.
  // For now, let's just scrape what's visible + maybe trigger some scrolls.
  
  let items = [];
  let previousHeight = 0;
  let retries = 0;

  // Try to scroll down a few times to trigger lazy loading
  let noNewItemsCount = 0;
  
  for (let i = 0; i < 50; i++) { // Increase scroll limit
    previousHeight = await page.evaluate('document.body.scrollHeight');
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    
    // Wait for network idle or timeout, sometimes loading takes a while
    try {
        await page.waitForNetworkIdle({ timeout: 5000, idleTime: 500 });
    } catch (e) {
        // Timeout is fine, just means it's still busy or done
        await new Promise(r => setTimeout(r, 2000));
    }
    
    // Also try checking for a specific "Load More" button if it exists
    const loadMoreVisible = await page.evaluate(() => {
        const btn = document.querySelector('.sw-pagination-more-button, button[class*="load-more"]');
        if (btn && btn.offsetParent !== null) {
            btn.click();
            return true;
        }
        return false;
    });

    if (loadMoreVisible) {
        console.log(`Clicked load more button on iter ${i}`);
        await new Promise(r => setTimeout(r, 3000));
    }

    const currentItems = await scrapeItems(page);
    console.log(`Iter ${i}: Found ${currentItems.length} items so far`);
    
    // If we haven't found new items in 3 iterations, stop
    if (currentItems.length === items.length && !loadMoreVisible) {
        noNewItemsCount++;
        if (noNewItemsCount >= 3) {
            console.log("No new items found for 3 iterations, stopping.");
            break;
        }
    } else {
        noNewItemsCount = 0;
        items = currentItems; // update count
    }
  }

  // Final scrape
  items = await scrapeItems(page);
  console.log(`Final count: ${items.length}`);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(items, null, 2));
  console.log(`Saved to ${OUTPUT_FILE}`);

  await browser.close();
})();

async function scrapeItems(page) {
  return await page.evaluate(() => {
    const extracted = [];
    const nodes = document.querySelectorAll('.masonry-item');
    nodes.forEach(node => {
      const linkEl = node.querySelector('a.card-hover');
      const imgEl = node.querySelector('.hit-image img');
      const titleEl = node.querySelector('h2.label');
      
      const ps = Array.from(node.querySelectorAll('.col-11.vstack p.mb-1'));
      // Usually date is first, artist is second, or vice versa.
      // Based on snippet: <p>1971</p><p>Manuel Hernández Gómez</p>
      // So date seems to be first? Or maybe depends.
      // Let's grab both and heuristics likely in frontend or just store as text.
      
      let date = '';
      let artist = '';
      
      if (ps.length >= 2) {
        // Simple heuristic: 4 digits is likely a date
        const t1 = ps[0].innerText.trim();
        const t2 = ps[1].innerText.trim();
        if (/^\d{4}$/.test(t1) || /^\d{4}-\d{4}$/.test(t1)) {
            date = t1;
            artist = t2;
        } else {
            artist = t1;
            date = t2;
        }
      } else if (ps.length === 1) {
         const t1 = ps[0].innerText.trim();
         if (/^\d{4}$/.test(t1)) date = t1;
         else artist = t1;
      }

      if (imgEl && titleEl) {
        const id = linkEl ? linkEl.href.split('/').pop().split('?')[0] : Math.random().toString(36);
        extracted.push({
          id: 'banrep-' + id,
          title: titleEl.innerText.trim(),
          image: imgEl.src,
          artist: artist || 'Unknown',
          date: date || '',
          source: 'Banco de la República (Colombia)',
          detailUrl: linkEl ? linkEl.href : ''
        });
      }
    });
    return extracted;
  });
}
