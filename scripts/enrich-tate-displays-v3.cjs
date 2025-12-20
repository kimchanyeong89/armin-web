/**
 * Enrich Tate Britain Display Artworks v3
 * - Fetches artwork details from individual artwork pages
 * - Gets: artist full name (NO abbreviations), title, year (4 digits only)
 * - Validates images (skips white/blank images)
 * - Uploads images to R2 for stability
 * - Only processes display exhibitions (not other exhibitions)
 * 
 * Usage: node scripts/enrich-tate-displays-v3.cjs
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const DISPLAYS_FILE = path.join(__dirname, '../public/data/tate-britain-displays.json');
const OUTPUT_FILE = path.join(__dirname, '../public/data/tate-britain-displays.json');
const IMAGES_DIR = path.join(__dirname, '../temp-tate-display-images');
const R2_BUCKET = 'armin-web';
const R2_PUBLIC_URL = 'https://pub-0e9cd559fbf4456c9304536a417d9f86.r2.dev';

// Create images directory
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// Only these display exhibitions
const TARGET_DISPLAYS = [
  'jmw-turner',
  'historic-early-modern',
  'modern-contemporary',
  'art-around-building'
];

/**
 * Check if an image URL returns a valid (non-white) image
 */
async function isValidImage(url) {
  return new Promise((resolve) => {
    if (!url) {
      resolve(false);
      return;
    }

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        resolve(false);
        return;
      }

      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        
        // Too small = likely placeholder
        if (buffer.length < 5000) {
          resolve(false);
          return;
        }

        // Check for mostly white image
        const sample = buffer.slice(0, Math.min(buffer.length, 10000));
        let ffCount = 0;
        for (let i = 0; i < sample.length; i++) {
          if (sample[i] === 255) ffCount++;
        }
        
        const ffRatio = ffCount / sample.length;
        if (ffRatio > 0.7) {
          resolve(false);
          return;
        }

        resolve(true);
      });
      response.on('error', () => resolve(false));
    }).on('error', () => resolve(false));
  });
}

/**
 * Try different image size suffixes to find a valid image
 */
async function findValidImageUrl(artworkId) {
  const prefix = artworkId.charAt(0);
  const midPart = artworkId.substring(0, 3);
  const baseUrl = `https://media.tate.org.uk/art/images/work/${prefix}/${midPart}/${artworkId}`;
  
  // Try different sizes: _10 (large), _9, _8
  for (const suffix of ['_10', '_9', '_8']) {
    const url = `${baseUrl}${suffix}.jpg`;
    if (await isValidImage(url)) {
      return url;
    }
  }
  
  return null;
}

/**
 * Extract year as 4-digit number only
 */
function extractYear(text) {
  if (!text) return '';
  
  // Find first 4-digit year between 1400-2100
  const match = text.match(/\b(1[4-9]\d{2}|20\d{2}|21\d{2})\b/);
  return match ? match[1] : '';
}

/**
 * Parse og:title to get artwork info
 * Format: "'Title', Artist Name, date | Tate"
 * Examples:
 *   "'Moonlight, a Study at Millbank', Joseph Mallord William Turner, exhibited 1797 | Tate"
 *   "'The Deluge', Joseph Mallord William Turner, exhibited 1805 | Tate"
 */
