/**
 * Grand Palais RMN Full Scraper with Detail Pages
 * 
 * Scrapes multiple collections with full metadata (artist, date, dimensions)
 * 
 * Collections:
 * 1. Musée Condé - Paintings (re-scrape with full details)
 * 2. Musée Condé - Drawings (full 3323 items)
 * 3. Versailles - Paintings & Drawings (CATEGORY 271490, 277162)
 * 4. Musée Guimet - Combined (Drawings 271479 + Paintings 271490)
 * 5. MAC/VAL Charenton (CATEGORY 275848, 271491, 200813)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const delay = ms => new Promise(r => setTimeout(r, ms));
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const log = (prefix, msg) => console.log(`[${timestamp()}] [${prefix}] ${msg}`);

// ═══════════════════════════════════════════════════════════════
// Collection Configurations
// ═══════════════════════════════════════════════════════════════
const COLLECTIONS = {
  'mucem': {
    name: 'Mucem - Musée des civilisations de l\'Europe et de la Méditerranée',
    urls: [
      'https://images.grandpalaisrmn.fr/search-result?CS_FILTER_ASSETS[]=media&CS_FILTER_ASSETS[]=offers&CS_MERGE=media%2Coffers&SEARCHLANGUAGE=eng_usa&SEARCHTXT1=Mucem&SEARCHMODE=NEW&CATEGORY[]=276242&CATEGORY[]=271490&ENHANCED_ORIENTATION[]=all&SERIESDISPLAY=1&EVENT=WEBSHOP_SEARCH',
      'https://images.grandpalaisrmn.fr/search-result?CS_FILTER_ASSETS[]=media&CS_FILTER_ASSETS[]=offers&CS_MERGE=media%2Coffers&SEARCHLANGUAGE=eng_usa&SEARCHTXT1=Mucem&SEARCHMODE=NEW&CATEGORY[]=276242&CATEGORY[]=271480&ENHANCED_ORIENTATION[]=all&SERIESDISPLAY=1&EVENT=WEBSHOP_SEARCH',
      'https://images.grandpalaisrmn.fr/search-result?CS_FILTER_ASSETS[]=media&CS_FILTER_ASSETS[]=offers&CS_MERGE=media%2Coffers&SEARCHLANGUAGE=eng_usa&SEARCHTXT1=Mucem&SEARCHMODE=NEW&CATEGORY[]=276242&CATEGORY[]=271479&ENHANCED_ORIENTATION[]=all&SERIESDISPLAY=1&EVENT=WEBSHOP_SEARCH'
    ],
    outputFile: 'mucem-collection.json',
    museum: 'Mucem, Marseille',
    type: 'Mixed'
  },
  'fabre': {
    name: 'Musée Fabre - Montpellier',
    url: 'https://images.grandpalaisrmn.fr/search-result?CS_FILTER_ASSETS[]=media&CS_FILTER_ASSETS[]=offers&CS_MERGE=media%2Coffers&SEARCHLANGUAGE=eng_usa&SEARCHTXT1=Fabre&SEARCHMODE=NEW&ENHANCED_ORIENTATION[]=all&SERIESDISPLAY=1&CATEGORY[]=276328&EVENT=WEBSHOP_SEARCH',
    outputFile: 'musee-fabre-collection.json',
    museum: 'Musée Fabre, Montpellier',
    type: 'Mixed'
  },
  'chagall': {
    name: 'Musée national Marc Chagall - Nice',
    url: 'https://images.grandpalaisrmn.fr/search-result?CS_FILTER_ASSETS[]=media&CS_FILTER_ASSETS[]=offers&CS_MERGE=media%2Coffers&SEARCHLANGUAGE=eng_usa&SEARCHTXT1=Chagall&SEARCHMODE=NEW&ENHANCED_ORIENTATION[]=all&SERIESDISPLAY=1&CATEGORY[]=276398&EVENT=WEBSHOP_SEARCH',
    outputFile: 'musee-chagall-collection.json',
    museum: 'Musée national Marc Chagall, Nice',
    type: 'Mixed'
  },
  'piscine': {
    name: 'La Piscine - Musée d\'Art et d\'Industrie André Diligent',
    url: 'https://images.grandpalaisrmn.fr/search-result?CS_FILTER_ASSETS[]=media&CS_FILTER_ASSETS[]=offers&CS_MERGE=media%2Coffers&SEARCHLANGUAGE=eng_usa&SEARCHTXT1=Piscine&SEARCHMODE=NEW&CATEGORY[]=276898&CATEGORY[]=271490&ENHANCED_ORIENTATION[]=all&SERIESDISPLAY=1&EVENT=WEBSHOP_SEARCH',
    outputFile: 'la-piscine-collection.json',
    museum: 'La Piscine, Roubaix',
    type: 'Painting'
  },
  'conde-paintings': {
    name: 'Musée Condé - Paintings',
    url: 'https://images.grandpalaisrmn.fr/search-result?CS_MERGE=media%2Ccollections&SEARCHTXT1=%22conde%22&SEARCHMODE=NEW&CATEGORY[]=275846&CATEGORY[]=271490&EVENT=WEBSHOP_SEARCH',
    outputFile: 'musee-conde-paintings.json',
    museum: 'Musée Condé, Chantilly',
    type: 'Painting'
  },
  'conde-drawings': {
    name: 'Musée Condé - Drawings', 
    url: 'https://images.grandpalaisrmn.fr/search-result?CS_MERGE=media%2Ccollections&SEARCHTXT1=%22conde%22&SEARCHMODE=NEW&CATEGORY[]=275846&CATEGORY[]=271479&EVENT=WEBSHOP_SEARCH',
    outputFile: 'musee-conde-drawings.json',
    museum: 'Musée Condé, Chantilly',
    type: 'Drawing'
  },
  'versailles': {
    name: 'Château de Versailles Collection',
    url: 'https://images.grandpalaisrmn.fr/search-result?CS_FILTER_ASSETS[]=media&CS_FILTER_ASSETS[]=offers&CS_MERGE=media%2Coffers&SEARCHLANGUAGE=eng_usa&SEARCHTXT1=versailles&SEARCHMODE=NEW&CATEGORY[]=271490&CATEGORY[]=277162&ENHANCED_ORIENTATION[]=all&SERIESDISPLAY=1&EVENT=WEBSHOP_SEARCH',
    outputFile: 'versailles-collection.json',
    museum: 'Château de Versailles',
    type: 'Painting'
  },
  'guimet': {
    name: 'Musée Guimet Collection',
    // We'll combine drawings and paintings into one
    urls: [
      'https://images.grandpalaisrmn.fr/search-result?CS_FILTER_ASSETS[]=media&CS_FILTER_ASSETS[]=offers&CS_MERGE=media%2Coffers&SEARCHLANGUAGE=eng_usa&SEARCHTXT1=guimet&SEARCHMODE=NEW&CATEGORY[]=276752&CATEGORY[]=271479&ENHANCED_ORIENTATION[]=all&SERIESDISPLAY=1&EVENT=WEBSHOP_SEARCH',
      'https://images.grandpalaisrmn.fr/search-result?CS_FILTER_ASSETS[]=media&CS_FILTER_ASSETS[]=offers&CS_MERGE=media%2Coffers&SEARCHLANGUAGE=eng_usa&SEARCHTXT1=guimet&SEARCHMODE=NEW&CATEGORY[]=276752&CATEGORY[]=271490&ENHANCED_ORIENTATION[]=all&SERIESDISPLAY=1&EVENT=WEBSHOP_SEARCH'
    ],
    outputFile: 'musee-guimet-collection.json',
    museum: 'Musée national des arts asiatiques - Guimet',
    type: 'Mixed'
  },
  'macval': {
    name: 'MAC/VAL - Musée d\'art contemporain du Val-de-Marne',
    url: 'https://images.grandpalaisrmn.fr/search-result?CS_FILTER_ASSETS[]=media&CS_FILTER_ASSETS[]=offers&CS_MERGE=media%2Coffers&SEARCHLANGUAGE=eng_usa&SEARCHTXT1=Charenton&SEARCHMODE=NEW&CATEGORY[]=275848&CATEGORY[]=271491&CATEGORY[]=200813&ENHANCED_ORIENTATION[]=all&SERIESDISPLAY=1&EVENT=WEBSHOP_SEARCH',
    outputFile: 'macval-collection.json',
    museum: 'MAC/VAL, Vitry-sur-Seine',
    type: 'Contemporary Art'
  },
  'petit-palais': {
    name: 'Petit Palais - Drawings Collection',
    url: 'https://images.grandpalaisrmn.fr/search-result?CS_FILTER_ASSETS[]=media&CS_FILTER_ASSETS[]=offers&CS_MERGE=media%2Coffers&SEARCHLANGUAGE=eng_usa&SEARCHTXT1=petit+palais&SEARCHMODE=NEW&CATEGORY[]=276788&CATEGORY[]=271479&CATEGORY[]=199397&ENHANCED_ORIENTATION[]=all&SERIESDISPLAY=1&EVENT=WEBSHOP_SEARCH',
    outputFile: 'petit-palais-drawings.json',
    museum: 'Petit Palais, Paris',
    type: 'Drawing',
    mergeWith: 'petit-palais-collection.json'
  },
  'carnavalet-paintings': {
    name: 'Musée Carnavalet - Paintings',
    url: 'https://images.grandpalaisrmn.fr/search-result?CS_FILTER_ASSETS[]=media&CS_FILTER_ASSETS[]=offers&CS_MERGE=media%2Coffers&SEARCHLANGUAGE=eng_usa&SEARCHTXT1=Carnavalet&SEARCHMODE=NEW&CATEGORY[]=276676&CATEGORY[]=271490&ENHANCED_ORIENTATION[]=all&SERIESDISPLAY=1&EVENT=WEBSHOP_SEARCH',
    outputFile: 'carnavalet-paintings.json',
    museum: 'Musée Carnavalet, Paris',
    type: 'Painting'
  },
  'carnavalet-prints': {
    name: 'Musée Carnavalet - Prints',
    url: 'https://images.grandpalaisrmn.fr/search-result?CS_FILTER_ASSETS[]=media&CS_FILTER_ASSETS[]=offers&CS_MERGE=media%2Coffers&SEARCHLANGUAGE=eng_usa&SEARCHTXT1=Carnavalet&SEARCHMODE=NEW&CATEGORY[]=276676&CATEGORY[]=271480&ENHANCED_ORIENTATION[]=all&SERIESDISPLAY=1&EVENT=WEBSHOP_SEARCH',
    outputFile: 'carnavalet-prints.json',
    museum: 'Musée Carnavalet, Paris',
    type: 'Print'
  },
  'vatican': {
    name: 'Vatican Museums',
    url: 'https://images.grandpalaisrmn.fr/search-result?EVENT=WEBSHOP_SEARCH&SEARCHMODE=DEEP&CATEGORY[]=281634',
    outputFile: 'vatican-collection.json',
    museum: 'Vatican Museums',
    location: 'Vatican City',
    type: 'Mixed'
  },
  'lille-paintings': {
    name: 'Palais des Beaux-Arts de Lille - Paintings',
    url: 'https://images.grandpalaisrmn.fr/search-result?CS_FILTER_ASSETS[]=media&CS_FILTER_ASSETS[]=offers&CS_MERGE=media%2Coffers&SEARCHLANGUAGE=eng_usa&SEARCHTXT1=Lille&SEARCHMODE=NEW&CATEGORY[]=276172&CATEGORY[]=271490&ENHANCED_ORIENTATION[]=all&SERIESDISPLAY=1&EVENT=WEBSHOP_SEARCH',
    outputFile: 'lille-paintings-new.json',
    museum: 'Palais des Beaux-Arts de Lille',
    type: 'Painting',
    mergeWith: 'palais-beaux-arts-lille-collection.json'
  },
  'rouen-paintings': {
    name: 'Musée des Beaux-Arts de Rouen',
    url: 'https://images.grandpalaisrmn.fr/search-result?CS_FILTER_ASSETS[]=media&CS_FILTER_ASSETS[]=offers&CS_MERGE=media%2Coffers&SEARCHLANGUAGE=eng_usa&SEARCHTXT1=Rouen&SEARCHMODE=NEW&ENHANCED_ORIENTATION[]=all&SERIESDISPLAY=1&CATEGORY[]=276912&EVENT=WEBSHOP_SEARCH',
    outputFile: 'rouen-paintings-new.json',
    museum: 'Musée des Beaux-Arts de Rouen',
    type: 'Painting',
    mergeWith: 'musee-beaux-arts-rouen-collection.json'
  }
};

// ═══════════════════════════════════════════════════════════════
// Scrape artwork detail page for full metadata
// ═══════════════════════════════════════════════════════════════
async function scrapeDetailPage(page, sourceUrl, taskName) {
  if (!sourceUrl) return { artist: null, date: null, dimensions: null, medium: null, description: null };
  
  try {
    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await delay(1200);
    
    const details = await page.evaluate(() => {
      let title = null;
      let artist = null;
      let date = null;
      let dimensions = null;
      let medium = null;
      let technique = null;
      let period = null;
      let highResImage = null;
      
      // Get title from h1 (main title element)
      const h1 = document.querySelector('h1');
      if (h1) {
        title = h1.textContent?.trim() || null;
      }
      
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
      
      // Grand Palais RMN uses .previewmeta blocks with .previewmeta-legend and .previewmeta-content
      const previewMetas = document.querySelectorAll('.previewmeta');
      previewMetas.forEach(meta => {
        const legend = meta.querySelector('.previewmeta-legend')?.textContent?.trim()?.toLowerCase() || '';
        const contentEl = meta.querySelector('.previewmeta-content .metadata-value');
        const value = contentEl?.textContent?.trim() || '';
        
        if (!value) return;
        
        // Skip credits/copyright blocks entirely
        if (legend.includes('credit') || legend.includes('crédit') || legend.includes('copyright') || legend.includes('droit')) {
          return; // Don't extract anything from copyright blocks
        }
        
        // Author/Artist - but filter out copyright values
        if (legend.includes('author') || legend.includes('auteur') || legend.includes('artist')) {
          if (!isCopyrightInfo(value)) {
            artist = value;
          }
        }
        // Period/Date  
        if (legend.includes('period') || legend.includes('période') || legend.includes('date') || legend.includes('dating')) {
          period = value;
        }
        // Technique
        if (legend.includes('technique') || legend.includes('medium') || legend.includes('material')) {
          technique = value;
        }
        // Dimensions/Size (physical, not image pixels)
        if (legend.includes('dimension') && !legend.includes('image')) {
          dimensions = value;
        }
        // Category as medium fallback
        if (legend.includes('category') || legend.includes('catégorie')) {
          if (!medium) medium = value;
        }
      });
      
      // Combine period as date
      if (period) date = period;
      if (technique && !medium) medium = technique;
      
      // Try to get high-res image from meta or data attributes
      highResImage = document.querySelector('meta[property="og:image"]')?.content || null;
      
      return { title, artist, date, dimensions, medium, highResImage };
    });
    
    return details;
  } catch (e) {
    return { title: null, artist: null, date: null, dimensions: null, medium: null };
  }
}

// ═══════════════════════════════════════════════════════════════
// Main scraper with pagination and detail page enrichment
// ═══════════════════════════════════════════════════════════════
async function scrapeCollection(browser, collectionId, scrapeDetails = true) {
  const config = COLLECTIONS[collectionId];
  const taskName = config.name;
  log(taskName, `🏛️ Starting scrape...`);
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  const allArtworks = new Map();
  
  // Handle single URL or multiple URLs (for combined collections like Guimet)
  const urls = config.urls || [config.url];
  
  for (const baseUrl of urls) {
    log(taskName, `📍 Navigating to: ${baseUrl.substring(0, 100)}...`);
    
    try {
      await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await delay(5000);
      
      // Accept cookies
      try {
        const acceptButton = await page.$('button:has-text("Accept all cookies"), button:has-text("Accepter")');
        if (acceptButton) {
          await acceptButton.click();
          await delay(2000);
          log(taskName, '🍪 Accepted cookies');
        }
      } catch (e) {}
      
      // Get total count
      let totalCount = 0;
      try {
        const countText = await page.$eval('.count-search-results', el => el.textContent);
        const match = countText.match(/(\d[\d\s]*\d|\d+)/);
        if (match) totalCount = parseInt(match[0].replace(/\s/g, ''));
        log(taskName, `📊 Total results for this URL: ${totalCount}`);
      } catch (e) {
        log(taskName, '⚠️ Could not get total count');
      }
      
      // Paginate by clicking "next page"
      let pageNum = 1;
      const maxPages = 150; // Higher limit for large collections
      
      while (pageNum <= maxPages) {
        log(taskName, `📄 Page ${pageNum}: Extracting items...`);
        
        await delay(2000);
        
        // Extract items from current page
        const items = await page.evaluate(() => {
          const results = [];
          const mediaItems = document.querySelectorAll('.media-item.asset-medium');
          
          mediaItems.forEach((item, index) => {
            try {
              const mediaDiv = item.querySelector('[data-medianumber]');
              const mediaNumber = mediaDiv?.getAttribute('data-medianumber') || '';
              
              const img = item.querySelector('img.medium');
              const title = img?.alt || `Artwork ${index + 1}`;
              const thumbSrc = img?.src || '';
              
              // Get high-res image URL by modifying thumb URL
              let imageUrl = thumbSrc;
              // Try to get larger version - replace thumb.php parameters
              if (thumbSrc.includes('thumb.php')) {
                // Keep the base URL but try to get max quality
                imageUrl = thumbSrc;
              }
              
              const link = item.querySelector('a[href*="/ark:/"]');
              const sourceUrl = link?.href || '';
              
              // Try to extract any visible metadata from the list
              const infoText = item.querySelector('.media-info, .asset-info')?.textContent || '';
              
              if (mediaNumber && title) {
                results.push({
                  id: mediaNumber,
                  title: title,
                  imageUrl: imageUrl,
                  sourceUrl: sourceUrl,
                  infoText: infoText
                });
              }
            } catch (e) {}
          });
          
          return results;
        });
        
        // Add new items
        let newItems = 0;
        for (const item of items) {
          if (!allArtworks.has(item.id)) {
            allArtworks.set(item.id, item);
            newItems++;
          }
        }
        
        log(taskName, `   Found ${items.length} items, ${newItems} new. Total: ${allArtworks.size}`);
        
        // Check for next page
        const nextLink = await page.$('.media-item-paging-next a');
        if (!nextLink) {
          log(taskName, '   No more pages');
          break;
        }
        
        const isVisible = await nextLink.isVisible();
        if (!isVisible) {
          log(taskName, '   Next link not visible, done');
          break;
        }
        
        try {
          await nextLink.click();
          await delay(3000);
          await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
          pageNum++;
        } catch (e) {
          log(taskName, `   Failed to navigate: ${e.message}`);
          break;
        }
        
        // Progress check
        if (pageNum % 10 === 0) {
          log(taskName, `   Progress: ${allArtworks.size} items collected`);
        }
      }
      
    } catch (err) {
      log(taskName, `❌ Error on URL: ${err.message}`);
    }
  }
  
  log(taskName, `📦 Collected ${allArtworks.size} unique artworks from list pages`);
  
  // Now scrape detail pages for full metadata (parallel with multiple pages)
  const artworksList = Array.from(allArtworks.values());
  
  if (scrapeDetails && artworksList.length > 0) {
    log(taskName, `🔍 Scraping detail pages for metadata (10 parallel pages)...`);
    
    const PARALLEL_PAGES = 10; // 10 parallel pages for faster scraping
    const pages = await Promise.all(
      Array.from({ length: PARALLEL_PAGES }, () => context.newPage())
    );
    
    let enriched = 0;
    const batchSize = 100;
    
    // Process in batches of PARALLEL_PAGES
    for (let i = 0; i < artworksList.length; i += PARALLEL_PAGES) {
      const batch = artworksList.slice(i, i + PARALLEL_PAGES);
      
      await Promise.all(batch.map(async (artwork, batchIdx) => {
        if (artwork.sourceUrl) {
          try {
            const page = pages[batchIdx % PARALLEL_PAGES];
            const details = await scrapeDetailPage(page, artwork.sourceUrl, taskName);
            // Update title if original is just a number (mediaNumber)
            if (details.title && /^\d+$/.test(artwork.title)) {
              artwork.title = details.title;
            }
            artwork.artist = details.artist;
            artwork.date = details.date;
            artwork.dimensions = details.dimensions;
            artwork.medium = details.medium;
            if (details.highResImage) artwork.imageUrl = details.highResImage;
            enriched++;
          } catch (e) {
            // Continue on error
          }
        }
      }));
      
      // Progress logging every batchSize items
      const processed = Math.min(i + PARALLEL_PAGES, artworksList.length);
      if (processed % batchSize < PARALLEL_PAGES || processed === artworksList.length) {
        log(taskName, `   Enriched ${processed}/${artworksList.length} (${enriched} with data)`);
        
        // Save intermediate progress
        const intermediateOutput = formatOutput(artworksList.slice(0, processed), config);
        const outputPath = path.join(OUTPUT_DIR, config.outputFile);
        fs.writeFileSync(outputPath, JSON.stringify(intermediateOutput, null, 2));
      }
      
      // Minimal delay between batches
      await delay(100);
    }
    
    await Promise.all(pages.map(p => p.close()));
    log(taskName, `✅ Enriched ${enriched}/${artworksList.length} artworks with details`);
  }
  
  await context.close();
  
  return artworksList;
}

// ═══════════════════════════════════════════════════════════════
// Format output for the app
// ═══════════════════════════════════════════════════════════════
function formatOutput(artworks, config) {
  const objects = artworks.map((item, idx) => ({
    id: `${config.outputFile.replace('.json', '')}-${idx + 1}`,
    mediaNumber: item.id,
    title: item.title || 'Untitled',
    artist: item.artist || 'Unknown',
    year: item.date || null,
    medium: item.medium || config.type,
    dimensions: item.dimensions || '',
    image: item.imageUrl,
    sourceUrl: item.sourceUrl,
    type: config.type === 'Drawing' ? '2D' : (config.type === 'Painting' ? '2D' : 'unknown'),
    museum: config.museum
  }));
  
  return {
    collection: config.name,
    museum: config.museum,
    scrapedAt: new Date().toISOString(),
    totalItems: objects.length,
    objects
  };
}

// ═══════════════════════════════════════════════════════════════
// Main execution
// ═══════════════════════════════════════════════════════════════
async function main() {
  // Parse command line args
  const args = process.argv.slice(2);
  const collectionsToScrape = args.length > 0 ? args.filter(a => !a.startsWith('--')) : Object.keys(COLLECTIONS);
  const skipDetails = args.includes('--no-details');
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Grand Palais RMN Full Scraper                               ║');
  console.log('║  Collections: ' + collectionsToScrape.join(', ').padEnd(47) + '║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const results = {};
  
  for (const collectionId of collectionsToScrape) {
    if (!COLLECTIONS[collectionId]) {
      console.log(`⚠️ Unknown collection: ${collectionId}`);
      continue;
    }
    
    const config = COLLECTIONS[collectionId];
    
    // Create a new browser for each collection to avoid context issues
    const browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const artworks = await scrapeCollection(browser, collectionId, !skipDetails);
      
      // Save output
      const output = formatOutput(artworks, config);
      const outputPath = path.join(OUTPUT_DIR, config.outputFile);
      fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
      
      log(config.name, `💾 Saved ${output.totalItems} artworks to ${config.outputFile}`);
      results[collectionId] = output.totalItems;
      
    } catch (err) {
      console.error(`❌ Failed to scrape ${collectionId}:`, err.message);
      results[collectionId] = 'ERROR';
    } finally {
      await browser.close();
    }
  }
  
  // Summary
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  SCRAPING COMPLETE                                           ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  for (const [id, count] of Object.entries(results)) {
    const name = COLLECTIONS[id]?.name || id;
    console.log(`║  ${name.padEnd(40)} ${String(count).padStart(8)} items ║`);
  }
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

main().catch(console.error);
