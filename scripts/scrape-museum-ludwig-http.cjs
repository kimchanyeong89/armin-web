/**
 * Museum Ludwig Scraper - HTTP-based version
 * Uses fetch for artwork details (no browser), Playwright only for initial navigation
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://museum-ludwig.kulturelles-erbe-koeln.de';

// Collection configurations
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

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Parse artwork HTML
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
  if (idMatch) artwork.id = idMatch[1];

  // Metadata from Bausteine divs
  const fields = {
    'Autor': 'artist',
    'Titel': 'title', 
    'Datierung': 'date',
    'Material_Technik': 'medium',
    'Maße': 'dimensions',
    'Inventarnummer': 'inventoryNumber',
    'Verwalter': 'location',
    'Erwerb': 'acquisition',
    'Provenienz': 'provenance'
  };

  for (const [cssClass, field] of Object.entries(fields)) {
    const regex = new RegExp(`Bausteine ${cssClass}"[^>]*>([^<]+)<`, 'i');
    const match = html.match(regex);
    if (match) {
      artwork[field] = match[1].trim().replace(/&nbsp;/g, ' ');
    }
  }

  // Image URLs
  const imageMatch = html.match(/https:\/\/kekmedien\.kulturelles-erbe-koeln\.de\/standard\/[^"'\s]+\.(jpg|jpeg|png)/i);
  if (imageMatch) artwork.imageUrl = imageMatch[0];

  const thumbMatch = html.match(/https:\/\/kekmedien\.kulturelles-erbe-koeln\.de\/thumbnail\/[^"'\s]+\.(jpg|jpeg|png)/i);
  if (thumbMatch) artwork.thumbnailUrl = thumbMatch[0];

  return artwork;
}

async function fetchArtworkDetails(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    if (!response.ok) return null;
    const html = await response.text();
    return parseArtworkPage(html, url);
  } catch (e) {
    console.log(`Fetch error for ${url}: ${e.message}`);
    return null;
  }
}

async function collectArtworkLinks(page, collection) {
  console.log(`\nCollecting artwork links for ${collection.name}...`);
  
  await page.goto(collection.filterUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await delay(2000);
  
  let html = await page.content();
  const totalMatch = html.match(/\((\d+(?:[\.,]\d+)?)\s*Dokumente?\)/i);
  const totalCount = totalMatch ? parseInt(totalMatch[1].replace(/[\.,]/g, ''), 10) : 0;
  console.log(`Total artworks: ${totalCount}`);
  
  const links = new Set();
  const RESULTS_PER_PAGE = 30;
  let resultOffset = 1;
  let pageNum = 1;
  let hasMore = true;
  
  while (hasMore) {
    // Extract links
    const regex = /documents\/obj\/(\d+)/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      links.add(`${BASE_URL}/documents/obj/${match[1]}`);
    }
    console.log(`Page ${pageNum} (offset ${resultOffset}): Found ${links.size} total links`);
    
    if (links.size >= totalCount) {
      console.log('All links collected!');
      break;
    }
    
    // Navigate to next page
    pageNum++;
    resultOffset += RESULTS_PER_PAGE;
    
    try {
      const nextLink = await page.$(`a[href*="action=displayResult/${resultOffset}"]`);
      if (nextLink) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
          nextLink.click()
        ]);
        await delay(1500);
        html = await page.content();
      } else {
        hasMore = false;
      }
    } catch (e) {
      console.log(`Pagination done or error: ${e.message}`);
      hasMore = false;
    }
    
    if (pageNum > 700) {
      console.log('Reached page limit');
      hasMore = false;
    }
  }
  
  return Array.from(links);
}

async function scrapeCollection(collectionKey) {
  const collection = COLLECTIONS[collectionKey];
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Scraping ${collection.name}...`);
  console.log(`${'='.repeat(60)}`);
  
  const progressFile = path.join(__dirname, '..', 'downloads', `museum-ludwig-http-${collectionKey}.json`);
  const outputPath = path.join(__dirname, '..', 'public', 'data', collection.outputFile);
  
  let artworkLinks = [];
  let processedIds = new Set();
  let artworks = [];
  
  // Load progress
  if (fs.existsSync(progressFile)) {
    try {
      const saved = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
      artworkLinks = saved.artworkLinks || [];
      processedIds = new Set(saved.processedIds || []);
      artworks = saved.artworks || [];
      console.log(`Resuming: ${artworkLinks.length} links, ${processedIds.size} processed, ${artworks.length} saved`);
    } catch (e) {
      console.log('Could not load progress');
    }
  }
  
  // Phase 1: Collect links if needed
  if (artworkLinks.length === 0) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    artworkLinks = await collectArtworkLinks(page, collection);
    await browser.close();
    
    // Save links
    fs.writeFileSync(progressFile, JSON.stringify({
      artworkLinks,
      processedIds: Array.from(processedIds),
      artworks
    }, null, 2));
  }
  
  console.log(`\nPhase 2: Fetching ${artworkLinks.length} artwork details via HTTP...`);
  
  // Phase 2: Fetch each artwork with HTTP (no browser)
  let processed = 0;
  for (const url of artworkLinks) {
    const idMatch = url.match(/obj\/(\d+)/);
    const artworkId = idMatch ? idMatch[1] : url;
    
    if (processedIds.has(artworkId)) {
      processed++;
      continue;
    }
    
    const artwork = await fetchArtworkDetails(url);
    if (artwork && (artwork.imageUrl || artwork.thumbnailUrl)) {
      artworks.push(artwork);
    }
    
    processedIds.add(artworkId);
    processed++;
    
    if (processed % 50 === 0) {
      console.log(`Progress: ${processed}/${artworkLinks.length} (${Math.round(processed/artworkLinks.length*100)}%) - ${artworks.length} with images`);
      
      // Save progress
      fs.writeFileSync(progressFile, JSON.stringify({
        artworkLinks,
        processedIds: Array.from(processedIds),
        artworks
      }, null, 2));
      
      // Save intermediate results
      fs.writeFileSync(outputPath, JSON.stringify(artworks, null, 2));
    }
    
    await delay(150); // Rate limit
  }
  
  // Final save
  fs.writeFileSync(outputPath, JSON.stringify(artworks, null, 2));
  console.log(`\n${collection.name}: ${artworks.length} artworks with images`);
  console.log(`Saved to: ${outputPath}`);
  
  // Clean up progress
  if (fs.existsSync(progressFile)) {
    fs.unlinkSync(progressFile);
  }
  
  return { collection: collection.name, count: artworks.length };
}

async function main() {
  const args = process.argv.slice(2);
  let collections = Object.keys(COLLECTIONS);
  
  if (args.length > 0) {
    collections = args.filter(c => COLLECTIONS[c]);
  }
  
  console.log('Museum Ludwig HTTP Scraper');
  console.log('==========================');
  console.log(`Collections: ${collections.join(', ')}`);
  
  const results = [];
  for (const key of collections) {
    const result = await scrapeCollection(key);
    results.push(result);
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('FINAL SUMMARY');
  console.log(`${'='.repeat(60)}`);
  results.forEach(r => console.log(`${r.collection}: ${r.count} artworks`));
  console.log(`\nTotal: ${results.reduce((a, r) => a + r.count, 0)} artworks`);
}

main().catch(console.error);
