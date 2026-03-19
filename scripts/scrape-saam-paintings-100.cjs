const { chromium } = require('playwright');
const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const MAX_ITEMS = 100;
const OUT_FILE = 'public/data/saam-paintings-100.json';
const BASE_URL = 'https://americanart.si.edu/search/artworks?f[0]=object_type:Paintings';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  
  const items = [];
  let pageNum = 0;

  try {
    while (items.length < MAX_ITEMS) {
      const page = await context.newPage();
      const url = `${BASE_URL}&page=${pageNum}`;
      console.log(`Navigating to ${url}...`);
      
      let capturedHtml = '';
      
      // Listen for the data response
      page.on('response', async (response) => {
          if (response.url().includes('services/wire/search/results')) {
              console.log('Captured search/results response!');
              try {
                  capturedHtml = await response.text();
              } catch (e) {
                  console.error('Failed to read response text', e);
              }
          }
      });

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      
      // Wait a bit for the XHR to complete if it hasn't
      await page.waitForTimeout(5000);

      let cardsHtml = capturedHtml;
      
      if (!cardsHtml) {
          console.log('Did not capture wire response, checking DOM...');
          // Fallback to DOM extraction
          try {
              // Wait for cards - checking for any card
              await page.waitForSelector('.azalea-card', { timeout: 5000 });
              cardsHtml = await page.content();
          } catch (e) {
              console.log('Timeout waiting for selector in DOM.');
              await page.screenshot({ path: `debug-saam-fail-${pageNum}.png` });
          }
      }

      if (cardsHtml) {
          const dom = new JSDOM(cardsHtml);
          const doc = dom.window.document;
          const cards = Array.from(doc.querySelectorAll('.azalea-card'));
          
          console.log(`Found ${cards.length} cards in HTML source.`);
          
          for (const card of cards) {
              if (items.length >= MAX_ITEMS) break;
              
              const link = card.querySelector('a[href^="/artwork/"]');
              const titleHeader = card.querySelector('header a') || card.querySelector('.azalea-heading-level-4');
              const title = titleHeader?.textContent?.trim();
              const img = card.querySelector('img');
              const imgSrc = img ? (img.getAttribute('src') || img.src) : null;
              
              if (!link || !title) continue; // Footer cards might be different
              
              // Metadata extraction
              let artist = '';
              let date = '';
              
              // Look for label/value pairs. "Artist" header
              // Structure: <strong ...>Artist</strong> ... <div><a ...>Name</a></div>
              const labels = card.querySelectorAll('strong');
              labels.forEach(strong => {
                  const label = strong.textContent.trim().toLowerCase();
                  // Traverse up/next to find value
                  // Often <div class="azalea-text-sm"><strong ...>Artist</strong><div>...<a>Name</a>
                  if (label === 'artist') {
                      // Try next sibling or parent's text
                      // In debug html: <div class="flex..."><strong...>Artist</strong><div>...<a>Name</a>
                      const container = strong.closest('.flex') || strong.parentElement;
                      if (container) {
                          artist = container.textContent.replace(/Artist/i, '').trim();
                      }
                  }
                  if (label === 'date') {
                      const container = strong.closest('.azalea-text-sm') || strong.parentElement;
                      if (container) {
                          date = container.textContent.replace(/Date/i, '').trim();
                      }
                  }
              });

              // Construct proper ID from link
              // href="/artwork/justice-our-lives-117003" -> "justice-our-lives-117003"
              const slug = link.getAttribute('href').split('/').pop();
              // Or use image ID if available
              let id = slug; // Default to slug
              if (imgSrc && imgSrc.includes('id=')) {
                 const m = imgSrc.match(/id=([^&]+)/);
                 if (m) id = m[1];
              }
              
              // Filter out footer links "Visit SAAM" etc which also use .azalea-card
              if (!slug.match(/\d+$/)) {
                  // likely navigation card
                  continue; 
              }

              const item = {
                  id,
                  title,
                  artist,
                  date,
                  image: imgSrc,
                  url: 'https://americanart.si.edu' + link.getAttribute('href')
              };
              
              // Dedup
              if (!items.find(i => i.id === item.id)) {
                  if (item.image && !item.image.includes('placeholder')) {
                      items.push(item);
                  }
              }
          }
      }

      console.log(`Total collected: ${items.length}`);
      await page.close();
      
      if (items.length >= MAX_ITEMS) break;
      pageNum++;
    }

    fs.writeFileSync(OUT_FILE, JSON.stringify(items, null, 2));
    console.log(`Wrote ${items.length} items to ${OUT_FILE}`);

  } catch (e) {
    console.error('Scrape error:', e);
  } finally {
    await browser.close();
  }
})();