function parseOgTitle(ogTitle) {
  if (!ogTitle) return null;
  
  // Remove " | Tate" suffix
  let cleaned = ogTitle.replace(/\s*\|\s*Tate\s*$/i, '').trim();
  
  let title = '';
  let artist = '';
  let year = '';
  
  // Pattern: 'Title', Artist Name, date
  // Title is always in single quotes
  const quotedMatch = cleaned.match(/^'([^']+)',\s*(.+)$/);
  
  if (quotedMatch) {
    title = quotedMatch[1].trim();
    const remainder = quotedMatch[2].trim();
    
    // Extract year first (look for exhibited/c. followed by 4 digits, or just 4 digits)
    // Handle patterns like "?exhibited", "? exhibited", "exhibited", "c.1805", etc.
    const yearPatterns = [
      /,?\s*\??\s*exhibited\s+(\d{4})(?:\s*[-–]?\s*\d{0,4})?$/i,
      /,?\s*\??\s*c\.?\s*(\d{4})(?:\s*[-–]?\s*\d{0,4})?$/i,
      /,?\s*(\d{4})(?:\s*[-–]?\s*\d{0,4})?$/i
    ];
    
    let remainderWithoutYear = remainder;
    for (const pattern of yearPatterns) {
      const match = remainder.match(pattern);
      if (match) {
        year = match[1];
        remainderWithoutYear = remainder.replace(match[0], '').trim();
        break;
      }
    }
    
    // What's left should be the artist name
    artist = remainderWithoutYear.replace(/,\s*$/, '').trim();
  } else {
    // Fallback: try to parse without quotes
    const yearMatch = cleaned.match(/,?\s*(?:exhibited\s+|c\.?\s*)?(\d{4})(?:\s*[-–]\s*\d{0,4})?$/i);
    if (yearMatch) {
      year = yearMatch[1];
      const beforeYear = cleaned.replace(yearMatch[0], '').trim();
      
      // Try to find comma that might separate title from artist
      const commaIdx = beforeYear.lastIndexOf(',');
      if (commaIdx > 0) {
        title = beforeYear.substring(0, commaIdx).trim();
        artist = beforeYear.substring(commaIdx + 1).trim();
      } else {
        title = beforeYear;
      }
    } else {
      title = cleaned;
    }
  }
  
  // Clean up title - remove any remaining quotes
  title = title.replace(/^["']|["']$/g, '').trim();
  
  // Clean up artist - remove leading/trailing commas and whitespace
  artist = artist.replace(/^[,\s]+|[,\s]+$/g, '').trim();
  
  // Validate: artist should look like a name (contains letters)
  if (artist && !/[a-zA-Z]{2,}/.test(artist)) {
    artist = '';
  }
  
  // Ensure year is exactly 4 digits
  if (year && !/^\d{4}$/.test(year)) {
    const digitMatch = year.match(/(\d{4})/);
    year = digitMatch ? digitMatch[1] : '';
  }
  
  return { title, artist, year };
}

/**
 * Download and validate image, save to temp directory
 */
async function downloadAndSaveImage(url, artworkId) {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        resolve(null);
        return;
      }

      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        
        // Too small = likely placeholder
        if (buffer.length < 5000) {
          resolve(null);
          return;
        }

        // Check for mostly white image
        const sample = buffer.slice(0, Math.min(buffer.length, 10000));
        let ffCount = 0;
        for (let i = 0; i < sample.length; i++) {
          if (sample[i] === 255) ffCount++;
        }
        
        const ffRatio = ffCount / sample.length;
        if (ffRatio > 0.7) {
          resolve(null);
          return;
        }

        // Save to temp directory
        const filename = `${artworkId}.jpg`;
        const filepath = path.join(IMAGES_DIR, filename);
        fs.writeFileSync(filepath, buffer);
        resolve({ filepath, filename, size: buffer.length });
      });
      response.on('error', () => resolve(null));
    }).on('error', () => resolve(null));
  });
}

/**
 * Upload images to R2
 */
async function uploadToR2(localPath, r2Path) {
  try {
    const cmd = `npx wrangler r2 object put ${R2_BUCKET}/${r2Path} --file="${localPath}" --content-type="image/jpeg"`;
    execSync(cmd, { stdio: 'pipe', cwd: path.join(__dirname, '..') });
    return `${R2_PUBLIC_URL}/${r2Path}`;
  } catch (e) {
    console.log(`      R2 upload failed: ${e.message}`);
    return null;
  }
}

/**
 * Fetch artwork details from the artwork page using og:title
 */
