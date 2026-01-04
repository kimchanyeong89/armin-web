/**
 * Castello di Rivoli Full Scraper - with Load More button
 * Collects ALL artworks by clicking Load More repeatedly
 * Only includes artworks with images
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  collectionUrl: 'https://www.castellodirivoli.org/en/collections/',
  outputPath: path.join(__dirname, '../public/data/castello-di-rivoli-collection.json'),
  progressPath: path.join(__dirname, '../downloads/rivoli-full-progress.json')
};

function saveProgress(data) {
  fs.writeFileSync(CONFIG.progressPath, JSON.stringify(data, null, 2));
}

function saveOutput(artworks) {
  fs.writeFileSync(CONFIG.outputPath, JSON.stringify(artworks, null, 2));
  console.log(`\nSaved ${artworks.length} artworks to ${CONFIG.outputPath}`);
}

async function main() {
  console.log('=== Castello di Rivoli Full Scraper ===');
  console.log('Collecting ALL artworks with Load More button\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(120000);

  try {
    console.log('Loading collection page...');
    await page.goto(CONFIG.collectionUrl, { waitUntil: 'networkidle2', timeout: 120000 });
    await new Promise(r => setTimeout(r, 3000));

    let previousCount = 0;
    let currentCount = 0;
    let clickCount = 0;

    // Keep clicking Load More until no new items appear
    while (true) {
      // Count current artworks
      currentCount = await page.evaluate(() => {
        return document.querySelectorAll('article.work, .work-item, a[href*="/opera/"]').length;
      });

      console.log(`Click ${clickCount}: Found ${currentCount} artworks`);

      // Check for Load More button
      const loadMoreExists = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('a, button'));
        const loadMore = buttons.find(b => 
          b.textContent.toLowerCase().includes('load more') || 
          b.textContent.toLowerCase().includes('carica altri') ||
          b.classList.contains('load-more')
        );
        if (loadMore) {
          loadMore.click();
          return true;
        }
        return false;
      });

      if (!loadMoreExists) {
        console.log('No more Load More button found');
        break;
      }

      // Wait for new content to load
      await new Promise(r => setTimeout(r, 2000));
      clickCount++;

      // Check if we got new items
      const newCount = await page.evaluate(() => {
        return document.querySelectorAll('article.work, .work-item, a[href*="/opera/"]').length;
      });

      if (newCount === currentCount && clickCount > 5) {
        console.log('No new items loaded, stopping');
        break;
      }

      // Safety limit
      if (clickCount > 50) {
        console.log('Reached click limit');
        break;
      }
    }

    // Collect all artwork URLs
    console.log('\nCollecting artwork URLs...');
    const artworkUrls = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="/opera/"]');
      const urls = new Set();
      links.forEach(link => {
        if (link.href && link.href.includes('/opera/')) {
          urls.add(link.href);
        }
      });
      return Array.from(urls);
    });

    console.log(`Found ${artworkUrls.length} unique artwork URLs`);
    saveProgress({ urls: artworkUrls, count: artworkUrls.length });

    // Scrape each artwork
    const artworks = [];
    for (let i = 0; i < artworkUrls.length; i++) {
      const url = artworkUrls[i];
      console.log(`[${i + 1}/${artworkUrls.length}] ${url.split('/').slice(-2, -1)[0]}`);

      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(r => setTimeout(r, 1000));

        const data = await page.evaluate(() => {
          // Get image
          const img = document.querySelector('.work-image img, .opera-image img, article img, .entry-content img');
          const imageUrl = img ? (img.src || img.dataset.src) : '';

          // Get title
          const titleEl = document.querySelector('h1, .work-title, .opera-title');
          const title = titleEl ? titleEl.textContent.trim() : '';

          // Get all text content for parsing
          const content = document.querySelector('.work-content, .opera-content, .entry-content, article');
          const rawText = content ? content.textContent.replace(/\s+/g, ' ').trim() : '';

          return { title, imageUrl, rawText, url: window.location.href };
        });

        // Skip if no image
        if (!data.imageUrl || data.imageUrl.length < 10) {
          console.log('  -> Skipped (no image)');
          continue;
        }

        // Parse artist and year from raw text
        let artist = '';
        let year = '';
        let medium = '';

        // Pattern: "Artist Name Year" or "Artist Name Date medium"
        const artistMatch = data.rawText.match(/Artist\s+([A-Za-zÀ-ÿ\s\-\.]+?)(?:\s+(\d{4})|\s+\d|$)/i);
        if (artistMatch) {
          artist = artistMatch[1].trim();
          if (artistMatch[2]) year = artistMatch[2];
        }

        // Find year if not found
        if (!year) {
          const yearMatch = data.rawText.match(/\b(19\d{2}|20\d{2})\b/);
          if (yearMatch) year = yearMatch[1];
        }

        // Find medium
        const mediumPatterns = [
          /oil on canvas/i, /acrylic/i, /bronze/i, /marble/i, /video/i,
          /installation/i, /photograph/i, /mixed media/i, /sculpture/i,
          /neon/i, /steel/i, /wood/i, /paper/i, /fabric/i
        ];
        for (const pattern of mediumPatterns) {
          const match = data.rawText.match(pattern);
          if (match) {
            medium = match[0];
            break;
          }
        }

        const artwork = {
          id: `rivoli-${String(artworks.length + 1).padStart(4, '0')}`,
          title: data.title || 'Untitled',
          artist: artist,
          date: year,
          medium: medium,
          dimensions: '',
          type: 'Contemporary Art',
          imageUrl: data.imageUrl,
          sourceUrl: data.url,
          museum: 'Castello di Rivoli',
          museumShortName: 'Rivoli'
        };

        artworks.push(artwork);

        // Save progress every 50 items
        if (artworks.length % 50 === 0) {
          saveProgress({ urls: artworkUrls, artworks, count: artworks.length });
          console.log(`  Progress saved: ${artworks.length} artworks`);
        }

      } catch (error) {
        console.log(`  -> Error: ${error.message}`);
      }
    }

    await browser.close();

    // Save final output
    saveOutput(artworks);

    // Statistics
    console.log('\n=== Statistics ===');
    console.log(`Total artworks: ${artworks.length}`);
    console.log(`With artist: ${artworks.filter(a => a.artist).length}`);
    console.log(`With date: ${artworks.filter(a => a.date).length}`);
    console.log(`With medium: ${artworks.filter(a => a.medium).length}`);

  } catch (error) {
    console.error('Error:', error);
    await browser.close();
  }
}

main().catch(console.error);
