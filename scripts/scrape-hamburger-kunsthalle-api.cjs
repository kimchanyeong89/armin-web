/**
 * Hamburger Kunsthalle - Malerei (Paintings) Collection Scraper
 * 
 * Uses the search API with URL parameters (GET method)
 * Parses the HTML to extract structured artwork data
 * 
 * Target: ~2,304 paintings
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://online-sammlung.hamburger-kunsthalle.de';
const OUTPUT_FILE = path.join(__dirname, '../public/data/hamburger-kunsthalle-paintings.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/hamburger-kunsthalle-progress.json');
const ITEMS_PER_PAGE = 20; // API only returns 20 per page
const TOTAL_ITEMS = 2304;

// Rate limiting
const DELAY_BETWEEN_REQUESTS = 300; // ms

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      console.log(`📥 Loaded progress: ${data.artworks?.length || 0} artworks, last start: ${data.lastStart || 0}`);
      return data;
    } catch (e) {
      console.log('📄 Starting fresh');
    }
  }
  return { artworks: [], processedIds: [], lastStart: 0 };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function fetchSearchPage(start) {
  return new Promise((resolve, reject) => {
    const url = `/en/search-api/default/search-page?start=${start}&rows=20&filter%5Bobj_classification_s%5D%5B0%5D=Malerei`;
    
    const options = {
      hostname: 'online-sammlung.hamburger-kunsthalle.de',
      port: 443,
      path: url,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

function parseGridHtml(html) {
  const artworks = [];
  
  // Match each result block with all data
  const blockRegex = /<div id="result-(\d+)"[^>]*data-result-url="([^"]+)"[\s\S]*?<img[^>]*src="([^"]+)"[\s\S]*?<h2[^>]*><a[^>]*>([^<]+)<\/a><\/h2>\s*<div class="object-teaser__subtitle[^>]*>([^<]*)<\/div>\s*<div class="object-teaser__meta[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
  
  let match;
  while ((match = blockRegex.exec(html)) !== null) {
    const [_, resultId, url, imageUrl, artist, subtitleRaw, metaHtml] = match;
    
    // Parse subtitle (title, date)
    let title = subtitleRaw.trim();
    let date = '';
    
    // Extract date patterns like "1831", "um 1811", "1827-1833", "vor 1840"
    const dateMatch = title.match(/,\s*((?:um\s+)?(?:vor\s+)?(?:nach\s+)?(?:ca\.\s*)?\d{4}(?:\s*[-\/]\s*\d{4})?)$/);
    if (dateMatch) {
      date = dateMatch[1].trim();
      title = title.replace(/,\s*(?:um\s+)?(?:vor\s+)?(?:nach\s+)?(?:ca\.\s*)?\d{4}(?:\s*[-\/]\s*\d{4})?$/, '').trim();
    }
    
    // Parse meta items
    const metaItems = [];
    const metaItemRegex = /<span class="object-teaser__meta-item">([^<]+)<\/span>/g;
    let metaMatch;
    while ((metaMatch = metaItemRegex.exec(metaHtml)) !== null) {
      metaItems.push(metaMatch[1].trim());
    }
    
    // Extract material, dimensions, inventory
    let material = '';
    let dimensions = '';
    let inventoryNumber = '';
    
    for (const item of metaItems) {
      if (item.match(/^HK-\d+/)) {
        inventoryNumber = item;
      } else if (item.match(/cm|^\[.*\]$/)) {
        // Parse dimensions array
        try {
          const cleaned = item.replace(/&quot;/g, '"');
          const dimArray = JSON.parse(cleaned);
          dimensions = Array.isArray(dimArray) ? dimArray.join('; ') : cleaned;
        } catch {
          dimensions = item.replace(/&quot;/g, '"').replace(/[\[\]]/g, '');
        }
      } else {
        material = item;
      }
    }
    
    // Convert to full resolution URL
    let fullImageUrl = imageUrl;
    if (fullImageUrl) {
      // Remove style path for full resolution
      fullImageUrl = fullImageUrl.replace(/\/styles\/[^/]+\/public\//, '/');
      fullImageUrl = fullImageUrl.split('?')[0]; // Remove query params
    }
    
    // Extract inventory number from URL
    const urlMatch = url.match(/\/objekt\/([^/]+)/);
    const id = urlMatch ? urlMatch[1] : `result-${resultId}`;
    
    artworks.push({
      id,
      resultId,
      title,
      artist: artist.trim(),
      date,
      material,
      dimensions,
      inventoryNumber: inventoryNumber || id,
      imageUrl: fullImageUrl,
      thumbnailUrl: imageUrl,
      detailUrl: `${BASE_URL}${url.split('?')[0]}`
    });
  }
  
  return artworks;
}

async function main() {
  console.log('🎨 Hamburger Kunsthalle - Malerei Collection Scraper');
  console.log('=' .repeat(60));
  
  // Load progress
  let progress = loadProgress();
  const processedIds = new Set(progress.processedIds || []);
  
  const totalPages = Math.ceil(TOTAL_ITEMS / ITEMS_PER_PAGE);
  console.log(`📄 Total pages to fetch: ${totalPages} (${ITEMS_PER_PAGE} items/page)`);
  
  let allArtworks = progress.artworks || [];
  let errorCount = 0;
  let startPage = Math.floor((progress.lastStart || 0) / ITEMS_PER_PAGE);
  
  if (startPage > 0) {
    console.log(`📌 Resuming from page ${startPage + 1}`);
  }
  
  try {
    for (let page = startPage; page < totalPages; page++) {
      const start = page * ITEMS_PER_PAGE;
      
      process.stdout.write(`\r📄 Page ${page + 1}/${totalPages} (${start}-${start + ITEMS_PER_PAGE})...`);
      
      try {
        const response = await fetchSearchPage(start);
        
        // Get the grid HTML content
        const gridHtml = response?.content?.grid || '';
        
        if (!gridHtml) {
          console.log(`\n  ⚠️  No grid content on page ${page + 1}`);
          errorCount++;
          continue;
        }
        
        // Parse artworks from HTML
        const artworks = parseGridHtml(gridHtml);
        
        // Add new artworks (avoid duplicates)
        let newCount = 0;
        for (const artwork of artworks) {
          if (!processedIds.has(artwork.id)) {
            allArtworks.push(artwork);
            processedIds.add(artwork.id);
            newCount++;
          }
        }
        
        process.stdout.write(` ✅ ${artworks.length} found, ${newCount} new (Total: ${allArtworks.length})`);
        
        // Update progress
        progress.artworks = allArtworks;
        progress.processedIds = Array.from(processedIds);
        progress.lastStart = start + ITEMS_PER_PAGE;
        
        // Save progress every 10 pages
        if ((page + 1) % 10 === 0) {
          saveProgress(progress);
          process.stdout.write(' 💾');
        }
        
        await sleep(DELAY_BETWEEN_REQUESTS);
        
      } catch (error) {
        console.error(`\n  ❌ Error on page ${page + 1}: ${error.message}`);
        errorCount++;
        
        // Save progress on error
        saveProgress(progress);
        
        // Retry after longer delay
        await sleep(2000);
      }
    }
    
    console.log('\n');
    
    // Final save
    saveProgress(progress);
    
    // Save final output
    const output = {
      museum: 'Hamburger Kunsthalle',
      collection: 'Malerei (Paintings)',
      website: 'https://online-sammlung.hamburger-kunsthalle.de',
      scraped_date: new Date().toISOString(),
      total_count: allArtworks.length,
      artworks: allArtworks
    };
    
    // Ensure directory exists
    const outputDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    
    console.log('=' .repeat(60));
    console.log('📊 Scraping Complete!');
    console.log(`  ✅ Total artworks: ${allArtworks.length}`);
    console.log(`  ❌ Errors: ${errorCount}`);
    console.log(`  📁 Output: ${OUTPUT_FILE}`);
    
    // Sample data
    if (allArtworks.length > 0) {
      console.log('\n📝 Sample artwork:');
      const sample = allArtworks[Math.floor(Math.random() * allArtworks.length)];
      console.log(`  ID: ${sample.id}`);
      console.log(`  Title: ${sample.title}`);
      console.log(`  Artist: ${sample.artist}`);
      console.log(`  Date: ${sample.date || 'n.d.'}`);
      console.log(`  Material: ${sample.material}`);
      console.log(`  Image: ${sample.imageUrl}`);
    }
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    saveProgress(progress);
  }
}

main().catch(console.error);
