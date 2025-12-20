/**
 * Comprehensive Tate Britain Display Scraper v3
 * - Scrapes artwork info from room pages (artist full name, title, year, image)
 * - Validates images (skip white/blank images)
 * - Uploads images to R2 for stability
 * - Updates the JSON data
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Display exhibitions to scrape
const DISPLAYS = [
  {
    id: 'tate-britain-display-jmw-turner',
    name: 'JMW Turner',
    baseUrl: 'https://www.tate.org.uk/visit/tate-britain/display/jmw-turner'
  },
  {
    id: 'tate-britain-display-historic-early-modern',
    name: 'Historic and Early Modern British Art',
    baseUrl: 'https://www.tate.org.uk/visit/tate-britain/display/historic-early-modern-british-art'
  },
  {
    id: 'tate-britain-display-modern-contemporary',
    name: 'Modern and Contemporary British Art',
    baseUrl: 'https://www.tate.org.uk/visit/tate-britain/display/modern-and-contemporary-british-art'
  },
  {
    id: 'tate-britain-display-art-around-building',
    name: 'Art Around the Building',
    baseUrl: 'https://www.tate.org.uk/visit/tate-britain/display/art-around-the-building'
  }
];

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const IMAGES_DIR = path.join(__dirname, '../temp-tate-display-images');
const TATE_BRITAIN_FILE = path.join(OUTPUT_DIR, 'tate-britain.json');

// Create images directory if needed
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

/**
 * Download an image and check if it's valid (not white/blank)
 */
async function downloadAndValidateImage(url, filename) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        resolve({ valid: false, reason: `HTTP ${response.statusCode}` });
        return;
      }
      
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        
        // Check file size - too small likely means placeholder
        if (buffer.length < 5000) {
          resolve({ valid: false, reason: 'Too small (likely placeholder)' });
          return;
        }
        
        // Check for white image by looking at JPEG data
        // A mostly white image will have very little variation
        // Simple heuristic: check if first few KB have low entropy
        const sample = buffer.slice(0, Math.min(buffer.length, 10000));
        let zeroCount = 0;
        let ffCount = 0;
        for (let i = 0; i < sample.length; i++) {
          if (sample[i] === 0) zeroCount++;
          if (sample[i] === 255) ffCount++;
        }
        
        // If mostly 0xFF bytes (white in JPEG), it's likely blank
        const ffRatio = ffCount / sample.length;
        if (ffRatio > 0.8) {
          resolve({ valid: false, reason: 'Mostly white image' });
          return;
        }
        
        // Save the file
        const filepath = path.join(IMAGES_DIR, filename);
        fs.writeFileSync(filepath, buffer);
        resolve({ valid: true, path: filepath, size: buffer.length });
      });
      response.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Scrape a single room page for all artworks
 */
