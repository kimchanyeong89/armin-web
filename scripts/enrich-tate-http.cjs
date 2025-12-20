/**
 * Tate Britain Display Artworks Enrichment - HTTP-only version
 * - Uses HTTP requests only (no browser)
 * - Fetches artwork details from og:title
 * - Validates images
 * - Uploads to R2
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const DISPLAYS_FILE = path.join(__dirname, '../public/data/tate-britain-displays.json');
const OUTPUT_FILE = path.join(__dirname, '../public/data/tate-britain-displays.json');
const IMAGES_DIR = path.join(__dirname, '../temp-tate-display-images');
const R2_BUCKET = 'armin-web';
const R2_PUBLIC_URL = 'https://pub-0e9cd559fbf4456c9304536a417d9f86.r2.dev';

const TARGET_DISPLAYS = ['jmw-turner', 'historic-early-modern', 'modern-contemporary', 'art-around-building'];

if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

/**
 * Fetch HTML from URL
 */
function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        fetchHtml(response.headers.location).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => resolve(data));
      response.on('error', reject);
    });
    
    request.on('error', reject);
    request.setTimeout(15000, () => {
      request.destroy();
      reject(new Error('Timeout'));
    });
  });
}

/**
 * Parse og:title
 */
function parseOgTitle(ogTitle) {
  if (!ogTitle) return null;
  let cleaned = ogTitle.replace(/\s*\|\s*Tate\s*$/i, '').trim();
  
  let title = '', artist = '', year = '';
  
  // Replace all fancy quotes with regular quotes first
  cleaned = cleaned.replace(/[\u2018\u2019]/g, "'");  // ' ' -> '
  cleaned = cleaned.replace(/[\u201C\u201D]/g, '"');  // " " -> "
  
  // Find the pattern: 'Title', Artist, Year
  // The closing quote is followed by ', '
  // So we look for ', at the end of title
  const titleEndPattern = /',\s+/;
  const titleEndMatch = cleaned.match(titleEndPattern);
  
  if (cleaned.startsWith("'") && titleEndMatch) {
    // Find the last occurrence of ', before the artist name
    // Artist names don't contain commas usually
    let lastCommaQuote = -1;
    let searchFrom = 1;
    
    while (true) {
      const pos = cleaned.indexOf("', ", searchFrom);
      if (pos === -1) break;
      
      // Check if what follows looks like an artist name (capital letter)
      const afterPos = pos + 3;
      if (afterPos < cleaned.length && /[A-Z]/.test(cleaned.charAt(afterPos))) {
        lastCommaQuote = pos;
      }
      searchFrom = pos + 1;
    }
    
    if (lastCommaQuote > 0) {
      title = cleaned.substring(1, lastCommaQuote);
      let remainder = cleaned.substring(lastCommaQuote + 3).trim();
      
      const yearPatterns = [
        /,?\s*\??\s*exhibited\s+(\d{4})(?:\s*[-–]?\s*\d{0,4})?$/i,
        /,?\s*\??\s*c\.?\s*(\d{4})(?:\s*[-–]?\s*\d{0,4})?$/i,
        /,?\s*(\d{4})(?:\s*[-–]?\s*\d{0,4})?$/i
      ];
      
      for (const pattern of yearPatterns) {
        const match = remainder.match(pattern);
        if (match) {
          year = match[1];
          remainder = remainder.replace(match[0], '').trim();
          break;
        }
      }
      artist = remainder.replace(/,\s*$/, '').trim();
      
      // Clean artist name - remove date suffixes like ", 1828" or ", 1828, reworked"
      artist = artist.replace(/,\s*\d{4}.*$/i, '').trim();
    }
  }
  
  // Validate
  if (artist && !/[a-zA-Z]{2,}/.test(artist)) artist = '';
  if (year && !/^\d{4}$/.test(year)) {
    const m = year.match(/(\d{4})/);
    year = m ? m[1] : '';
  }
  
  return { title, artist, year };
}

/**
 * Scrape room page for artwork links
 */
async function scrapeRoomPage(roomUrl) {
  try {
    const html = await fetchHtml(roomUrl);
    const artworks = [];
    const seen = new Set();
    
    // Find all artwork links
    const regex = /href="(\/art\/artworks\/[^"]+)"/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const href = match[1];
      const idMatch = href.match(/([a-z]\d{5})$/i);
      if (idMatch && !seen.has(idMatch[1].toUpperCase())) {
        seen.add(idMatch[1].toUpperCase());
        artworks.push({
          id: idMatch[1].toUpperCase(),
          url: `https://www.tate.org.uk${href}`
        });
      }
    }
    
    return artworks;
  } catch (e) {
    console.log(`  Error fetching room: ${e.message}`);
    return [];
  }
}

/**
 * Fetch artwork details
 */
