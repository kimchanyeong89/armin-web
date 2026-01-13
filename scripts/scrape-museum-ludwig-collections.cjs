/**
 * Museum Ludwig Scraper - Cologne Cultural Heritage Portal
 * Scrapes all 4 collections: Malerei, Grafik, Skulptur, Fotografie
 * Uses Playwright to handle the complex session-based ETE system
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://museum-ludwig.kulturelles-erbe-koeln.de';

// Collection configurations - Correct filter values from site
// 000\Highlights, 001\Malerei, 002\Skulptur, 003\Zeitgenössische Kunst, 
// 004\Video, 005\Fotografie, 006\Grafik
const COLLECTIONS = {
  malerei: {
    name: 'Malerei',
    slug: 'paintings',
    filterUrl: `${BASE_URL}/ete?action=hinzufuegenFilter&filter=filter_subsammlungen_ml&term=001%5CMalerei`,
    outputFile: 'museum-ludwig-paintings.json'
  },
  skulptur: {
    name: 'Skulptur',
    slug: 'sculpture',
    filterUrl: `${BASE_URL}/ete?action=hinzufuegenFilter&filter=filter_subsammlungen_ml&term=002%5CSkulptur`,
    outputFile: 'museum-ludwig-sculpture.json'
  },
  fotografie: {
    name: 'Fotografie',
    slug: 'photography',
    filterUrl: `${BASE_URL}/ete?action=hinzufuegenFilter&filter=filter_subsammlungen_ml&term=005%5CFotografie`,
    outputFile: 'museum-ludwig-photography.json'
  },
  grafik: {
    name: 'Grafik',
    slug: 'graphics',
    filterUrl: `${BASE_URL}/ete?action=hinzufuegenFilter&filter=filter_subsammlungen_ml&term=006%5CGrafik`,
    outputFile: 'museum-ludwig-graphics.json'
  }
};

// Rate limiting helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Parse artwork detail page HTML to extract metadata
function parseArtworkPage(html, url) {
  const artwork = {
    id: '',
    title: '',
    artist: '',
    date: '',
    medium: '',
    dimensions: '',
    inventoryNumber: '',
    location: '',
    acquisition: '',
    provenance: '',
    imageUrl: '',
    thumbnailUrl: '',
    url: url
  };

  // Extract ID from URL
  const idMatch = url.match(/obj\/(\d+)/);
  if (idMatch) {
    artwork.id = idMatch[1];
  }

  // Extract artist (Autor)
  const artistMatch = html.match(/class="Bausteine Autor"[^>]*>([^<]*<[^>]+>)?([^<]+)/i);
  if (artistMatch) {
    artwork.artist = (artistMatch[2] || artistMatch[1] || '').replace(/<[^>]+>/g, '').trim();
  }

  // Extract title (Titel)
  const titleMatch = html.match(/class="Bausteine Titel"[^>]*>([^<]+)/i);
  if (titleMatch) {
    artwork.title = titleMatch[1].replace(/,\s*$/, '').trim();
  }

  // Extract alternative title from italic paragraph
  const altTitleMatch = html.match(/class="kursiv"[^>]*>([^<]+)/i);
  if (altTitleMatch && !artwork.title) {
    artwork.title = altTitleMatch[1].replace(/[\[\]]/g, '').trim();
  }

  // Extract date (Datierung)
  const dateMatch = html.match(/class="Bausteine Datierung"[^>]*>([^<]+)/i);
  if (dateMatch) {
    artwork.date = dateMatch[1].trim();
  }

  // Extract material/technique (Material_Technik)
  const materialMatch = html.match(/class="Bausteine Material_Technik"[^>]*>([^<]+)/i);
  if (materialMatch) {
    artwork.medium = materialMatch[1].replace(/,?\s*$/, '').trim();
  }

  // Extract dimensions (Maße)
  const dimensionsMatch = html.match(/class="Bausteine Ma(?:ß|ss)e"[^>]*>([^<]+)/i);
  if (dimensionsMatch) {
    artwork.dimensions = dimensionsMatch[1].trim();
  }

  // Extract inventory number and location from Verwalter
  const verwalterMatch = html.match(/class="Bausteine Verwalter"[^>]*>([\s\S]*?)<\/div>/i);
  if (verwalterMatch) {
    const verwalterText = verwalterMatch[1];
    const invMatch = verwalterText.match(/Inv\.-Nr\.\s*([A-Z0-9\s\/]+)/i);
    if (invMatch) {
      artwork.inventoryNumber = invMatch[1].trim();
    }
    const museumMatch = verwalterText.match(/>Museum Ludwig</i);
    if (museumMatch) {
      artwork.location = 'Museum Ludwig, Köln';
    }
  }

  // Extract acquisition info (Erwerb)
  const acquisitionMatch = html.match(/class="Bausteine Erwerb"[^>]*>([^<]+)/i);
  if (acquisitionMatch) {
    artwork.acquisition = acquisitionMatch[1].replace(/[^\w\s\d]/g, ' ').trim();
  }

  // Extract provenance
  const provenanceMatch = html.match(/class="Bausteine Provenienz"[^>]*>([\s\S]*?)<\/div>/i);
  if (provenanceMatch) {
    artwork.provenance = provenanceMatch[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Extract main image URL (standard size from kekmedien)
  const imageMatches = html.match(/https:\/\/kekmedien\.kulturelles-erbe-koeln\.de\/standard\/[^"'\s]+\.(jpg|jpeg|png)/gi);
  if (imageMatches && imageMatches.length > 0) {
    artwork.imageUrl = imageMatches[0];
  }

  // Extract thumbnail URL
  const thumbMatches = html.match(/https:\/\/kekmedien\.kulturelles-erbe-koeln\.de\/thumbnail\/[^"'\s]+\.(jpg|jpeg|png)/gi);
  if (thumbMatches && thumbMatches.length > 0) {
    artwork.thumbnailUrl = thumbMatches[0];
  }

  return artwork;
}

// Extract artwork links from gallery/list page
function extractArtworkLinks(html) {
  const links = [];
  const regex = /documents\/obj\/(\d+)/g;
  let match;
  const seen = new Set();
  
  while ((match = regex.exec(html)) !== null) {
    const id = match[1];
    if (!seen.has(id)) {
      seen.add(id);
      links.push(`${BASE_URL}/documents/obj/${id}`);
    }
  }
  
  return links;
}

// Get total count from page
function getTotalCount(html) {
  const match = html.match(/\((\d+(?:[\.,]\d+)?)\s*Dokumente?\)/i);
  if (match) {
    return parseInt(match[1].replace(/[\.,]/g, ''), 10);
  }
  return 0;
}

// Get next page link
function getNextPageLink(html, currentPage) {
  // Look for pagination links - the site uses page numbers
  const pageMatch = html.match(new RegExp(`action=go/(${currentPage + 1})[^"]*`, 'i'));
  if (pageMatch) {
    return `${BASE_URL}/ete?${pageMatch[0].replace(/&amp;/g, '&')}`;
  }
  return null;
}

async function scrapeCollection(collectionKey, browser, progressFile) {
  const collection = COLLECTIONS[collectionKey];
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Starting ${collection.name} collection...`);
  console.log(`${'='.repeat(60)}`);
  
  const page = await browser.newPage();
  const artworks = [];
  const errors = [];
  
  // Load progress if exists
  let progress = { artworkLinks: [], processedIds: new Set(), page: 1 };
  const collectionProgressFile = progressFile.replace('.json', `-${collectionKey}.json`);
  
  if (fs.existsSync(collectionProgressFile)) {
    try {
      const saved = JSON.parse(fs.readFileSync(collectionProgressFile, 'utf8'));
      progress.artworkLinks = saved.artworkLinks || [];
      progress.processedIds = new Set(saved.processedIds || []);
      progress.page = saved.page || 1;
      console.log(`Resuming from page ${progress.page}, ${progress.processedIds.size} artworks already processed`);
    } catch (e) {
      console.log('Could not load progress, starting fresh');
    }
  }
  
  try {
    // Phase 1: Collect all artwork links
    if (progress.artworkLinks.length === 0) {
      console.log('\nPhase 1: Collecting artwork links...');
      
      // Navigate to collection
      await page.goto(collection.filterUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await delay(2000);
      
      let html = await page.content();
      const totalCount = getTotalCount(html);
      console.log(`Total artworks in collection: ${totalCount}`);
      
      // Site uses result offsets: displayResult/1, displayResult/31, displayResult/61, etc.
      // Each page shows 30 results
      const RESULTS_PER_PAGE = 30;
      let resultOffset = 1;
      let pageNum = 1;
      let hasMore = true;
      
      while (hasMore) {
        // Extract links from current page
        const links = extractArtworkLinks(html);
        console.log(`Page ${pageNum} (offset ${resultOffset}): Found ${links.length} artwork links`);
        
        for (const link of links) {
          if (!progress.artworkLinks.includes(link)) {
            progress.artworkLinks.push(link);
          }
        }
        
        // Save progress
        progress.page = pageNum;
        fs.writeFileSync(collectionProgressFile, JSON.stringify({
          artworkLinks: progress.artworkLinks,
          processedIds: Array.from(progress.processedIds),
          page: pageNum,
          resultOffset: resultOffset
        }, null, 2));
        
        // Check if we have collected all
        if (progress.artworkLinks.length >= totalCount) {
          console.log('All artworks collected!');
          hasMore = false;
          break;
        }
        
        // Move to next page using displayResult offset
        pageNum++;
        resultOffset += RESULTS_PER_PAGE;
        
        try {
          // Use displayResult action with offset to navigate
          const nextResultSelector = `a[href*="action=displayResult/${resultOffset}"]`;
          const nextLink = await page.$(nextResultSelector);
          
          if (nextLink) {
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
              nextLink.click()
            ]);
            await delay(1500);
            html = await page.content();
            
            // Check if we got new results
            const newLinks = extractArtworkLinks(html);
            if (newLinks.length === 0) {
              console.log('No more artworks on next page');
              hasMore = false;
            }
          } else {
            // Check if there's a displayResult link for any higher offset
            const anyNextLink = await page.$(`a[href*="action=displayResult/"]`);
            if (!anyNextLink) {
              console.log('No more pagination links available');
              hasMore = false;
            } else {
              // Try clicking on "next" arrow or higher offset
              console.log(`No exact link for offset ${resultOffset}, checking for next...`);
              const allPagLinks = await page.$$eval('a[href*="action=displayResult/"]', els => 
                els.map(e => e.href.match(/displayResult\/(\d+)/)?.[1]).filter(Boolean).map(Number)
              );
              const nextOffset = allPagLinks.find(o => o > resultOffset - RESULTS_PER_PAGE);
              if (nextOffset && nextOffset !== resultOffset - RESULTS_PER_PAGE + 1) {
                resultOffset = nextOffset;
                const linkToClick = await page.$(`a[href*="action=displayResult/${nextOffset}"]`);
                if (linkToClick) {
                  await Promise.all([
                    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
                    linkToClick.click()
                  ]);
                  await delay(1500);
                  html = await page.content();
                } else {
                  hasMore = false;
                }
              } else {
                hasMore = false;
              }
            }
          }
        } catch (e) {
          console.log(`Pagination error: ${e.message}`);
          hasMore = false;
        }
        
        // Safety check
        if (pageNum > 500) {
          console.log('Reached page limit, stopping pagination');
          hasMore = false;
        }
      }
      
      console.log(`\nTotal unique artwork links collected: ${progress.artworkLinks.length}`);
    }
    
    // Phase 2: Scrape each artwork
    console.log('\nPhase 2: Scraping artwork details...');
    
    const total = progress.artworkLinks.length;
    let processed = progress.processedIds.size;
    
    for (let i = 0; i < progress.artworkLinks.length; i++) {
      const url = progress.artworkLinks[i];
      const idMatch = url.match(/obj\/(\d+)/);
      const artworkId = idMatch ? idMatch[1] : url;
      
      if (progress.processedIds.has(artworkId)) {
        continue;
      }
      
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await delay(500);
        
        const html = await page.content();
        const artwork = parseArtworkPage(html, url);
        
        // Only add if has image
        if (artwork.imageUrl || artwork.thumbnailUrl) {
          artworks.push(artwork);
        }
        
        progress.processedIds.add(artworkId);
        processed++;
        
        if (processed % 50 === 0) {
          console.log(`Progress: ${processed}/${total} (${Math.round(processed/total*100)}%)`);
          
          // Save intermediate progress
          fs.writeFileSync(collectionProgressFile, JSON.stringify({
            artworkLinks: progress.artworkLinks,
            processedIds: Array.from(progress.processedIds),
            page: progress.page
          }, null, 2));
          
          // Save intermediate results (incremental save every 50)
          const outputPath = path.join(__dirname, '..', 'public', 'data', collection.outputFile);
          const artworksWithImages = artworks.filter(a => a.imageUrl || a.thumbnailUrl);
          fs.writeFileSync(outputPath, JSON.stringify(artworksWithImages, null, 2));
          console.log(`  Saved ${artworksWithImages.length} artworks to ${collection.outputFile}`);
        }
        
        // Rate limiting
        await delay(200);
        
      } catch (e) {
        console.log(`Error scraping ${url}: ${e.message}`);
        errors.push({ url, error: e.message });
      }
    }
    
  } catch (e) {
    console.error(`Collection error: ${e.message}`);
  } finally {
    await page.close();
  }
  
  // Filter artworks with images
  const artworksWithImages = artworks.filter(a => a.imageUrl || a.thumbnailUrl);
  console.log(`\n${collection.name}: ${artworksWithImages.length} artworks with images`);
  
  // Save final results
  const outputPath = path.join(__dirname, '..', 'public', 'data', collection.outputFile);
  fs.writeFileSync(outputPath, JSON.stringify(artworksWithImages, null, 2));
  console.log(`Saved to: ${outputPath}`);
  
  // Clean up progress file on success
  if (fs.existsSync(collectionProgressFile)) {
    fs.unlinkSync(collectionProgressFile);
  }
  
  return { 
    collection: collection.name, 
    count: artworksWithImages.length, 
    errors: errors.length 
  };
}

async function main() {
  console.log('Museum Ludwig Collection Scraper');
  console.log('================================\n');
  
  // Ensure output directory exists
  const dataDir = path.join(__dirname, '..', 'public', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const progressFile = path.join(__dirname, '..', 'downloads', 'museum-ludwig-progress.json');
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const results = [];
  
  try {
    // Get collection from command line or scrape all
    const targetCollection = process.argv[2];
    
    if (targetCollection && COLLECTIONS[targetCollection]) {
      const result = await scrapeCollection(targetCollection, browser, progressFile);
      results.push(result);
    } else {
      // Scrape all collections
      for (const key of Object.keys(COLLECTIONS)) {
        const result = await scrapeCollection(key, browser, progressFile);
        results.push(result);
      }
    }
    
  } finally {
    await browser.close();
  }
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(60));
  
  let totalArtworks = 0;
  for (const r of results) {
    console.log(`${r.collection}: ${r.count} artworks (${r.errors} errors)`);
    totalArtworks += r.count;
  }
  console.log(`\nTotal: ${totalArtworks} artworks`);
}

main().catch(console.error);
