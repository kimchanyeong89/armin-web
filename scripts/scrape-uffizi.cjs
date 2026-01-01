/**
 * Uffizi Gallery Scraper
 * 
 * Scrapes artworks from Uffizi Galleries (The Uffizi, Pitti Palace, Boboli Gardens)
 * Collects: title, artist, date, technique, size, museum, collection, location, inventory, image
 * 
 * Features:
 * - Grid page scraping with pagination
 * - Detail page scraping for full metadata
 * - Progress saving every 20 items
 * - Resume from last page
 * - Duplicate detection by slug
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.uffizi.it/en/artworks/search';
const OUTPUT_DIR = path.join(__dirname, '../public/data');
const PROGRESS_FILE = path.join(__dirname, '../downloads/uffizi-progress.json');
const OUTPUT_FILE = 'uffizi-collection.json';
const SAVE_INTERVAL = 20;

const delay = ms => new Promise(r => setTimeout(r, ms));
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const log = msg => console.log(`[${timestamp()}] [UFFIZI] ${msg}`);

// Load or create progress
function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    } catch (e) {
      log('⚠️ Failed to load progress, starting fresh');
    }
  }
  return { artworks: [], scrapedSlugs: [], lastPage: 0, totalPages: 47 };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// Extract artworks from grid page
async function extractGridItems(page) {
  return await page.evaluate(() => {
    const items = [];
    // Look for artwork links on the grid
    const links = document.querySelectorAll('a[href*="/artworks/"]');
    const seenHrefs = new Set();
    
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (!href || seenHrefs.has(href)) return;
      if (href.includes('/search')) return; // Skip search link
      
      seenHrefs.add(href);
      
      // Extract slug from URL
      const slugMatch = href.match(/\/artworks\/([^/?#]+)/);
      if (!slugMatch) return;
      
      const slug = slugMatch[1];
      
      // Try to get title and artist from link content
      const textContent = link.textContent.trim();
      const lines = textContent.split('\n').map(l => l.trim()).filter(l => l);
      
      // Get image if available
      const img = link.querySelector('img');
      let imageUrl = '';
      if (img) {
        // Try srcset first, then src
        const srcset = img.getAttribute('srcset');
        if (srcset) {
          // Get highest resolution from srcset
          const srcsetParts = srcset.split(',').map(s => s.trim());
          const lastPart = srcsetParts[srcsetParts.length - 1];
          imageUrl = lastPart.split(' ')[0];
        } else {
          imageUrl = img.src;
        }
      }
      
      items.push({
        slug,
        sourceUrl: href.startsWith('http') ? href : 'https://www.uffizi.it' + href,
        previewTitle: lines[0] || '',
        previewArtist: lines[1] || '',
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
        size: '',
        museum: '',
        collection: '',
        location: '',
        inventory: '',
        description: '',
        tags: [],
        image: ''
      };
      
      // Title - h1
      const h1 = document.querySelector('h1');
      if (h1) result.title = h1.textContent.trim();
      
      // Artist - h2 under h1
      const h2 = document.querySelector('h1 + h2, h2');
      if (h2) result.artist = h2.textContent.trim();
      
      // Get main image - look for datocms-assets
      const imgs = document.querySelectorAll('img[src*="datocms-assets"], img[srcset*="datocms-assets"]');
      for (const img of imgs) {
        const srcset = img.getAttribute('srcset');
        if (srcset) {
          // Get highest resolution
          const parts = srcset.split(',').map(s => s.trim());
          const lastPart = parts[parts.length - 1];
          const url = lastPart.split(' ')[0];
          if (url && url.includes('datocms-assets')) {
            result.image = url;
            break;
          }
        } else if (img.src && img.src.includes('datocms-assets')) {
          result.image = img.src;
          break;
        }
      }
      
      // Characteristics section - look for dt/dd or label/value pairs
      const pageText = document.body.innerText;
      
      // Extract date
      const dateMatch = pageText.match(/Date\s*\n?\s*([^\n]+)/i);
      if (dateMatch) result.date = dateMatch[1].trim();
      
      // Extract technique
      const techMatch = pageText.match(/Technique\s*\n?\s*([^\n]+)/i);
      if (techMatch) result.technique = techMatch[1].trim();
      
      // Extract size
      const sizeMatch = pageText.match(/Size\s*\n?\s*([^\n]+)/i);
      if (sizeMatch) result.size = sizeMatch[1].trim();
      
      // Extract inventory
      const invMatch = pageText.match(/Inventory\s*\n?\s*([^\n]+)/i);
      if (invMatch) result.inventory = invMatch[1].trim();
      
      // Extract location
      const locMatch = pageText.match(/Location\s*\n?\s*([^\n]+)/i);
      if (locMatch) result.location = locMatch[1].trim();
      
      // Museum - from links or page text
      const museumLink = document.querySelector('a[href*="/the-uffizi"], a[href*="/pitti-palace"], a[href*="/boboli-garden"]');
      if (museumLink) {
        result.museum = museumLink.textContent.trim();
      } else {
        // Try from page text
        if (pageText.includes('The Uffizi') || pageText.includes('Uffizi Gallery')) {
          result.museum = 'The Uffizi';
        } else if (pageText.includes('Pitti Palace') || pageText.includes('Palazzo Pitti')) {
          result.museum = 'Pitti Palace';
        } else if (pageText.includes('Boboli')) {
          result.museum = 'Boboli Gardens';
        }
      }
      
      // Collection - from links
      const collectionLink = document.querySelector('a[href*="/painting"], a[href*="/sculpture"], a[href*="/drawings"]');
      if (collectionLink) result.collection = collectionLink.textContent.trim();
      
      // Tags
      const tagLinks = document.querySelectorAll('a[href*="/td/"]');
      tagLinks.forEach(t => {
        const tag = t.textContent.trim();
        if (tag && !result.tags.includes(tag)) result.tags.push(tag);
      });
      
      // Description - first paragraph after characteristics
      const paragraphs = document.querySelectorAll('p');
      for (const p of paragraphs) {
        const text = p.textContent.trim();
        if (text.length > 100 && !text.includes('cookies') && !text.includes('consent')) {
          result.description = text.substring(0, 500);
          break;
        }
      }
      
      return result;
    });
    
    // Merge with item data
    return {
      id: item.slug,
      slug: item.slug,
      title: details.title || item.previewTitle,
      artist: details.artist || item.previewArtist,
      date: details.date,
      technique: details.technique,
      size: details.size,
      museum: details.museum,
      collection: details.collection,
      location: details.location,
      inventory: details.inventory,
      description: details.description,
      tags: details.tags,
      image: details.image || item.previewImage,
      sourceUrl: item.sourceUrl
    };
  } catch (e) {
    log(`  ⚠️ Failed to get details for ${item.slug}: ${e.message}`);
    return {
      id: item.slug,
      slug: item.slug,
      title: item.previewTitle,
      artist: item.previewArtist,
      image: item.previewImage,
      sourceUrl: item.sourceUrl,
      error: e.message
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const testMode = args.includes('--test');
  const maxPages = testMode ? 3 : 47;
  
  log(`🖼️ Uffizi Gallery Scraper`);
  log(`   Mode: ${testMode ? 'TEST (3 pages)' : 'FULL (47 pages)'}`);
  log(`   Total artworks: ~983`);
  
  const progress = loadProgress();
  log(`   Resuming from page ${progress.lastPage + 1}, ${progress.artworks.length} items already scraped`);
  
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
    const startPage = progress.lastPage + 1;
    
    for (let pageNum = startPage; pageNum <= maxPages; pageNum++) {
      const pageUrl = pageNum === 1 ? BASE_URL : `${BASE_URL}?page=${pageNum}`;
      log(`📄 Page ${pageNum}/${maxPages}...`);
      
      await listPage.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await delay(2000);
      
      // Handle cookie consent if present
      try {
        const rejectBtn = await listPage.$('button:has-text("Reject all")');
        if (rejectBtn) {
          await rejectBtn.click();
          await delay(500);
        }
      } catch (e) {}
      
      const gridItems = await extractGridItems(listPage);
      log(`   Found ${gridItems.length} items`);
      
      for (const item of gridItems) {
        // Skip if already scraped
        if (progress.scrapedSlugs.includes(item.slug)) {
          continue;
        }
        
        const fullItem = await extractArtworkDetails(detailPage, item);
        
        // Skip if no image (placeholder check)
        if (!fullItem.image || fullItem.image === '') {
          log(`   ⚠️ Skipping ${item.slug} - no image`);
          progress.scrapedSlugs.push(item.slug);
          continue;
        }
        
        progress.artworks.push(fullItem);
        progress.scrapedSlugs.push(item.slug);
        
        // Save progress periodically
        if (progress.artworks.length % SAVE_INTERVAL === 0) {
          progress.lastPage = pageNum;
          saveProgress(progress);
          log(`   💾 Saved: ${progress.artworks.length} items`);
        }
        
        await delay(300);
      }
      
      progress.lastPage = pageNum;
    }
    
  } finally {
    await browser.close();
  }
  
  // Final save
  saveProgress(progress);
  
  // Create output file
  const outputData = {
    museum: "Uffizi Galleries",
    museumId: "uffizi",
    location: "Florence, Italy",
    type: "permanent",
    scrapedAt: new Date().toISOString(),
    totalArtworks: progress.artworks.length,
    artworksWithImage: progress.artworks.filter(a => a.image).length,
    collections: {
      uffizi: progress.artworks.filter(a => a.museum === 'The Uffizi').length,
      pitti: progress.artworks.filter(a => a.museum === 'Pitti Palace').length,
      boboli: progress.artworks.filter(a => a.museum === 'Boboli Gardens').length
    },
    objects: progress.artworks
  };
  
  fs.writeFileSync(path.join(OUTPUT_DIR, OUTPUT_FILE), JSON.stringify(outputData, null, 2));
  log(`✅ Done! ${progress.artworks.length} items saved to ${OUTPUT_FILE}`);
  
  // Summary
  log(`\n📊 Summary:`);
  log(`   Total: ${progress.artworks.length}`);
  log(`   With image: ${outputData.artworksWithImage}`);
  log(`   The Uffizi: ${outputData.collections.uffizi}`);
  log(`   Pitti Palace: ${outputData.collections.pitti}`);
  log(`   Boboli Gardens: ${outputData.collections.boboli}`);
}

main().catch(console.error);