async function fetchArtworkDetails(page, artworkId, artworkUrl) {
  // If no valid URL, try to find it from the room page links
  if (!artworkUrl || !artworkUrl.includes('/art/artworks/')) {
    console.log(`      No valid URL for ${artworkId}, skipping...`);
    return null;
  }
  
  const fullUrl = artworkUrl.startsWith('http') 
    ? artworkUrl 
    : `https://www.tate.org.uk${artworkUrl}`;
  
  try {
    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(500);
    
    const pageData = await page.evaluate(() => {
      // Get og:title meta tag - most reliable source
      const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
      
      // Get high-res image URL
      const imgEl = document.querySelector('img[src*="media.tate.org.uk/art/images/work"]');
      let image = imgEl?.src || '';
      if (image && !image.includes('_10.')) {
        image = image.replace(/_\d+\./, '_10.');
      }
      
      return { ogTitle, image };
    });
    
    // Parse og:title outside of page.evaluate
    const parsed = parseOgTitle(pageData.ogTitle);
    if (!parsed) return null;
    
    return {
      title: parsed.title,
      artist: parsed.artist,
      year: parsed.year,
      image: pageData.image
    };
  } catch (err) {
    console.log(`    Error fetching ${fullUrl}: ${err.message}`);
    return null;
  }
}

/**
 * Scrape room page to get artwork URLs and basic info
 */
async function scrapeRoomForArtworks(page, roomUrl) {
  try {
    await page.goto(roomUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    
    // Click "Load more" buttons to get all artworks
    for (let i = 0; i < 10; i++) {
      try {
        const loadMoreBtn = await page.$('button:has-text("Load")');
        if (loadMoreBtn && await loadMoreBtn.isVisible()) {
          await loadMoreBtn.click();
          await page.waitForTimeout(800);
        } else {
          break;
        }
      } catch (e) { break; }
    }
    
    await page.waitForTimeout(500);
    
    // Get all artwork links from the page
    const artworks = await page.evaluate(() => {
      const results = [];
      
      // Find all links to artwork pages
      const links = document.querySelectorAll('a[href*="/art/artworks/"]');
      const seen = new Set();
      
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        if (!href.includes('/art/artworks/')) continue;
        
        // Extract artwork ID from URL (last part after last dash, like n00459)
        const idMatch = href.match(/([a-z]\d{5})$/i);
        if (!idMatch) continue;
        
        const artworkId = idMatch[1].toUpperCase();
        if (seen.has(artworkId)) continue;
        seen.add(artworkId);
        
        results.push({
          id: artworkId,
          url: href.startsWith('http') ? href : `https://www.tate.org.uk${href}`
        });
      }
      
      return results;
    });
    
    return artworks;
  } catch (err) {
    console.log(`  Error scraping room: ${err.message}`);
    return [];
  }
}

