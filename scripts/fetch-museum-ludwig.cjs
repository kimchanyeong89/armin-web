/**
 * Museum Ludwig Simple HTTP Fetcher
 * Reads progress file and fetches artwork details using HTTP only
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://museum-ludwig.kulturelles-erbe-koeln.de';

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

  const idMatch = url.match(/obj\/(\d+)/);
  if (idMatch) artwork.id = idMatch[1];

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

  const imageMatch = html.match(/https:\/\/kekmedien\.kulturelles-erbe-koeln\.de\/standard\/[^"'\s]+\.(jpg|jpeg|png)/i);
  if (imageMatch) artwork.imageUrl = imageMatch[0];

  const thumbMatch = html.match(/https:\/\/kekmedien\.kulturelles-erbe-koeln\.de\/thumbnail\/[^"'\s]+\.(jpg|jpeg|png)/i);
  if (thumbMatch) artwork.thumbnailUrl = thumbMatch[0];

  return artwork;
}

async function fetchArtwork(url) {
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
    return null;
  }
}

async function processCollection(collectionKey, outputFileName) {
  const progressFile = path.join(__dirname, '..', 'downloads', `museum-ludwig-progress-${collectionKey}.json`);
  const outputPath = path.join(__dirname, '..', 'public', 'data', outputFileName);
  
  if (!fs.existsSync(progressFile)) {
    console.log(`No progress file for ${collectionKey}`);
    return 0;
  }
  
  console.log(`\nProcessing ${collectionKey}...`);
  
  const progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
  const artworkLinks = progress.artworkLinks || [];
  const processedIds = new Set(progress.processedIds || []);
  
  // Load existing artworks if any
  let artworks = [];
  if (fs.existsSync(outputPath)) {
    try {
      artworks = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    } catch (e) {}
  }
  
  console.log(`Links: ${artworkLinks.length}, Already processed: ${processedIds.size}, Existing artworks: ${artworks.length}`);
  
  let newProcessed = 0;
  let newArtworks = 0;
  
  for (const url of artworkLinks) {
    const idMatch = url.match(/obj\/(\d+)/);
    const artworkId = idMatch ? idMatch[1] : url;
    
    if (processedIds.has(artworkId)) continue;
    
    const artwork = await fetchArtwork(url);
    if (artwork && (artwork.imageUrl || artwork.thumbnailUrl)) {
      artworks.push(artwork);
      newArtworks++;
    }
    
    processedIds.add(artworkId);
    newProcessed++;
    
    if (newProcessed % 20 === 0) {
      console.log(`  +${newProcessed} processed (+${newArtworks} with images), total: ${artworks.length}`);
      
      // Save progress
      fs.writeFileSync(progressFile, JSON.stringify({
        artworkLinks: progress.artworkLinks,
        processedIds: Array.from(processedIds),
        page: progress.page
      }, null, 2));
      
      fs.writeFileSync(outputPath, JSON.stringify(artworks, null, 2));
    }
    
    await delay(100);
  }
  
  // Final save
  fs.writeFileSync(outputPath, JSON.stringify(artworks, null, 2));
  fs.writeFileSync(progressFile, JSON.stringify({
    artworkLinks: progress.artworkLinks,
    processedIds: Array.from(processedIds),
    page: progress.page
  }, null, 2));
  
  console.log(`  Completed: ${artworks.length} artworks with images`);
  return artworks.length;
}

async function main() {
  console.log('Museum Ludwig HTTP Fetcher');
  console.log('==========================');
  
  const collections = {
    malerei: 'museum-ludwig-paintings.json',
    skulptur: 'museum-ludwig-sculpture.json', 
    fotografie: 'museum-ludwig-photography.json',
    grafik: 'museum-ludwig-graphics.json'
  };
  
  const args = process.argv.slice(2);
  const collectionsToProcess = args.length > 0 
    ? args.filter(k => collections[k])
    : Object.keys(collections);
  
  const results = {};
  for (const key of collectionsToProcess) {
    const count = await processCollection(key, collections[key]);
    results[key] = count;
  }
  
  console.log('\n=== Summary ===');
  for (const [key, count] of Object.entries(results)) {
    console.log(`${key}: ${count} artworks`);
  }
}

main().catch(console.error);
