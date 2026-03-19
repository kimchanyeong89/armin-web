const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const cheerio = require('cheerio');
// FAMSF Base URL
const BASE_URL = 'https://www.famsf.org';

// Classifications to scrape
// Corrected based on HTML inspection:
// 65: Painting
// 69: Drawing (was mislabeled as Sculpture)
// 66: Print (was mislabeled as Photography)
// 19: Collage
const TARGET_CLASSIFICATIONS = [
  { id: '65', name: 'Painting' },
  { id: '69', name: 'Drawing' },
  { id: '66', name: 'Print' },
  { id: '19', name: 'Collage' }
];

// Output path
const OUTPUT_FILE = path.join(__dirname, '../public/data/famsf-collections.json');

// Helper to delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(classificationId, page, retries = 3) {
  const url = `${BASE_URL}/art-finder?classifications=${classificationId}&page=${page}`;
  console.log(`Fetching ${url}...`);
  
  for (let i = 0; i < retries; i++) {
    try {
      // Use curl instead of fetch to avoid WAF/TLS fingerprinting issues
      // fetching from node often results in emuseum URLs instead of storage URLs
      const cmd = `curl -s -L "${url}"`;
      const html = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      
      if (!html || html.length < 100) {
          throw new Error('Empty response');
      }
      fs.writeFileSync('debug-node-curl.html', html);
      return html;
    } catch (err) {
      if (i < retries - 1) {
          console.log(`  Error/Network error, retrying (${i+1}/${retries})...`);
          await delay(2000);
          continue;
      }
      console.error(`Error fetching ${url}:`, err.message);
      return null;
    }
  }
  return null;
}

function parseItems(html, classificationId, defaultCategoryName) {
  const $ = cheerio.load(html);
  const items = [];
  
  const lis = $('li');
  console.log(`Debug: Found ${lis.length} li elements`);

  // Find all li items that look like cards
  // Based on HTML structure: li containing div.group > div.flex.flex-col-reverse
  lis.each((_, el) => {
    const $li = $(el);
    const $title = $li.find('h3');
    if ($title.length === 0) return;
    
    // console.log('Debug: Found potential card with h3');

    const titleFull = $title.text().trim();
    // Artist selector may vary. Found .f-body-1 in search results, .f-ui-6 in others?
    // Try multiple selectors.
    const artist = $li.find('.f-ui-6, .f-body-1').first().text().trim();
    const link = $li.find('a[href^="https://www.famsf.org/artworks/"]').first().attr('href') ||  
                 $li.find('a[href^="/artworks/"]').first().attr('href');
    
    // Image
    const $img = $li.find('img').first();
    const srcset = $img.attr('srcset');
    let imageUrl = $img.attr('src');
    
    // Default to null if we can't find a good storage URL
    let foundStorageUrl = false;
    
    if (srcset) {
      // Try to get the largest image from srcset
      // Format: url size, url size, ...
      const sources = srcset.split(',').map(s => {
        const parts = s.trim().split(/\s+/);
        return { url: parts[0], w: parts[1] ? parseInt(parts[1]) : 0 };
      });

      // Filter sources to ensure they are valid image URLs
      const validSources = sources.filter(s => s.url && !s.url.includes('data:image'));
      
      // Sort by priority (storage > emuseum) then by size descending
      validSources.sort((a, b) => {
        // Check for 'storage' path explicitly
        const aIsStorage = a.url.includes('/storage/') || a.url.includes('famsf.org/storage/');
        const bIsStorage = b.url.includes('/storage/') || b.url.includes('famsf.org/storage/');
        if (aIsStorage && !bIsStorage) return -1;
        if (!aIsStorage && bIsStorage) return 1;
        return b.w - a.w;
      });

      if (validSources.length > 0) {
        imageUrl = validSources[0].url;
      }
    } 

    if (imageUrl && imageUrl.startsWith('/')) {
        imageUrl = 'https://www.famsf.org' + imageUrl;
    }

    if (!imageUrl) {
        // Skip this item if we can't find ANY image
        // return; 
    }

    // On View Status checks
    // The "de Young" / "Legion of Honor" badge links to onview_dy=1 etc, but might just indicate ownership.
    // We will extract location from it, but not assume isOnView.
    // If the text explicitly says "On view", we'll set it.
    
    let location = null;
    const locationLink = $li.find('a[href*="onview_dy=1"], a[href*="onview_lh=1"]');
    if (locationLink.length > 0) {
        const href = locationLink.attr('href') || '';
        if (href.includes('onview_dy=1')) location = 'de Young';
        if (href.includes('onview_lh=1')) location = 'Legion of Honor';
    }

    const textContent = $li.text();
    const isOnView = /On view/i.test(textContent);

    if (titleFull && link) {
      // Split title and date if possible. Title often ends with comma year.
      // "Yellow Lampshade, 1969"
      let title = titleFull;
      let date = '';
      const lastCommaIndex = titleFull.lastIndexOf(', ');
      if (lastCommaIndex > -1 && lastCommaIndex > titleFull.length - 10) {
        // Assume last part is date if it's short
        date = titleFull.substring(lastCommaIndex + 2);
        title = titleFull.substring(0, lastCommaIndex);
      }

      items.push({
        id: link.split('/').pop(),
        title,
        date,
        artist,
        classificationId,
        classification: defaultCategoryName,
        imageUrl,
        url: link.startsWith('http') ? link : BASE_URL + link,
        isOnView,
        location
      });
    }
  });

  return items;
}

