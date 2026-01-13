/**
 * Hamburger Kunsthalle Scraper - Zeichnung (Drawings) & Video Collections
 * Uses the museum's search API (GET method with URL parameters)
 * 
 * Usage:
 *   node scripts/scrape-hamburger-kunsthalle-collections.cjs zeichnung
 *   node scripts/scrape-hamburger-kunsthalle-collections.cjs video
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Get collection type from command line
const collectionType = process.argv[2]?.toLowerCase();

if (!collectionType || !['zeichnung', 'video'].includes(collectionType)) {
  console.log('Usage: node scripts/scrape-hamburger-kunsthalle-collections.cjs <zeichnung|video>');
  process.exit(1);
}

const COLLECTIONS = {
  zeichnung: {
    filter: 'Zeichnung',
    name: 'Zeichnung (Drawings)',
    outputFile: 'hamburger-kunsthalle-drawings.json'
  },
  video: {
    filter: 'Video',
    name: 'Video',
    outputFile: 'hamburger-kunsthalle-video.json'
  }
};

const config = COLLECTIONS[collectionType];
const PAGE_SIZE = 20;
const DELAY_MS = 300;
const BASE_URL = 'online-sammlung.hamburger-kunsthalle.de';
const PROGRESS_FILE = path.join(__dirname, '..', 'downloads', `hamburger-kunsthalle-${collectionType}-progress.json`);
const OUTPUT_FILE = path.join(__dirname, '..', 'public', 'data', config.outputFile);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchPage(start) {
  return new Promise((resolve, reject) => {
    const urlPath = `/en/search-api/default/search-page?start=${start}&filter%5Bobj_classification_s%5D%5B0%5D=${encodeURIComponent(config.filter)}`;
    
    const options = {
      hostname: BASE_URL,
      port: 443,
      path: urlPath,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

function parseArtworksFromGrid(gridHtml) {
  const artworks = [];
  
  // Match each search result item
  const itemRegex = /<div id="result-(\d+)"[^>]*data-result-url="([^"]+)"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
  let match;
  
  while ((match = itemRegex.exec(gridHtml)) !== null) {
    const resultId = match[1];
    const detailPath = match[2].replace(/&amp;/g, '&');
    const itemHtml = match[3];
    
    // Extract inventory number from URL (e.g., /en/objekt/1954-220/...)
    const invMatch = detailPath.match(/\/objekt\/([^\/]+)\//);
    const inventoryNumber = invMatch ? invMatch[1] : '';
    
    // Extract title from subtitle div
    const subtitleMatch = itemHtml.match(/<div class="object-teaser__subtitle[^"]*">([^<]+)</);
    let title = subtitleMatch ? subtitleMatch[1].trim() : '';
    let date = '';
    
    // Title format: "Title, Year" - split them
    if (title.includes(', ')) {
      const lastComma = title.lastIndexOf(', ');
      const possibleYear = title.substring(lastComma + 2).trim();
      // Check if it looks like a year (starts with digit or "um", "vor", "nach", etc.)
      if (/^(\d|um |vor |nach |ca\.|circa)/i.test(possibleYear)) {
        date = possibleYear;
        title = title.substring(0, lastComma).trim();
      }
    }
    
    // Extract artist from title link
    const artistMatch = itemHtml.match(/<h2[^>]*><a[^>]*>([^<]+)<\/a><\/h2>/);
    let artist = artistMatch ? artistMatch[1].trim() : 'Unknown';
    // Clean artist name - remove roles like ", Zeichner" or ", Künstler"
    artist = artist.replace(/,\s*(Zeichner|Künstler|Maler|Bildhauer|Fotograf|Grafiker)$/i, '').trim();
    
    // Extract meta items (material, dimensions, inventory)
    const metaMatches = [...itemHtml.matchAll(/<span class="object-teaser__meta-item">([^<]*)<\/span>/g)];
    let material = '';
    let dimensions = '';
    let duration = '';
    
    for (const m of metaMatches) {
      const content = m[1].trim();
      if (!content) continue;
      
      // Check for dimensions pattern (contains mm, cm, or brackets)
      if (content.startsWith('[') || /\d+\s*(mm|cm)\s*x/i.test(content)) {
        dimensions = content.replace(/^\["|"\]$/g, '').replace(/\\"/g, '"');
      } else if (content === inventoryNumber) {
        // Skip inventory number
        continue;
      } else {
        // Material/technique field - may contain duration for videos
        material = content;
        
        // Extract duration from material if present
        // Formats: "8:53 Min." or "4:30 Min., Loop" or "78 Min." or "5'30\""
        // Avoid matching codec patterns like "4:2:0" or "4:2:2"
        const durationMatch = content.match(/(?:^|,\s*)(\d{1,3}:\d{2}(?::\d{2})?)\s*Min\.?/i) || 
                              content.match(/(?:^|,\s*)(\d{1,3})\s*Min\.?(?:\s*,|\s*$|[,\s]+Loop)/i) ||
                              content.match(/(\d+)['\u2019]\s*(\d+)?["\u201D]?\s*$/);
        if (durationMatch) {
          if (durationMatch[2] !== undefined && !durationMatch[1].includes(':')) {
            // Format: "5'30\""
            duration = durationMatch[1] + ':' + (durationMatch[2] || '00');
          } else {
            // Format: "8:53 Min." or "78 Min."
            duration = durationMatch[1];
          }
        }
      }
    }
    
    // Extract image URL
    const imgMatch = itemHtml.match(/<img src="([^"]+)"/);
    const thumbnailUrl = imgMatch ? imgMatch[1] : '';
    // Get full resolution image URL
    const imageUrl = thumbnailUrl.replace(/\/styles\/tile\/public\//, '/').replace(/\?itok=.*$/, '');
    
    artworks.push({
      id: inventoryNumber || `HK-${resultId}`,
      resultId,
      title: title || 'Untitled',
      artist,
      date,
      material,
      dimensions,
      ...(duration && { duration }),  // Only include duration if present
      inventoryNumber,
      imageUrl,
      thumbnailUrl,
      detailUrl: `https://${BASE_URL}${detailPath.split('?')[0]}`
    });
  }
  
  return artworks;
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      console.log(`📂 Resuming from progress: ${data.artworks.length} artworks, lastStart=${data.lastStart}`);
      return data;
    }
  } catch (e) {
    console.log('⚠️ Could not load progress file, starting fresh');
  }
  return { artworks: [], lastStart: 0, errors: [] };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function scrape() {
  console.log(`\n🎨 Hamburger Kunsthalle - ${config.name} Collection Scraper`);
  console.log('='.repeat(60));
  
  // First, get total count
  console.log('📊 Fetching total count...');
  const firstPage = await fetchPage(0);
  const totalCount = firstPage.response?.numFound || 0;
  console.log(`   Total artworks: ${totalCount.toLocaleString()}`);
  
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  console.log(`   Total pages: ${totalPages}`);
  
  // Load progress
  const progress = loadProgress();
  let startFrom = progress.lastStart;
  
  // Start scraping
  console.log(`\n🚀 Starting scrape from position ${startFrom}...`);
  
  for (let start = startFrom; start < totalCount; start += PAGE_SIZE) {
    const pageNum = Math.floor(start / PAGE_SIZE) + 1;
    
    try {
      const response = await fetchPage(start);
      const gridHtml = response.content?.grid || '';
      const artworks = parseArtworksFromGrid(gridHtml);
      
      progress.artworks.push(...artworks);
      progress.lastStart = start + PAGE_SIZE;
      
      // Progress indicator
      const pct = ((start + PAGE_SIZE) / totalCount * 100).toFixed(1);
      process.stdout.write(`\r  📄 Page ${pageNum}/${totalPages} (${pct}%) - ${progress.artworks.length} artworks collected`);
      
      // Save progress every 10 pages
      if (pageNum % 10 === 0) {
        saveProgress(progress);
      }
      
      await sleep(DELAY_MS);
    } catch (error) {
      console.error(`\n  ❌ Error at page ${pageNum}: ${error.message}`);
      progress.errors.push({ page: pageNum, start, error: error.message });
      saveProgress(progress);
      await sleep(2000);  // Longer delay after error
    }
  }
  
  console.log('\n');
  
  // Remove duplicates by id
  const uniqueMap = new Map();
  for (const art of progress.artworks) {
    uniqueMap.set(art.id, art);
  }
  const uniqueArtworks = Array.from(uniqueMap.values());
  
  // Save final output
  const output = {
    museum: 'Hamburger Kunsthalle',
    collection: config.name,
    website: `https://${BASE_URL}`,
    scraped_date: new Date().toISOString(),
    total_count: uniqueArtworks.length,
    artworks: uniqueArtworks
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  
  console.log('📊 Scraping Complete!');
  console.log(`  ✅ Total artworks: ${uniqueArtworks.length}`);
  console.log(`  ❌ Errors: ${progress.errors.length}`);
  console.log(`  📁 Output: ${OUTPUT_FILE}`);
  
  // Clean up progress file on success
  if (progress.errors.length === 0 && uniqueArtworks.length > 0) {
    try {
      fs.unlinkSync(PROGRESS_FILE);
      console.log('  🧹 Progress file cleaned up');
    } catch (e) {}
  }
  
  // Show sample
  if (uniqueArtworks.length > 0) {
    console.log('\n📝 Sample artwork:');
    const sample = uniqueArtworks[0];
    console.log(`  Title: ${sample.title}`);
    console.log(`  Artist: ${sample.artist}`);
    console.log(`  Date: ${sample.date}`);
    console.log(`  Material: ${sample.material}`);
    if (sample.duration) {
      console.log(`  Duration: ${sample.duration}`);
    }
  }
}

scrape().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