async function main() {
  console.log('=== Enriching Tate Britain Display Artworks ===\n');
  console.log('Target: JMW Turner, Historic & Early Modern, Modern & Contemporary, Art Around Building');
  console.log('Goal: Get artist full name, title, year (4 digits only), valid images\n');
  
  // Load existing data
  if (!fs.existsSync(DISPLAYS_FILE)) {
    console.error('tate-britain-displays.json not found!');
    process.exit(1);
  }
  
  const data = JSON.parse(fs.readFileSync(DISPLAYS_FILE, 'utf-8'));
  
  // Launch browser
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  let enriched = 0;
  let skipped = 0;
  let removed = 0;
  let uploadedToR2 = 0;
  
  // Process each display
  for (const displayKey of Object.keys(data)) {
    // Check if this is a target display
    const isTargetDisplay = TARGET_DISPLAYS.some(t => displayKey.includes(t));
    if (!isTargetDisplay) {
      console.log(`Skipping non-target display: ${displayKey}`);
      continue;
    }
    
    const display = data[displayKey];
    console.log(`\nProcessing: ${display.name || displayKey}`);
    
    if (!Array.isArray(display.rooms)) continue;
    
    for (let roomIdx = 0; roomIdx < display.rooms.length; roomIdx++) {
      const room = display.rooms[roomIdx];
      // Renumber rooms starting from 1
      room.roomNumber = `Room ${roomIdx + 1}`;
      
      console.log(`\n  ${room.roomNumber}: ${room.name}`);
      
      // Scrape the room page to get all artwork URLs (ignore existing artworks)
      if (!room.url) {
        console.log(`    No room URL, skipping`);
        continue;
      }
      
      console.log(`    Scraping room page for artwork URLs...`);
      const scrapedArtworks = await scrapeRoomForArtworks(page, room.url);
      console.log(`    Found ${scrapedArtworks.length} artworks on page`);
      
      if (scrapedArtworks.length === 0) {
        console.log(`    No artworks found, skipping`);
        continue;
      }
      
      // Replace artworks with scraped ones (fresh data)
      room.artworks = scrapedArtworks;
      
      console.log(`    Processing ${room.artworks.length} artworks...`);
      const validArtworks = [];
      
      for (const artwork of room.artworks) {
        const artworkId = artwork.id;
        if (!artworkId) {
          skipped++;
          continue;
        }
        
        console.log(`    Processing ${artworkId}...`);
        
        // Fetch artwork details from page using og:title
        const details = await fetchArtworkDetails(page, artworkId, artwork.url);
        
        if (!details) {
          console.log(`      Failed to get details, skipping`);
          skipped++;
          continue;
        }
        
        // Skip if title is empty or "Untitled" or contains "None"
        if (!details.title || 
            details.title.toLowerCase() === 'untitled' ||
            details.title.toLowerCase().includes('none')) {
          console.log(`      No valid title found, skipping`);
          skipped++;
          continue;
        }
        
        // Skip if artist is empty
        if (!details.artist || details.artist.trim() === '') {
          console.log(`      No artist found, skipping`);
          skipped++;
          continue;
        }
        
        // Use image from details or construct one
        let imageUrl = details.image;
        if (!imageUrl) {
          const prefix = artworkId.charAt(0);
          const midPart = artworkId.substring(0, 3);
          imageUrl = `https://media.tate.org.uk/art/images/work/${prefix}/${midPart}/${artworkId}_10.jpg`;
        }
        
        // Download and validate image
        const imageResult = await downloadAndSaveImage(imageUrl, artworkId);
        if (!imageResult) {
          console.log(`      Invalid/white image, skipping`);
          removed++;
          continue;
        }
        
        // Upload to R2 for stability
        const r2Path = `tate-britain/artworks/${artworkId}.jpg`;
        const r2Url = await uploadToR2(imageResult.filepath, r2Path);
        
        // Update artwork
        artwork.title = details.title;
        artwork.artist = details.artist;
        artwork.year = details.year || '';
        artwork.image = r2Url || imageUrl;
        artwork.originalImage = imageUrl;
        
        if (r2Url) {
          uploadedToR2++;
          console.log(`      ✓ ${details.artist} - "${details.title}" (${details.year || 'n/a'}) [R2]`);
        } else {
          console.log(`      ✓ ${details.artist} - "${details.title}" (${details.year || 'n/a'})`);
        }
        
        validArtworks.push(artwork);
        enriched++;
        
        // Small delay to be nice to the server
        await new Promise(r => setTimeout(r, 400));
      }
      
      // Replace artworks with only valid ones
      room.artworks = validArtworks;
      room.artworkCount = validArtworks.length;
    }
  }
  
  await browser.close();
  
  // Save updated data
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
  
  console.log(`\n=== Done! ===`);
  console.log(`Enriched: ${enriched}`);
  console.log(`Uploaded to R2: ${uploadedToR2}`);
  console.log(`Skipped (no title/artist): ${skipped}`);
  console.log(`Removed (invalid image): ${removed}`);
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log(`Images saved to: ${IMAGES_DIR}`);
}

main().catch(console.error);
