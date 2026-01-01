/**
 * Lille & Rouen Merge Scraper
 * 
 * Scrapes new artworks and merges with existing collections
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const delay = ms => new Promise(r => setTimeout(r, ms));
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });

const COLLECTIONS = {
  'lille': {
    name: 'Palais des Beaux-Arts de Lille',
    url: 'https://images.grandpalaisrmn.fr/search-result?CS_FILTER_ASSETS[]=media&CS_FILTER_ASSETS[]=offers&CS_MERGE=media%2Coffers&SEARCHLANGUAGE=eng_usa&SEARCHTXT1=Lille&SEARCHMODE=NEW&CATEGORY[]=276172&CATEGORY[]=271490&ENHANCED_ORIENTATION[]=all&SERIESDISPLAY=1&EVENT=WEBSHOP_SEARCH',
    existingFile: 'palais-beaux-arts-lille-collection.json',
    idPrefix: 'lille-pba',
    museum: 'Palais des Beaux-Arts de Lille'
  },
  'rouen': {
    name: 'Musée des Beaux-Arts de Rouen',
    url: 'https://images.grandpalaisrmn.fr/search-result?CS_FILTER_ASSETS[]=media&CS_FILTER_ASSETS[]=offers&CS_MERGE=media%2Coffers&SEARCHLANGUAGE=eng_usa&SEARCHTXT1=Rouen&SEARCHMODE=NEW&ENHANCED_ORIENTATION[]=all&SERIESDISPLAY=1&CATEGORY[]=276912&EVENT=WEBSHOP_SEARCH',
    existingFile: 'musee-beaux-arts-rouen-collection.json',
    idPrefix: 'rouen-mba',
    museum: 'Musée des Beaux-Arts de Rouen'
  }
};

const log = (prefix, msg) => console.log(`[${timestamp()}] [${prefix}] ${msg}`);

async function scrapeDetailPage(page, sourceUrl) {
  if (!sourceUrl) return { artist: null, date: null, dimensions: null, medium: null };
  
  try {
    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await delay(1200);
    
    const details = await page.evaluate(() => {
      let artist = null, date = null, dimensions = null, medium = null, technique = null, period = null, highResImage = null;
      
      const isCopyright = (val) => {
        if (!val) return true;
        const lower = val.toLowerCase();
        return val.includes('©') || lower.includes('all rights reserved') || lower.includes('adagp') || lower.includes('rights') || lower.includes('droits');
      };
      
      document.querySelectorAll('.previewmeta').forEach(meta => {
        const legend = meta.querySelector('.previewmeta-legend')?.textContent?.trim()?.toLowerCase() || '';
        const contentEl = meta.querySelector('.previewmeta-content .metadata-value');
        const value = contentEl?.textContent?.trim() || '';
        
        if (!value || legend.includes('credit') || legend.includes('crédit') || legend.includes('copyright')) return;
        
        if ((legend.includes('author') || legend.includes('auteur') || legend.includes('artist')) && !isCopyright(value)) {
          artist = value;
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

async function scrapeAndMerge(collectionId) {
  const config = COLLECTIONS[collectionId];
  const taskName = config.name;
  
  log(taskName, '🚀 Starting scrape with merge...');
  
  // Load existing collection
  const existingPath = path.join(OUTPUT_DIR, config.existingFile);
  let existingData = { objects: [] };
  let existingTitles = new Set();
  let maxId = 0;
  
  if (fs.existsSync(existingPath)) {
    try {
      existingData = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
      const objects = existingData.objects || existingData.artworks || [];
      log(taskName, `📂 Loaded existing: ${objects.length} items`);
      
      objects.forEach(obj => {
        if (obj.title) existingTitles.add(obj.title.toLowerCase().trim());
        const idMatch = obj.id?.match(/-(\d+)$/);
        if (idMatch) maxId = Math.max(maxId, parseInt(idMatch[1]));
      });
      log(taskName, `📊 Max ID: ${maxId}`);
    } catch (e) {
      log(taskName, `⚠️ Could not load existing: ${e.message}`);
    }
  }
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  const newArtworks = new Map();
  
  log(taskName, `📍 Navigating to search page...`);
  await page.goto(config.url, { waitUntil: 'networkidle', timeout: 60000 });
  await delay(5000);
  
  // Accept cookies
  try {
    const cookieBtn = await page.$('button:has-text("accept"), #onetrust-accept-btn-handler');
    if (cookieBtn) { await cookieBtn.click(); await delay(1000); log(taskName, '🍪 Accepted cookies'); }
  } catch (e) {}
  
  // Get total
  const totalText = await page.$eval('.count-result, .total-results', el => el.textContent).catch(() => '');
  log(taskName, `📊 Total results: ${totalText}`);
  
  // Paginate
  let pageNum = 1;
  const maxPages = 150;
  
  while (pageNum <= maxPages) {
    log(taskName, `📄 Page ${pageNum}: Extracting...`);
    
    const items = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('.media-item, .search-result-item').forEach(el => {
        const linkEl = el.querySelector('a[href*="/preview/"]');
        const imgEl = el.querySelector('img');
        const titleEl = el.querySelector('.media-item-title, h3, h4');
        
        if (linkEl && imgEl) {
          let imageUrl = imgEl.src || imgEl.dataset.src || '';
          if (imageUrl.includes('/thumbs/')) imageUrl = imageUrl.replace('/thumbs/', '/images/');
          
          results.push({
            title: titleEl?.textContent?.trim() || 'Untitled',
            imageUrl,
            sourceUrl: linkEl.href
          });
        }
      });
      return results;
    });
    
    let newCount = 0;
    for (const item of items) {
      const titleKey = item.title.toLowerCase().trim();
      if (!existingTitles.has(titleKey) && !newArtworks.has(item.sourceUrl)) {
        newArtworks.set(item.sourceUrl, item);
        newCount++;
      }
    }
    
    log(taskName, `   Found ${items.length}, ${newCount} new. Total new: ${newArtworks.size}`);
    
    const nextLink = await page.$('.media-item-paging-next a');
    if (!nextLink || !(await nextLink.isVisible())) {
      log(taskName, '   No more pages');
      break;
    }
    
    try {
      await nextLink.click();
      await delay(3000);
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      pageNum++;
    } catch (e) {
      break;
    }
  }
  
  log(taskName, `📦 Collected ${newArtworks.size} NEW artworks`);
  
  if (newArtworks.size === 0) {
    log(taskName, '✅ No new artworks. Collection up to date!');
    await browser.close();
    return;
  }
  
  // Enrich with details
  const artworksList = Array.from(newArtworks.values());
  log(taskName, `🔍 Enriching details (10 parallel)...`);
  
  const PARALLEL = 10;
  const pages = await Promise.all(Array.from({ length: PARALLEL }, () => context.newPage()));
  let enriched = 0;
  
  for (let i = 0; i < artworksList.length; i += PARALLEL) {
    const batch = artworksList.slice(i, i + PARALLEL);
    
    await Promise.all(batch.map(async (art, idx) => {
      try {
        const details = await scrapeDetailPage(pages[idx % PARALLEL], art.sourceUrl);
        Object.assign(art, details);
        if (details.highResImage) art.imageUrl = details.highResImage;
        enriched++;
      } catch (e) {}
    }));
    
    const processed = Math.min(i + PARALLEL, artworksList.length);
    if (processed % 100 < PARALLEL || processed === artworksList.length) {
      log(taskName, `   Enriched ${processed}/${artworksList.length}`);
    }
    await delay(100);
  }
  
  await Promise.all(pages.map(p => p.close()));
  log(taskName, `✅ Enriched ${enriched} artworks`);
  
  // Merge
  let nextId = maxId + 1;
  const newObjects = artworksList.map(art => ({
    title: art.title,
    artist: art.artist || 'Unknown',
    date: art.date || null,
    image: art.imageUrl,
    medium: art.medium || 'Painting',
    dimensions: art.dimensions || null,
    sourceUrl: art.sourceUrl,
    id: `${config.idPrefix}-${nextId++}`,
    addedAt: new Date().toISOString()
  }));
  
  const existingObjects = existingData.objects || existingData.artworks || [];
  const merged = [...existingObjects, ...newObjects];
  
  const output = {
    ...existingData,
    scrapedAt: new Date().toISOString(),
    totalObjects: merged.length,
    objects: merged
  };
  
  // Save to existing file
  fs.writeFileSync(existingPath, JSON.stringify(output, null, 2));
  log(taskName, `💾 Saved ${merged.length} total (${newObjects.length} new added)`);
  
  await browser.close();
  
  console.log(`\n✅ ${taskName}: ${existingObjects.length} existing + ${newObjects.length} new = ${merged.length} total\n`);
}

// Main
const collectionId = process.argv[2];
if (!collectionId || !COLLECTIONS[collectionId]) {
  console.log('Usage: node scrape-merge-collection.cjs <lille|rouen>');
  process.exit(1);
}

scrapeAndMerge(collectionId).catch(console.error);
