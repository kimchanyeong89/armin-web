/**
 * Castello di Rivoli FULL Scraper v2
 * Click Load More until all 900+ artworks loaded
 * Skip artworks without images
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/castello-di-rivoli-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/rivoli-v2-progress.json');

function saveProgress(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

function saveOutput(artworks) {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
  console.log(`Saved ${artworks.length} artworks to ${OUTPUT_FILE}`);
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch (e) {}
  return { urls: [], artworks: [], completed: [] };
}

async function collectAllUrls(page) {
  console.log('Collecting all artwork URLs...');
  
  await page.goto('https://www.castellodirivoli.org/en/collections/', { 
    waitUntil: 'networkidle', 
    timeout: 120000 
  });
  await page.waitForTimeout(3000);
  
  let clickCount = 0;
  let previousCount = 0;
  let noChangeCount = 0;
  
  // Click up to 50 times to get all ~900+ artworks
  while (clickCount < 50) {
    const urlCount = await page.evaluate(() => {
      return new Set(Array.from(document.querySelectorAll('a[href*="/opera/"]')).map(l => l.href)).size;
    });
    
    if (urlCount === previousCount) {
      noChangeCount++;
      if (noChangeCount >= 3) {
        console.log(`No new URLs after ${clickCount} clicks, stopping`);
        break;
      }
    } else {
      noChangeCount = 0;
    }
    
    console.log(`Click ${clickCount}: ${urlCount} URLs`);
    previousCount = urlCount;
    
    // Find and click Load More button
    const btn = await page.$('a.btn-loadmore');
    if (!btn) {
      console.log('No Load More button found');
      break;
    }
    
    try {
      await btn.click();
      await page.waitForTimeout(2500);
    } catch (e) {
      console.log('Button click failed');
      break;
    }
    
    clickCount++;
  }
  
  // Collect all URLs
  const urls = await page.evaluate(() => {
    return Array.from(new Set(Array.from(document.querySelectorAll('a[href*="/opera/"]')).map(l => l.href)));
  });
  
  console.log(`Total URLs collected: ${urls.length}`);
  return urls;
}

async function scrapeArtwork(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1000);
  
  return await page.evaluate(() => {
    // Get image
    const img = document.querySelector('.work-image img, .opera-image img, article img, .entry-content img, .featured-image img');
    const imageUrl = img ? (img.src || img.dataset.src || img.getAttribute('data-lazy-src')) : '';
    
    // Get title
    const titleEl = document.querySelector('h1.entry-title, h1, .work-title');
    const title = titleEl ? titleEl.textContent.trim() : '';
    
    // Get content for parsing
    const content = document.querySelector('.entry-content, .work-content, article');
    const rawText = content ? content.textContent.replace(/\s+/g, ' ').trim() : '';
    
    return { title, imageUrl, rawText, url: window.location.href };
  });
}

function parseArtworkData(data, index) {
  let artist = '';
  let year = '';
  let medium = '';
  
  // Parse artist: "Artist Name Year" pattern
  const artistMatch = data.rawText.match(/Artist\s+([A-Za-zÀ-ÿ\s\-\.\']+?)(?:\s+(\d{4})|\s+\d|$)/i);
  if (artistMatch) {
    artist = artistMatch[1].trim().replace(/\s+/g, ' ');
    if (artistMatch[2]) year = artistMatch[2];
  }
  
  // Find year if not found
  if (!year) {
    const yearMatch = data.rawText.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch) year = yearMatch[1];
  }
  
  // Find medium
  const mediumPatterns = [
    /oil on canvas/i, /acrylic on canvas/i, /acrylic/i, /bronze/i, /marble/i,
    /video installation/i, /video projection/i, /video/i, /installation/i,
    /photograph/i, /photography/i, /mixed media/i, /sculpture/i,
    /neon/i, /steel/i, /wood/i, /paper/i, /fabric/i, /silkscreen/i,
    /aluminium/i, /aluminum/i, /glass/i, /ceramic/i, /plaster/i
  ];
  
  for (const pattern of mediumPatterns) {
    const match = data.rawText.match(pattern);
    if (match) {
      medium = match[0];
      break;
    }
  }
  
  return {
    id: `rivoli-${String(index).padStart(4, '0')}`,
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
}

async function main() {
  console.log('=== Castello di Rivoli Full Scraper v2 ===\n');
  
  const progress = loadProgress();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    // Step 1: Get all URLs
    let urls = progress.urls;
    if (urls.length === 0) {
      urls = await collectAllUrls(page);
      progress.urls = urls;
      saveProgress(progress);
    } else {
      console.log(`Resuming with ${urls.length} URLs`);
    }
    
    // Step 2: Scrape each artwork
    const artworks = progress.artworks || [];
    const completed = new Set(progress.completed || []);
    
    console.log(`\nScraping ${urls.length - completed.size} remaining artworks...\n`);
    
    let artworkIndex = artworks.length + 1;
    
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      
      if (completed.has(url)) continue;
      
      const slug = url.split('/').slice(-2, -1)[0];
      console.log(`[${i + 1}/${urls.length}] ${slug}`);
      
      try {
        const data = await scrapeArtwork(page, url);
        
        // Skip if no image
        if (!data.imageUrl || data.imageUrl.length < 10 || data.imageUrl.includes('placeholder')) {
          console.log('  -> Skipped (no image)');
          completed.add(url);
          continue;
        }
        
        const artwork = parseArtworkData(data, artworkIndex);
        artworks.push(artwork);
        completed.add(url);
        artworkIndex++;
        
        // Save progress every 50
        if (artworks.length % 50 === 0) {
          progress.artworks = artworks;
          progress.completed = Array.from(completed);
          saveProgress(progress);
          console.log(`  Progress saved: ${artworks.length} artworks`);
        }
        
      } catch (error) {
        console.log(`  -> Error: ${error.message}`);
        completed.add(url);
      }
    }
    
    // Save final
    progress.artworks = artworks;
    progress.completed = Array.from(completed);
    saveProgress(progress);
    saveOutput(artworks);
    
    // Statistics
    console.log('\n=== Statistics ===');
    console.log(`Total artworks: ${artworks.length}`);
    console.log(`With artist: ${artworks.filter(a => a.artist).length}`);
    console.log(`With date: ${artworks.filter(a => a.date).length}`);
    console.log(`With medium: ${artworks.filter(a => a.medium).length}`);
    console.log(`With image: ${artworks.filter(a => a.imageUrl).length}`);
    
  } catch (error) {
    console.error('Error:', error);
  }
  
  await browser.close();
}

main().catch(console.error);