async function fetchArtworkDetails(artworkUrl, artworkId) {
  try {
    const html = await fetchHtml(artworkUrl);
    
    // Get og:title
    const ogMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
    if (!ogMatch) return null;
    
    const parsed = parseOgTitle(ogMatch[1]);
    if (!parsed || !parsed.title || !parsed.artist) return null;
    
    // Construct image URL from artwork ID
    // Format: https://media.tate.org.uk/art/images/work/N/N00/N00459_10.jpg
    const prefix = artworkId.charAt(0).toUpperCase();
    const mid = artworkId.substring(0, 3).toUpperCase();
    const image = `https://media.tate.org.uk/art/images/work/${prefix}/${mid}/${artworkId.toUpperCase()}_10.jpg`;
    
    return { ...parsed, image };
  } catch (e) {
    return null;
  }
}

/**
 * Download and validate image
 */
function downloadImage(url, artworkId) {
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
        
        if (ffCount / sample.length > 0.7) {
          resolve(null);
          return;
        }

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
 * Upload to R2
 */
function uploadToR2(localPath, r2Path) {
  try {
    const cmd = `npx wrangler r2 object put ${R2_BUCKET}/${r2Path} --file="${localPath}" --content-type="image/jpeg"`;
    execSync(cmd, { stdio: 'pipe', cwd: path.join(__dirname, '..') });
    return `${R2_PUBLIC_URL}/${r2Path}`;
  } catch (e) {
    return null;
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== Tate Britain Display Artworks Enrichment (HTTP) ===\n');
  
  const data = JSON.parse(fs.readFileSync(DISPLAYS_FILE, 'utf-8'));
  
  let enriched = 0, skipped = 0, removed = 0, uploaded = 0;
  
  for (const displayKey of Object.keys(data)) {
    const isTarget = TARGET_DISPLAYS.some(t => displayKey.includes(t));
    if (!isTarget) {
      console.log(`Skipping: ${displayKey}`);
      continue;
    }
    
    const display = data[displayKey];
    console.log(`\nProcessing: ${display.name}`);
    
    if (!Array.isArray(display.rooms)) continue;
    
    for (let roomIdx = 0; roomIdx < display.rooms.length; roomIdx++) {
      const room = display.rooms[roomIdx];
      room.roomNumber = `Room ${roomIdx + 1}`;
      
      console.log(`\n  ${room.roomNumber}: ${room.name}`);
      
      if (!room.url) {
        console.log(`    No URL, skipping`);
        continue;
      }
      
      // Check if room already has ALL artworks enriched (every artwork must have r2 URL)
      const hasEnrichedArtworks = room.artworks && room.artworks.length > 0 && 
        room.artworks.every(a => a.title && a.artist && a.image && a.image.includes('r2.dev'));
      
      if (hasEnrichedArtworks) {
        console.log(`    Already enriched (${room.artworks.length} artworks), skipping`);
        continue;
      }
      
      // Scrape room page for artwork URLs
      console.log(`    Scraping room page...`);
      const scrapedArtworks = await scrapeRoomPage(room.url);
      console.log(`    Found ${scrapedArtworks.length} artworks`);
      
      if (scrapedArtworks.length === 0) continue;
      
      const validArtworks = [];
      
      for (const artwork of scrapedArtworks) {
        console.log(`    ${artwork.id}...`);
        
        // Fetch details
        const details = await fetchArtworkDetails(artwork.url, artwork.id);
        await sleep(300);
        
        if (!details || !details.title || !details.artist) {
          console.log(`      Skip: no title/artist`);
          skipped++;
          continue;
        }
        
        // Skip Untitled
        if (details.title.toLowerCase() === 'untitled') {
          console.log(`      Skip: Untitled`);
          skipped++;
          continue;
        }
        
        // Download image
        const imgResult = await downloadImage(details.image, artwork.id);
        if (!imgResult) {
          console.log(`      Skip: invalid image`);
          removed++;
          continue;
        }
        
        // Upload to R2
        const r2Path = `tate-britain/artworks/${artwork.id}.jpg`;
        const r2Url = uploadToR2(imgResult.filepath, r2Path);
        
        artwork.title = details.title;
        artwork.artist = details.artist;
        artwork.year = details.year || '';
        artwork.image = r2Url || details.image;
        artwork.originalImage = details.image;
        
        if (r2Url) uploaded++;
        
        console.log(`      ✓ ${details.artist} - "${details.title}" (${details.year || 'n/a'})`);
        validArtworks.push(artwork);
        enriched++;
      }
      
      room.artworks = validArtworks;
      room.artworkCount = validArtworks.length;
      
      // Save after each room to prevent data loss
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
      console.log(`    Saved (${validArtworks.length} artworks)`);
    }
  }
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
  
  console.log('\n=== Done ===');
  console.log(`Enriched: ${enriched}`);
  console.log(`Uploaded to R2: ${uploaded}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Removed (bad image): ${removed}`);
  console.log(`Output: ${OUTPUT_FILE}`);
}

main().catch(console.error);