// Check for "Next page" link/button presence
function hasNextPage(html) {
  const $ = cheerio.load(html);
  // Find link with aria-label="Next page" that is NOT hidden
  const $next = $('a[aria-label="Next page"]:not(.hidden)');
  return $next.length > 0;
}


async function scrape() {
  let allItems = [];
  const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT) : 0;
  
  // Try to load existing
  if (process.env.RESUME !== '0' && fs.existsSync(OUTPUT_FILE)) {
      try {
          allItems = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
          console.log(`Loaded ${allItems.length} existing items.`);
      } catch(e) {}
  } else {
      console.log('Starting fresh (RESUME=0 or no file)...');
  }

  for (const cls of TARGET_CLASSIFICATIONS) {
    if (LIMIT > 0 && allItems.length >= LIMIT) break;

    console.log(`\n=== Scraping Classification: ${cls.name} (${cls.id}) ===`);
    
    // Resume logic: Calculate start page based on existing item count
    // Assuming 18 items per page approx. We back up 1 page to be safe.
    const existingCount = allItems.filter(i => i.classificationId === cls.id).length;
    let page = Math.max(1, Math.floor(existingCount / 18));
    if (process.env.RESUME !== '0' && existingCount > 0) {
        console.log(`  Resuming from approximate page ${page} (found ${existingCount} items locally)`);
    } else {
        page = 1;
    }

    let hasNext = true;

    while (hasNext) {
      // Safety limit: increased for large collections (Prints ~90k items)
      if (page > 6000) { 
        break; 
      }
      if (LIMIT > 0 && allItems.length >= LIMIT) {
          console.log(`Hit limit ${LIMIT}`);
          break;
      }
      
      const html = await fetchPage(cls.id, page);
      if (page === 1) require('fs').writeFileSync('debug-famsf-p1.html', html);
      if (!html) break;

      const items = parseItems(html, cls.id, cls.name);
      console.log(`Page ${page}: Found ${items.length} items`);
      
      if (items.length === 0) {
        hasNext = false;
        break;
      }

      // Dedup
      let newCount = 0;
      for (const item of items) {
         // Update existing item if found (to apply fixes) or add new
         const idx = allItems.findIndex(x => x.id === item.id);
         if (idx >= 0) {
             // Optional: update logic. For now, we are in 'fresh start' mode primarily.
             // But if we are resuming to FIX, we might want to replace.
             // Let's assume restart for fixes.
         } else {
             allItems.push(item);
             newCount++;
         }
      }
      console.log(`  Added ${newCount} new items`);

      if(newCount === 0 && page > 1) {
          // If a page returns only duplicates, we might have looped or reached end weirdly
          // But strict pagination usually implies unique items. 
          // However, if the site content shifted...
      }

      hasNext = hasNextPage(html);
      
      // Save progress
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));

      page++;
      await delay(800); 
    }
  }

  console.log(`\nTotal items scraped: ${allItems.length}`);
}

scrape();
