/**
 * Petit Palais Scraper with Merge Logic
 * 
 * Scrapes new drawings from Grand Palais RMN and merges with existing collection
 * Deduplicates based on title and image URL
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const EXISTING_FILE = path.join(OUTPUT_DIR, 'petit-palais-collection.json');
const delay = ms => new Promise(r => setTimeout(r, ms));
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const log = (msg) => console.log(`[${timestamp()}] [Petit Palais Merge] ${msg}`);

const SEARCH_URL = 'https://images.grandpalaisrmn.fr/search-result?CS_FILTER_ASSETS[]=media&CS_FILTER_ASSETS[]=offers&CS_MERGE=media%2Coffers&SEARCHLANGUAGE=eng_usa&SEARCHTXT1=petit+palais&SEARCHMODE=NEW&CATEGORY[]=276788&CATEGORY[]=271479&CATEGORY[]=199397&ENHANCED_ORIENTATION[]=all&SERIESDISPLAY=1&EVENT=WEBSHOP_SEARCH';

// Helper: Check if value looks like copyright info (NOT an artist)
const isCopyrightInfo = (val) => {
  if (!val) return true;
  const lower = val.toLowerCase();
  return (
    val.includes('©') ||
    lower.includes('all rights reserved') ||
    lower.includes('adagp') ||
    lower.includes('sabam') ||
    lower.includes('vegap') ||
    lower.includes('dacs') ||
    lower.includes('siae') ||
    lower.includes('vg bild-kunst') ||
    lower.includes('rights') ||
    lower.includes('droits') ||
    lower.includes('copyright')
  );
};

async function scrapeDetailPage(page, sourceUrl) {
  if (!sourceUrl) return { artist: null, date: null, dimensions: null, medium: null };
  
  try {
    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await delay(1200);
    
    const details = await page.evaluate(() => {
      let artist = null;
      let date = null;
      let dimensions = null;
      let medium = null;
      let technique = null;
      let period = null;
      let highResImage = null;
      
      const isCopyright = (val) => {
        if (!val) return true;
        const lower = val.toLowerCase();
        return (
          val.includes('©') ||
          lower.includes('all rights reserved') ||
          lower.includes('adagp') ||
          lower.includes('sabam') ||
          lower.includes('rights') ||
          lower.includes('droits') ||
          lower.includes('copyright')
        );
      };
      
      const previewMetas = document.querySelectorAll('.previewmeta');
      previewMetas.forEach(meta => {
        const legend = meta.querySelector('.previewmeta-legend')?.textContent?.trim()?.toLowerCase() || '';
        const contentEl = meta.querySelector('.previewmeta-content .metadata-value');
        const value = contentEl?.textContent?.trim() || '';
        
        if (!value) return;
        
        if (legend.includes('credit') || legend.includes('crédit') || legend.includes('copyright') || legend.includes('droit')) {
          return;
        }
        
        if (legend.includes('author') || legend.includes('auteur') || legend.includes('artist')) {
          if (!isCopyright(value)) {
            artist = value;
          }
        }
        if (legend.includes('period') || legend.includes('période') || legend.includes('date') || legend.includes('dating')) {
          period = value;
        }
        if (legend.includes('technique') || legend.includes('medium') || legend.includes('material')) {
          technique = value;
        }
        if (legend.includes('dimension') && !legend.includes('image')) {
          dimensions = value;
        }
        if (legend.includes('category') || legend.includes('catégorie')) {
          if (!medium) medium = value;
        }
      });
      
      if (period) date = period;
      if (technique && !medium) medium = technique;
      highResImage = document.querySelector('meta[property="og:image"]')?.content || null;
      
      return { artist, date, dimensions, medium, highResImage };
    });
    
    return details;
  } catch (e) {
    return { artist: null, date: null, dimensions: null, medium: null };
  }
}

async function main() {
  log('🚀 Starting Petit Palais scrape with merge...');
  
  // Load existing collection
  let existingData = { objects: [] };
  let existingTitles = new Set();
  let existingImages = new Set();
  let maxId = 0;
  
  if (fs.existsSync(EXISTING_FILE)) {
    try {
      existingData = JSON.parse(fs.readFileSync(EXISTING_FILE, 'utf8'));
      log(`📂 Loaded existing collection: ${existingData.objects?.length || existingData.totalObjects || 0} items`);
      
      // Build dedup sets
      (existingData.objects || []).forEach(obj => {
        if (obj.title) existingTitles.add(obj.title.toLowerCase().trim());
        if (obj.image) existingImages.add(obj.image);
        if (obj.imageUrl) existingImages.add(obj.imageUrl);
        
        // Track max ID
        const idMatch = obj.id?.match(/petit-palais-(\d+)/);
        if (idMatch) {
          maxId = Math.max(maxId, parseInt(idMatch[1]));
        }
      });
      log(`📊 Existing: ${existingTitles.size} unique titles, max ID: ${maxId}`);
    } catch (e) {
      log(`⚠️ Could not load existing file: ${e.message}`);
    }
  }
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  const newArtworks = new Map();
  
  log(`📍 Navigating to search page...`);
  await page.goto(SEARCH_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await delay(5000);
  
  // Accept cookies
  try {
    const cookieBtn = await page.$('button:has-text("accept"), button:has-text("Accept"), .cookie-accept, #onetrust-accept-btn-handler');
    if (cookieBtn) {
      await cookieBtn.click();
      await delay(1000);
      log('🍪 Accepted cookies');
    }
  } catch (e) {}
  
  // Get total count
  const totalText = await page.$eval('.count-result, .total-results, .result-count', el => el.textContent).catch(() => '');
  log(`📊 Total results: ${totalText}`);
  
  // Paginate and collect
  const maxPages = 150;
  let pageNum = 1;
  
  while (pageNum <= maxPages) {
    log(`📄 Page ${pageNum}: Extracting items...`);
    
    const items = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('.media-item, .search-result-item, .item-result').forEach(el => {
        const linkEl = el.querySelector('a[href*="/preview/"]');
        const imgEl = el.querySelector('img');
        const titleEl = el.querySelector('.media-item-title, .item-title, h3, h4');
        
        if (linkEl && imgEl) {
          const sourceUrl = linkEl.href;
          let imageUrl = imgEl.src || imgEl.dataset.src || '';
          
          // Try to get higher res version
          if (imageUrl.includes('/thumbs/')) {
            imageUrl = imageUrl.replace('/thumbs/', '/images/');
          }
          
          results.push({
            title: titleEl?.textContent?.trim() || 'Untitled',
            imageUrl,
            sourceUrl,
            id: sourceUrl.match(/\/preview\/([^/]+)/)?.[1] || ''
          });
        }
      });
      return results;
    });
    
    let newItems = 0;
    for (const item of items) {
      const titleKey = item.title.toLowerCase().trim();
      
      // Skip if duplicate
      if (existingTitles.has(titleKey) || existingImages.has(item.imageUrl)) {
        continue;
      }
      
      if (!newArtworks.has(item.sourceUrl)) {
        newArtworks.set(item.sourceUrl, item);
        newItems++;
      }
    }
    
    log(`   Found ${items.length} items, ${newItems} new (not in existing). Total new: ${newArtworks.size}`);
    
    // Check for next page
    const nextLink = await page.$('.media-item-paging-next a');
    if (!nextLink) {
      log('   No more pages');
      break;
    }
    
    const isVisible = await nextLink.isVisible();
    if (!isVisible) {
      log('   Next link not visible, done');
      break;
    }
    
    try {
      await nextLink.click();
      await delay(3000);
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      pageNum++;
    } catch (e) {
      log(`   Failed to navigate: ${e.message}`);
      break;
    }
    
    if (pageNum % 10 === 0) {
      log(`   Progress: ${newArtworks.size} new items collected`);
    }
  }
  
  log(`📦 Collected ${newArtworks.size} NEW unique artworks`);
  
  if (newArtworks.size === 0) {
    log('✅ No new artworks to add. Collection is up to date!');
    await browser.close();
    return;
  }
  
  // Enrich with details
  const artworksList = Array.from(newArtworks.values());
  log(`🔍 Scraping detail pages for metadata (10 parallel pages)...`);
  
  const PARALLEL_PAGES = 10;
  const pages = await Promise.all(
    Array.from({ length: PARALLEL_PAGES }, () => context.newPage())
  );
  
  let enriched = 0;
  
  for (let i = 0; i < artworksList.length; i += PARALLEL_PAGES) {
    const batch = artworksList.slice(i, i + PARALLEL_PAGES);
    
    await Promise.all(batch.map(async (artwork, batchIdx) => {
      if (artwork.sourceUrl) {
        try {
          const detailPage = pages[batchIdx % PARALLEL_PAGES];
          const details = await scrapeDetailPage(detailPage, artwork.sourceUrl);
          artwork.artist = details.artist;
          artwork.date = details.date;
          artwork.dimensions = details.dimensions;
          artwork.medium = details.medium;
          if (details.highResImage) artwork.imageUrl = details.highResImage;
          enriched++;
        } catch (e) {}
      }
    }));
    
    const processed = Math.min(i + PARALLEL_PAGES, artworksList.length);
    if (processed % 100 < PARALLEL_PAGES || processed === artworksList.length) {
      log(`   Enriched ${processed}/${artworksList.length} (${enriched} with data)`);
    }
    
    await delay(100);
  }
  
  await Promise.all(pages.map(p => p.close()));
  log(`✅ Enriched ${enriched}/${artworksList.length} artworks with details`);
  
  // Assign new IDs and merge
  let nextId = maxId + 1;
  const newObjects = artworksList.map(art => ({
    title: art.title,
    artist: art.artist || 'Unknown',
    date: art.date || null,
    image: art.imageUrl,
    medium: art.medium || 'Drawing',
    dimensions: art.dimensions || null,
    sourceUrl: art.sourceUrl,
    id: `petit-palais-${nextId++}`,
    type: 'Drawing',
    addedAt: new Date().toISOString()
  }));
  
  // Merge with existing
  const mergedObjects = [...(existingData.objects || []), ...newObjects];
  
  const output = {
    ...existingData,
    scrapedAt: new Date().toISOString(),
    totalObjects: mergedObjects.length,
    objects: mergedObjects
  };
  
  fs.writeFileSync(EXISTING_FILE, JSON.stringify(output, null, 2));
  log(`💾 Saved ${mergedObjects.length} total artworks (${newObjects.length} new added)`);
  
  await browser.close();
  
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  PETIT PALAIS MERGE COMPLETE                                  ║');
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  console.log(`║  Existing: ${existingData.objects?.length || 0} items                                       ║`);
  console.log(`║  New added: ${newObjects.length} items                                       ║`);
  console.log(`║  Total: ${mergedObjects.length} items                                          ║`);
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');
}

main().catch(console.error);
