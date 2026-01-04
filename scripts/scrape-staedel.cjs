/**
 * Städel Museum Collection Scraper (Comprehensive)
 * Frankfurt, Germany - https://sammlung.staedelmuseum.de
 * 
 * Strategy: Combine category filters with alphabetic search to get all 1,629 works
 * Each search returns max 130 items, so we use specific search terms
 */

const fs = require('fs');

const CONFIG = {
  baseUrl: 'https://sammlung.staedelmuseum.de',
  searchUrl: 'https://sammlung.staedelmuseum.de/en/search',
  outputFile: 'public/data/staedel-museum-collection.json',
  progressFile: 'downloads/staedel-progress.json',
  delayMs: 500
};

// Categories with term IDs
const CATEGORIES = [
  { id: 48, name: 'painting', expected: 938 },
  { id: 3047, name: 'photograph', expected: 244 },
  { id: 2607, name: 'drawing', expected: 243 },
  { id: 4040, name: 'print', expected: 123 },
  { id: 1992, name: 'sculpture', expected: 79 },
  { id: 202, name: 'textiles', expected: 2 }
];

// Search terms to cover all works
const SEARCH_TERMS = [
  '', // empty gets alphabetically sorted works
  ...Array.from({length: 26}, (_, i) => String.fromCharCode(97 + i)), // a-z
  ...['th', 'st', 'ch', 'po', 'la', 'ma', 'de', 'wo', 'vi', 'pa', 'co', 'mo'] // common prefixes
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadProgress() {
  try {
    if (fs.existsSync(CONFIG.progressFile)) {
      const data = JSON.parse(fs.readFileSync(CONFIG.progressFile, 'utf8'));
      return {
        artworks: new Map(data.artworks.map(a => [a.id, a])),
        completedSearches: new Set(data.completedSearches || [])
      };
    }
  } catch (e) {}
  return { artworks: new Map(), completedSearches: new Set() };
}

function saveProgress(artworksMap, completedSearches) {
  const data = {
    artworks: Array.from(artworksMap.values()),
    completedSearches: Array.from(completedSearches)
  };
  fs.writeFileSync(CONFIG.progressFile, JSON.stringify(data, null, 2));
}

function buildImageUrl(imageData) {
  if (imageData && imageData.srcset) {
    const xlMatch = imageData.srcset.match(/([^\s,]+--thumb-xl\.jpg)/);
    if (xlMatch) return `${CONFIG.baseUrl}${xlMatch[1]}`;
    const lgMatch = imageData.srcset.match(/([^\s,]+--thumb-lg\.jpg)/);
    if (lgMatch) return `${CONFIG.baseUrl}${lgMatch[1]}`;
  }
  return null;
}

function buildThumbnailUrl(imageData) {
  if (imageData && imageData.srcset) {
    const mdMatch = imageData.srcset.match(/([^\s,]+--thumb-md\.jpg)/);
    if (mdMatch) return `${CONFIG.baseUrl}${mdMatch[1]}`;
  }
  return null;
}

async function fetchSearchResults(query, categoryId = null) {
  let url = `${CONFIG.searchUrl}?q=${encodeURIComponent(query)}`;
  if (categoryId) {
    url += `&f=object:term(${categoryId})`;
  }
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    
    if (!response.ok) return null;
    
    const html = await response.text();
    
    // Extract JSON data
    const startIdx = html.indexOf('{"documents":[');
    if (startIdx === -1) return null;
    
    let depth = 0;
    let endIdx = startIdx;
    for (let i = startIdx; i < html.length; i++) {
      if (html[i] === '{') depth++;
      else if (html[i] === '}') {
        depth--;
        if (depth === 0) {
          endIdx = i + 1;
          break;
        }
      }
    }
    
    return JSON.parse(html.substring(startIdx, endIdx));
  } catch (e) {
    console.error(`Error fetching ${url}:`, e.message);
    return null;
  }
}

function processDocument(item, categoryName, artworksMap) {
  const id = `staedel-${item.id}`;
  if (artworksMap.has(id)) return false;
  
  const imageUrl = buildImageUrl(item.image);
  if (!imageUrl) return false;
  
  artworksMap.set(id, {
    id,
    title: item.title || 'Untitled',
    artist: item.creator || 'Unknown',
    date: item.production || '',
    dimensions: item.dimensions || '',
    medium: item.physical || '',
    inventoryNumber: item.number || '',
    location: item.location || '',
    objectType: categoryName,
    imageUrl,
    thumbnailUrl: buildThumbnailUrl(item.image),
    detailUrl: item.url || '',
    copyright: item.copyright || '',
    source: 'Städel Museum, Frankfurt'
  });
  
  return true;
}