async function scrapeRoomArtworks(page, roomUrl) {
  console.log(`    Navigating to: ${roomUrl}`);
  
  try {
    await page.goto(roomUrl, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    console.log(`    Warning: Page load timeout, continuing...`);
  }
  
  await page.waitForTimeout(1500);
  
  // Click "Load more" buttons to get all artworks
  for (let i = 0; i < 10; i++) {
    try {
      const loadMoreBtn = await page.$('button:has-text("Load")');
      if (loadMoreBtn && await loadMoreBtn.isVisible()) {
        await loadMoreBtn.click();
        await page.waitForTimeout(1000);
      } else {
        break;
      }
    } catch (e) { break; }
  }
  
  await page.waitForTimeout(500);
  
  // Extract artwork information from the page
  // The page structure shows artworks like:
  // <figure>
  //   <img src="https://media.tate.org.uk/art/images/work/N/N00/N00459_10.jpg" alt="N00459: Moonlight...">
  //   <figcaption>
  //     Joseph Mallord William Turner
  //     Moonlight, a Study at Millbank
  //     exhibited 1797
  //   </figcaption>
  // </figure>
  
  const artworks = await page.evaluate(() => {
    const results = [];
    
    // Try to get structured artwork blocks
    // Look for figures/divs containing artwork images
    const artworkContainers = document.querySelectorAll('figure, [class*="artwork"], [class*="work-item"]');
    
    for (const container of artworkContainers) {
      const img = container.querySelector('img[src*="media.tate.org.uk/art/images"]');
      if (!img) continue;
      
      const imageSrc = img.src || '';
      const altText = img.alt || '';
      
      // Get text content from the container
      const textContent = container.textContent || '';
      
      // Try to find a link to the artwork page
      const link = container.querySelector('a[href*="/art/artworks/"]');
      const artworkUrl = link ? link.href : '';
      
      // Extract artwork ID from image URL
      const idMatch = imageSrc.match(/\/([A-Z]\d{5})_/i) || imageSrc.match(/\/([NTPDL]\d+)_/i);
      const artworkId = idMatch ? idMatch[1].toUpperCase() : '';
      
      if (!artworkId) continue;
      
      results.push({
        id: artworkId,
        image: imageSrc,
        url: artworkUrl,
        altText,
        textContent: textContent.substring(0, 500)
      });
    }
    
    // Fallback: directly find all Tate artwork images
    if (results.length === 0) {
      const allImages = document.querySelectorAll('img[src*="media.tate.org.uk/art/images"]');
      for (const img of allImages) {
        const imageSrc = img.src || '';
        const idMatch = imageSrc.match(/\/([A-Z]\d{5})_/i) || imageSrc.match(/\/([NTPDL]\d+)_/i);
        const artworkId = idMatch ? idMatch[1].toUpperCase() : '';
        
        if (!artworkId) continue;
        
        // Find parent container and its text
        let container = img.parentElement;
        for (let i = 0; i < 5 && container; i++) {
          if (container.querySelector('a[href*="/art/artworks/"]')) break;
          container = container.parentElement;
        }
        
        const link = container?.querySelector('a[href*="/art/artworks/"]');
        const textContent = container?.textContent || '';
        
        results.push({
          id: artworkId,
          image: imageSrc,
          url: link?.href || '',
          altText: img.alt || '',
          textContent: textContent.substring(0, 500)
        });
      }
    }
    
    // Remove duplicates
    const seen = new Set();
    return results.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  });
  
  console.log(`    Found ${artworks.length} artworks on page`);
  return artworks;
}

/**
 * Fetch detailed artwork info from individual artwork page
 */
async function fetchArtworkDetails(page, artworkUrl) {
  try {
    await page.goto(artworkUrl, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(800);
    
    const data = await page.evaluate(() => {
      // Title - from h1
      const titleEl = document.querySelector('h1');
      const title = titleEl?.textContent?.trim() || '';
      
      // Get the caption area text
      const captionText = document.querySelector('.artwork__caption, [class*="caption"]')?.textContent || document.body.textContent;
      
      // Artist - look for "More by Artist Name" pattern
      const artistMatch = captionText.match(/More by ([^\n,]+)/);
      const artist = artistMatch ? artistMatch[1].trim() : '';
      
      // Year - look for patterns like "exhibited 1797", "1798", "c.1800"
      const yearPatterns = [
        /exhibited\s+(\d{4})/i,
        /(\d{4})(?:\s*[-–]\s*\d{2,4})?/,  // 1798 or 1798-99
        /c\.?\s*(\d{4})/i  // c.1800
      ];
      
      let year = '';
      for (const pattern of yearPatterns) {
        const match = captionText.match(pattern);
        if (match) {
          year = match[1];
          break;
        }
      }
      
      // High-res image
      const imgEl = document.querySelector('img[src*="media.tate.org.uk/art/images/work"]');
      let image = imgEl?.src || '';
      
      // Ensure high-res version (_10)
      if (image && !image.includes('_10.')) {
        image = image.replace(/_\d+\./, '_10.');
      }
      
      return { title, artist, year, image };
    });
    
    return data;
  } catch (err) {
    console.log(`    Error fetching ${artworkUrl}: ${err.message}`);
    return null;
  }
}

/**
 * Parse artwork info from room page text
 */
function parseArtworkFromText(textContent, altText) {
  let artist = '';
  let title = '';
  let year = '';
  
  // Clean up text
  const text = textContent.replace(/\s+/g, ' ').trim();
  
  // Try to extract artist name - usually the first line
  // Format: "Joseph Mallord William Turner Moonlight, a Study at Millbank exhibited 1797"
  
  // Common artist name patterns (full names)
  const artistPatterns = [
    /(Joseph Mallord William Turner)/i,
    /(John Constable)/i,
    /(William Blake)/i,
    /(Francis Bacon)/i,
    /(David Hockney)/i,
    /(Lucian Freud)/i,
    /(Henry Moore)/i,
    /(Barbara Hepworth)/i,
    /(Stanley Spencer)/i,
    /(William Hogarth)/i,
    /(Thomas Gainsborough)/i,
    /(Joshua Reynolds)/i,
    /(John Singer Sargent)/i,
    /(Dante Gabriel Rossetti)/i,
    /(John Everett Millais)/i,
    /(William Holman Hunt)/i,
    /(George Stubbs)/i,
    /(James Abbott McNeill Whistler)/i,
    /(Bridget Riley)/i,
    /(Tracey Emin)/i,
    /(Damien Hirst)/i,
    /(Antony Gormley)/i,
    /(Anish Kapoor)/i,
    /(Gwen John)/i,
    /(Vanessa Bell)/i,
    /(Duncan Grant)/i,
    /(Unknown artist[,\s]+Britain)/i,
    /([A-Z][a-z]+ [A-Z][a-z]+ [A-Z][a-z]+)/,  // Three-word name
    /([A-Z][a-z]+ [A-Z][a-z]+)/  // Two-word name
  ];
  
  for (const pattern of artistPatterns) {
    const match = text.match(pattern);
    if (match) {
      artist = match[1].trim();
      break;
    }
  }
  
  // Extract year
  const yearMatch = text.match(/(?:exhibited\s+)?(\d{4})(?:\s*[-–]\s*\d{2,4})?/i) ||
                    text.match(/c\.?\s*(\d{4})/i);
  if (yearMatch) {
    year = yearMatch[1];
  }
  
  // Extract title from alt text if available
  if (altText) {
    // Alt text format: "N00459: Moonlight, a Study at Millbank"
    const altMatch = altText.match(/^[A-Z]\d+:\s*(.+)$/);
    if (altMatch) {
      title = altMatch[1].trim();
    }
  }
  
  // Try to extract title from text if not from alt
  if (!title && artist) {
    // Remove artist name and year to get title
    let remaining = text;
    if (artist) remaining = remaining.replace(artist, '');
    if (year) {
      remaining = remaining.replace(new RegExp(`exhibited\\s*${year}`, 'i'), '');
      remaining = remaining.replace(new RegExp(`c\\.?\\s*${year}`, 'i'), '');
      remaining = remaining.replace(year, '');
    }
    remaining = remaining.replace(/More on this artwork/gi, '').trim();
    
    // Clean up
    remaining = remaining.replace(/^\s*[,\s]+/, '').replace(/[,\s]+$/, '').trim();
    
    if (remaining.length > 2 && remaining.length < 200) {
      title = remaining;
    }
  }
  
  return { artist, title, year };
}

/**
 * Main scraping function
 */
async function main() {
  console.log('=== Tate Britain Display Scraper v3 ===\n');
  console.log('This script will:');
  console.log('1. Scrape artwork info from room pages');
  console.log('2. Fetch detailed info from individual artwork pages');
  console.log('3. Validate images (skip white/blank)');
  console.log('4. Update tate-britain.json\n');
  
  // Load existing data
  let existingData = { items: [] };
  if (fs.existsSync(TATE_BRITAIN_FILE)) {
    existingData = JSON.parse(fs.readFileSync(TATE_BRITAIN_FILE, 'utf-8'));
  }
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  const scrapedDisplays = [];
  
  for (const display of DISPLAYS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing: ${display.name}`);
    console.log(`URL: ${display.baseUrl}`);
    console.log(`${'='.repeat(60)}`);
    
    try {
      await page.goto(display.baseUrl, { waitUntil: 'networkidle', timeout: 45000 });
    } catch (e) {
      console.log(`Warning: Main page load timeout, continuing...`);
    }
    
    await page.waitForTimeout(2000);
    
    // Get display description
    const description = await page.evaluate(() => {
      const desc = document.querySelector('article p, .content p, main p');
      return desc?.textContent?.trim().substring(0, 500) || '';
    });
    
    // Get main display image
    const displayImage = await page.evaluate(() => {
      const img = document.querySelector('img[src*="media.tate.org.uk"]');
      return img?.src || '';
    });
    
    // Get all room links
    const roomLinks = await page.evaluate(() => {
      const links = [];
      const seen = new Set();
      
      // Find room links
      const allLinks = document.querySelectorAll('a[href*="/display/"]');
      for (const a of allLinks) {
        const href = a.href;
        // Skip if it's the main display page
        if (href.split('/display/').pop()?.includes('/') && !seen.has(href)) {
          seen.add(href);
          
          // Try to get room name from nearby text
          const container = a.closest('li, div, article');
          const nameEl = container?.querySelector('strong, h3, h4, span');
          const name = nameEl?.textContent?.trim() || a.textContent?.trim() || '';
          
          if (name && !name.includes('Back to') && !name.includes('Go to')) {
            links.push({ url: href, name });
          }
        }
      }
      
      return links;
    });
    
    console.log(`Found ${roomLinks.length} room links`);
    
    const rooms = [];
    let roomNumber = 1;
    
    for (const roomLink of roomLinks) {
      console.log(`\n  Room ${roomNumber}: ${roomLink.name}`);
      
      // Scrape artworks from room page
      const rawArtworks = await scrapeRoomArtworks(page, roomLink.url);
      
      const artworks = [];
      
      for (const raw of rawArtworks) {
        console.log(`    Processing artwork: ${raw.id}`);
        
        // Try to parse info from room page text first
        const parsed = parseArtworkFromText(raw.textContent, raw.altText);
        
        let artwork = {
          id: raw.id,
          url: raw.url || `https://www.tate.org.uk/art/artworks/${raw.id.toLowerCase()}`,
          image: raw.image,
          title: parsed.title || '',
          artist: parsed.artist || '',
          year: parsed.year || ''
        };
        
        // If we're missing info, fetch from artwork page
        if (!artwork.title || !artwork.artist) {
          if (raw.url) {
            console.log(`      Fetching details from artwork page...`);
            const details = await fetchArtworkDetails(page, raw.url);
            if (details) {
              if (!artwork.title && details.title) artwork.title = details.title;
              if (!artwork.artist && details.artist) artwork.artist = details.artist;
              if (!artwork.year && details.year) artwork.year = details.year;
              if (details.image) artwork.image = details.image;
            }
            await page.waitForTimeout(300);
          }
        }
        
        // Ensure high-res image
        if (artwork.image && !artwork.image.includes('_10.')) {
          artwork.image = artwork.image.replace(/_\d+\./, '_10.');
        }
        
        // Validate the image isn't blank
        if (artwork.image) {
          const filename = `${raw.id}.jpg`;
          try {
            const result = await downloadAndValidateImage(artwork.image, filename);
            if (!result.valid) {
              console.log(`      Image invalid: ${result.reason}`);
              artwork.image = ''; // Clear invalid image
            } else {
              console.log(`      Image OK (${Math.round(result.size / 1024)}KB)`);
            }
          } catch (e) {
            console.log(`      Image download error: ${e.message}`);
          }
        }
        
        // Only add if we have at least title or image
        if (artwork.title || artwork.image) {
          artworks.push(artwork);
        }
      }
      
      console.log(`    Total valid artworks: ${artworks.length}`);
      
      if (artworks.length > 0) {
        rooms.push({
          id: `tb-display-${display.id.split('-').pop()}-${roomLink.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          name: roomLink.name,
          roomNumber: `Room ${roomNumber}`,
          description: '',
          url: roomLink.url,
          artworkCount: artworks.length,
          artworks
        });
      }
      
      roomNumber++;
      await page.waitForTimeout(500);
    }
    
    scrapedDisplays.push({
      id: display.id,
      name: display.name,
      title: display.name,
      description: description || `Explore ${display.name} at Tate Britain.`,
      startDate: 'Ongoing',
      endDate: '',
      image: displayImage || '',
      url: display.baseUrl,
      museumName: 'Tate Britain',
      museumLocation: 'Millbank, London SW1P 4RG, United Kingdom',
      rooms
    });
    
    console.log(`\nCompleted ${display.name}: ${rooms.length} rooms, ${rooms.reduce((sum, r) => sum + r.artworks.length, 0)} artworks`);
  }
  
  await browser.close();
  
  // Update existing data - only update the display items
  const displayIds = new Set(DISPLAYS.map(d => d.id));
  const otherItems = existingData.items.filter(item => !displayIds.has(item.id));
  
  // Combine: keep other items, add updated displays
  existingData.items = [...otherItems, ...scrapedDisplays];
  
  // Save updated data
  fs.writeFileSync(TATE_BRITAIN_FILE, JSON.stringify(existingData, null, 2));
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Saved to: ${TATE_BRITAIN_FILE}`);
  console.log(`Total displays updated: ${scrapedDisplays.length}`);
  console.log(`Total rooms: ${scrapedDisplays.reduce((sum, d) => sum + d.rooms.length, 0)}`);
  console.log(`Total artworks: ${scrapedDisplays.reduce((sum, d) => sum + d.rooms.reduce((s, r) => s + r.artworks.length, 0), 0)}`);
  console.log(`${'='.repeat(60)}`);
  
  // Also save the displays separately for backup
  const displaysFile = path.join(OUTPUT_DIR, 'tate-britain-displays.json');
  const displaysData = {};
  for (const d of scrapedDisplays) {
    displaysData[d.id.replace('tate-britain-display-', '')] = d;
  }
  fs.writeFileSync(displaysFile, JSON.stringify(displaysData, null, 2));
  console.log(`Backup saved to: ${displaysFile}`);
}

main().catch(console.error);
