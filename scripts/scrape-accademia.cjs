/**
 * Galleria dell'Accademia Scraper
 * 
 * Scrapes artworks from Galleria dell'Accademia di Firenze
 * Home of Michelangelo's David
 * 
 * Collects: title, artist, date, technique, dimensions, collection, inventory, image
 * Collections: Painting, Sculpture, Musical Instruments
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.galleriaaccademiafirenze.it/en/art-archive/';
const OUTPUT_DIR = path.join(__dirname, '../public/data');
const PROGRESS_FILE = path.join(__dirname, '../downloads/accademia-progress.json');
const OUTPUT_FILE = 'accademia-collection.json';
const SAVE_INTERVAL = 20;

const delay = ms => new Promise(r => setTimeout(r, ms));
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const log = msg => console.log(`[${timestamp()}] [ACCADEMIA] ${msg}`);

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    } catch (e) {
      log('⚠️ Failed to load progress, starting fresh');
    }
  }
  return { artworks: [], scrapedSlugs: [], done: false };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// Extract artworks from the archive page (all on one page with filtering)
async function extractGridItems(page) {
  return await page.evaluate(() => {
    const items = [];
    const seenHrefs = new Set();
    
    // Look for artwork cards/links
    const links = document.querySelectorAll('a[href*="/artworks/"]');
    
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (!href || seenHrefs.has(href)) return;
      
      seenHrefs.add(href);
      
      // Extract slug from URL
      const slugMatch = href.match(/\/artworks\/([^/]+)\/?$/);
      if (!slugMatch) return;
      
      const slug = slugMatch[1];
      
      // Get collection type from card
      const card = link.closest('a') || link;
      const textContent = card.textContent.trim();
      
      // Try to extract info from the link text
      // Format: "COLLECTION Title Artist Date - Medium"
      let collection = '';
      let title = '';
      let artist = '';
      
      const collectionMatch = textContent.match(/^(PAINTING|SCULPTURE|MUSICAL INSTRUMENTS)\s+/);
      if (collectionMatch) {
        collection = collectionMatch[1];
      }
      
      // Get image if available
      const img = link.querySelector('img');
      let imageUrl = '';
      if (img && img.src) {
        imageUrl = img.src;
      }
      
      items.push({
        slug,
        sourceUrl: href.startsWith('http') ? href : 'https://www.galleriaaccademiafirenze.it' + href,
        previewCollection: collection,
        previewImage: imageUrl
      });
    });
    
    return items;
  });
}

// Extract detailed info from artwork page
async function extractArtworkDetails(page, item) {
  try {
    await page.goto(item.sourceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(1000);
    
    const details = await page.evaluate(() => {
      const result = {
        title: '',
        artist: '',
        date: '',
        technique: '',
        dimensions: '',
        collection: '',
        inventory: '',
        description: '',
        image: ''
      };
      
      // Title - h1 but not the museum name
      const h1 = document.querySelector('h1');
      if (h1) {
        const h1Text = h1.textContent.trim();
        // Skip if it's the museum name
        if (!h1Text.includes('Galleria dell\'Accademia')) {
          result.title = h1Text;
        }
      }
      
      // If title not found in h1, try other methods
      if (!result.title) {
        // Look for artwork title in page structure
        const titleEl = document.querySelector('.artwork-title, .entry-title, article h1, main h1');
        if (titleEl) {
          const text = titleEl.textContent.trim();
          if (!text.includes('Galleria dell\'Accademia')) {
            result.title = text;
          }
        }
      }
      
      // Fall back to meta title
      if (!result.title) {
        const metaTitle = document.querySelector('meta[property="og:title"]');
        if (metaTitle && metaTitle.content) {
          const text = metaTitle.content.trim();
          if (!text.includes('Galleria dell\'Accademia')) {
            result.title = text;
          }
        }
      }
      
      // Artist - look for the author line or h2-like element
      const pageText = document.body.innerText;
      
      // Look for "Author:" pattern
      const authorMatch = pageText.match(/Author:\s*([^\n]+)/i);
      if (authorMatch) result.artist = authorMatch[1].trim();
      
      // Date
      const dateMatch = pageText.match(/Date:\s*([^\n]+)/i);
      if (dateMatch) result.date = dateMatch[1].trim();
      
      // Collection
      const collectionMatch = pageText.match(/Collection:\s*([^\n]+)/i);
      if (collectionMatch) result.collection = collectionMatch[1].trim();
      
      // Technique
      const techMatch = pageText.match(/Technique:\s*([^\n]+)/i);
      if (techMatch) result.technique = techMatch[1].trim();
      
      // Dimensions
      const dimMatch = pageText.match(/Dimensions:\s*([^\n]+)/i);
      if (dimMatch) result.dimensions = dimMatch[1].trim();
      
      // Inventory
      const invMatch = pageText.match(/Inventory:\s*([^\n]+)/i);
      if (invMatch) result.inventory = invMatch[1].trim();
      
      // Get main image - look for wp-content uploads
      const imgs = document.querySelectorAll('img[src*="wp-content/uploads"]');
      for (const img of imgs) {
        const src = img.src;
        // Skip small thumbnails, logos
        if (src.includes('logo') || src.includes('MIC-logo') || src.includes('avatar')) continue;
        if (img.width > 200 || !img.width) {
          result.image = src;
          break;
        }
      }
      
      // Description - look for main content paragraphs
      const paragraphs = document.querySelectorAll('p');
      for (const p of paragraphs) {
        const text = p.textContent.trim();
        if (text.length > 100 && !text.includes('cookies') && !text.includes('consent') && !text.includes('Newsletter')) {
          result.description = text.substring(0, 500);
          break;
        }
      }
      
      return result;
    });
    
    return {
      id: item.slug,
      slug: item.slug,
      title: details.title,
      artist: details.artist,
      date: details.date,
      technique: details.technique,
      dimensions: details.dimensions,
      collection: details.collection || item.previewCollection,
      inventory: details.inventory,
      description: details.description,
      image: details.image || item.previewImage,
      sourceUrl: item.sourceUrl
    };
  } catch (e) {
    log(`  ⚠️ Failed to get details for ${item.slug}: ${e.message}`);
    return {
      id: item.slug,
      slug: item.slug,
      image: item.previewImage,
      sourceUrl: item.sourceUrl,
      error: e.message
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const testMode = args.includes('--test');
  
  log(`🎨 Galleria dell'Accademia Scraper`);
  log(`   Mode: ${testMode ? 'TEST (first 20 items)' : 'FULL'}`);
  log(`   Home of Michelangelo's David`);
  
  const progress = loadProgress();
  
  if (progress.done && !testMode) {
    log('✅ Already completed. Delete progress file to restart.');
    return;
  }
  
  log(`   Resuming with ${progress.artworks.length} items already scraped`);
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const listPage = await context.newPage();
  const detailPage = await context.newPage();
  
  try {
    log(`📄 Loading art archive page...`);
    await listPage.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await delay(3000);
    
    // Handle cookie consent
    try {
      const acceptBtn = await listPage.$('text=ACCEPT');
      if (acceptBtn) {
        await acceptBtn.click();
        await delay(500);
      }
    } catch (e) {}
    
    // Scroll to load all items (if lazy loaded)
    for (let i = 0; i < 5; i++) {
      await listPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(500);
    }
    
    const gridItems = await extractGridItems(listPage);
    log(`   Found ${gridItems.length} total items`);
    
    const maxItems = testMode ? 20 : gridItems.length;
    
    for (let i = 0; i < Math.min(maxItems, gridItems.length); i++) {
      const item = gridItems[i];
      
      // Skip if already scraped
      if (progress.scrapedSlugs.includes(item.slug)) {
        continue;
      }
      
      const fullItem = await extractArtworkDetails(detailPage, item);
      
      // Skip if no image
      if (!fullItem.image || fullItem.image === '') {
        log(`   ⚠️ Skipping ${item.slug} - no image`);
        progress.scrapedSlugs.push(item.slug);
        continue;
      }
      
      progress.artworks.push(fullItem);
      progress.scrapedSlugs.push(item.slug);
      
      // Save progress periodically
      if (progress.artworks.length % SAVE_INTERVAL === 0) {
        saveProgress(progress);
        log(`   💾 Saved: ${progress.artworks.length} items`);
      }
      
      await delay(300);
    }
    
    progress.done = !testMode;
    
  } finally {
    await browser.close();
  }
  
  // Final save
  saveProgress(progress);
  
  // Create output file
  const outputData = {
    museum: "Galleria dell'Accademia di Firenze",
    museumId: "accademia-firenze",
    location: "Florence, Italy",
    type: "permanent",
    scrapedAt: new Date().toISOString(),
    totalArtworks: progress.artworks.length,
    artworksWithImage: progress.artworks.filter(a => a.image).length,
    collections: {
      painting: progress.artworks.filter(a => a.collection?.includes('PAINTING')).length,
      sculpture: progress.artworks.filter(a => a.collection?.includes('SCULPTURE')).length,
      instruments: progress.artworks.filter(a => a.collection?.includes('MUSICAL')).length
    },
    objects: progress.artworks
  };
  
  fs.writeFileSync(path.join(OUTPUT_DIR, OUTPUT_FILE), JSON.stringify(outputData, null, 2));
  log(`✅ Done! ${progress.artworks.length} items saved to ${OUTPUT_FILE}`);
  
  // Summary
  log(`\n📊 Summary:`);
  log(`   Total: ${progress.artworks.length}`);
  log(`   Paintings: ${outputData.collections.painting}`);
  log(`   Sculptures: ${outputData.collections.sculpture}`);
  log(`   Musical Instruments: ${outputData.collections.instruments}`);
}

main().catch(console.error);