async function scrapeCategory(category, artworksMap, completedSearches) {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Scraping ${category.name.toUpperCase()} (expected: ${category.expected})`);
  
  const countBefore = Array.from(artworksMap.values()).filter(a => a.objectType === category.name).length;
  
  for (const term of SEARCH_TERMS) {
    const searchKey = `${category.name}:${term}`;
    if (completedSearches.has(searchKey)) continue;
    
    const data = await fetchSearchResults(term, category.id);
    await sleep(CONFIG.delayMs);
    
    if (data && data.documents) {
      let added = 0;
      for (const doc of data.documents) {
        if (processDocument(doc, category.name, artworksMap)) {
          added++;
        }
      }
      
      const currentCount = Array.from(artworksMap.values()).filter(a => a.objectType === category.name).length;
      
      if (added > 0) {
        process.stdout.write(`\r  [${term || 'all'}] +${added} (total: ${currentCount}/${category.expected})    `);
      }
      
      completedSearches.add(searchKey);
      
      // Check if we have enough
      if (currentCount >= category.expected) {
        console.log(`\n  ✓ Completed: ${currentCount}/${category.expected}`);
        return;
      }
    }
  }
  
  // Additional targeted searches if needed
  const currentCount = Array.from(artworksMap.values()).filter(a => a.objectType === category.name).length;
  
  if (currentCount < category.expected * 0.9) {
    console.log(`\n  Trying additional search patterns...`);
    
    // Two-letter combinations for remaining items
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    for (const c1 of letters) {
      for (const c2 of letters) {
        const term = c1 + c2;
        const searchKey = `${category.name}:${term}`;
        if (completedSearches.has(searchKey)) continue;
        
        const data = await fetchSearchResults(term, category.id);
        await sleep(CONFIG.delayMs);
        
        if (data && data.documents) {
          let added = 0;
          for (const doc of data.documents) {
            if (processDocument(doc, category.name, artworksMap)) {
              added++;
            }
          }
          
          completedSearches.add(searchKey);
          
          if (added > 0) {
            const newCount = Array.from(artworksMap.values()).filter(a => a.objectType === category.name).length;
            process.stdout.write(`\r  [${term}] +${added} (total: ${newCount}/${category.expected})    `);
            saveProgress(artworksMap, completedSearches);
          }
        }
        
        // Check progress
        const newCount = Array.from(artworksMap.values()).filter(a => a.objectType === category.name).length;
        if (newCount >= category.expected) {
          console.log(`\n  ✓ Completed: ${newCount}/${category.expected}`);
          return;
        }
      }
    }
  }
  
  const finalCount = Array.from(artworksMap.values()).filter(a => a.objectType === category.name).length;
  console.log(`\n  ✓ Finished: ${finalCount}/${category.expected}`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('Städel Museum Collection Scraper');
  console.log('Frankfurt, Germany - 1,629 works');
  console.log('='.repeat(60));
  
  const { artworks: artworksMap, completedSearches } = loadProgress();
  console.log(`\nLoaded ${artworksMap.size} existing artworks`);
  
  for (const category of CATEGORIES) {
    await scrapeCategory(category, artworksMap, completedSearches);
    saveProgress(artworksMap, completedSearches);
  }
  
  // Save final output
  console.log('\n' + '='.repeat(60));
  console.log('Saving final collection...');
  
  const finalArtworks = Array.from(artworksMap.values());
  fs.writeFileSync(CONFIG.outputFile, JSON.stringify(finalArtworks, null, 2));
  
  console.log(`\nTotal: ${finalArtworks.length} artworks`);
  console.log('\nBy category:');
  for (const cat of CATEGORIES) {
    const count = finalArtworks.filter(a => a.objectType === cat.name).length;
    const pct = ((count / cat.expected) * 100).toFixed(1);
    console.log(`  - ${cat.name}: ${count}/${cat.expected} (${pct}%)`);
  }
  
  // Cleanup
  if (fs.existsSync(CONFIG.progressFile)) {
    fs.unlinkSync(CONFIG.progressFile);
  }
  
  console.log('\n✅ Complete!');
}

main().catch(console.error);
