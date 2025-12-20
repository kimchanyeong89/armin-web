/**
 * Tate Modern Display Scraper v1
 * Scrapes all Display exhibitions (ongoing collection displays) at Tate Modern
 * - Scrapes room list from each display
 * - Scrapes artworks from each room page
 * - Downloads and uploads images to R2
 * - Updates tate-modern.json
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// Load env
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

// Cloudflare R2 Configuration
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = 'armin-gallery-images';
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error('Missing R2 credentials in .env.local');
  process.exit(1);
}

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// Tate Modern Display exhibitions
const DISPLAYS = [
  {
    id: 'display-artist-and-society',
    name: 'Artist and Society',
    description: 'Explore artworks from Tate\'s collection that respond to their social and political context',
    location: 'Natalie Bell Building Level 2 West',
    baseUrl: 'https://www.tate.org.uk/visit/tate-modern/display/artist-and-society'
  },
  {
    id: 'display-in-the-studio',
    name: 'In the Studio',
    description: 'Investigate the processes artists use to make artworks, and how our responses are integral to the piece',
    location: 'Natalie Bell Building Level 2 East',
    baseUrl: 'https://www.tate.org.uk/visit/tate-modern/display/in-the-studio'
  },
  {
    id: 'display-materials-and-objects',
    name: 'Materials and Objects',
    description: 'Discover artists from Tate\'s collection who have embraced new and unusual materials and methods',
    location: 'Natalie Bell Building Level 4 West',
    baseUrl: 'https://www.tate.org.uk/visit/tate-modern/display/materials-and-objects'
  },
  {
    id: 'display-media-networks',
    name: 'Media Networks',
    description: 'See how artists in Tate\'s collection have responded to the impact of mass media',
    location: 'Natalie Bell Building Level 4 East',
    baseUrl: 'https://www.tate.org.uk/visit/tate-modern/display/media-networks'
  },
  {
    id: 'display-performer-and-participant',
    name: 'Performer and Participant',
    description: 'Discover how artists working between the 1960s and the 1990s opened up new spaces for participation',
    location: 'Blavatnik Building Level 3',
    baseUrl: 'https://www.tate.org.uk/visit/tate-modern/display/performer-and-participant'
  },
  {
    id: 'display-the-tanks',
    name: 'The Tanks',
    description: 'Experience live art, performance, film and video art in these gallery spaces',
    location: 'Level 0',
    baseUrl: 'https://www.tate.org.uk/visit/tate-modern/display/tanks'
  },
  {
    id: 'display-artist-rooms-richard-long',
    name: 'ARTIST ROOMS: Richard Long',
    description: 'Through the simple creative act of moving through the landscape, Richard Long extends the possibilities of sculpture',
    location: 'Natalie Bell Building Level 4 East',
    baseUrl: 'https://www.tate.org.uk/visit/tate-modern/display/artist-rooms-richard-long'
  }
];

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const IMAGES_DIR = path.join(__dirname, '../temp-tate-modern-display-images');
const TATE_MODERN_FILE = path.join(OUTPUT_DIR, 'tate-modern.json');

// Create images directory if needed
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

/**
 * Upload image to R2 using AWS SDK v3
 */
async function uploadToR2(localPath, r2Key) {
  const webpBuffer = await sharp(localPath)
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
  
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: r2Key,
    Body: webpBuffer,
    ContentType: 'image/webp',
  });
  
  await s3Client.send(command);
  return `${R2_PUBLIC_URL}/${r2Key}`;
}

/**
 * Download image from URL
 */
async function downloadImage(url, localPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode !== 200) {
        resolve(null);
        return;
      }
      
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (buffer.length < 2000) {
          resolve(null);
          return;
        }
        fs.writeFileSync(localPath, buffer);
        resolve(localPath);
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Scrape rooms list from a display page
 */
async function scrapeRoomsList(page, displayUrl) {
  console.log(`  Navigating to: ${displayUrl}`);
  
  try {
    await page.goto(displayUrl, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    console.log(`  Warning: Page load timeout, continuing...`);
  }
  
  await page.waitForTimeout(2000);
  
  // Click "Load all rooms" button if exists
  try {
    const loadAllBtn = await page.$('button:has-text("Load all")');
    if (loadAllBtn && await loadAllBtn.isVisible()) {
      console.log('  Clicking Load all rooms...');
      await loadAllBtn.click();
      await page.waitForTimeout(2000);
    }
  } catch (e) {
    console.log(`  No Load all button or error: ${e.message}`);
  }
  
  // Debug: take screenshot
  // await page.screenshot({ path: `debug-${Date.now()}.png` });
  
  // Extract room links - Tate structure has cards with "Go to room" links
  const rooms = await page.evaluate((baseUrl) => {
    const results = [];
    
    // Look for all links that contain "Go to room" text or link to room pages
    const allLinks = document.querySelectorAll('a');
    
    for (const link of allLinks) {
      const href = link.href || '';
      const text = (link.textContent || '').trim();
      
      // Room links have pattern like /display/artist-and-society/pacita-abad
      const roomMatch = href.match(/\/display\/[^\/]+\/([^\/\?#]+)/);
      if (!roomMatch) continue;
      
      const roomSlug = roomMatch[1];
      
      // Skip if it's the base display URL
      if (href === baseUrl || href === baseUrl + '/') continue;
      
      // Get room name - it's usually in a nearby heading or the link text itself
      let roomName = '';
      
      // Try to find parent card element with room name
      let container = link.parentElement;
      for (let i = 0; i < 5 && container; i++) {
        const heading = container.querySelector('h2, h3, h4, [class*="heading"], [class*="title"]');
        if (heading) {
          roomName = heading.textContent?.trim() || '';
          break;
        }
        container = container.parentElement;
      }
      
      // Fallback: use link text (clean it up)
      if (!roomName) {
        roomName = text.replace(/Go to room/gi, '').replace(/\s+/g, ' ').trim();
      }
      
      // Fallback: convert slug to name
      if (!roomName) {
        roomName = roomSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
      
      // Avoid duplicates
      if (roomName && !results.find(r => r.url === href)) {
        results.push({
          name: roomName.substring(0, 100),
          url: href,
          slug: roomSlug
        });
      }
    }
    
    return results;
  }, displayUrl);
  
  console.log(`  Found ${rooms.length} rooms`);
  if (rooms.length > 0) {
    console.log(`  First room: ${rooms[0].name} - ${rooms[0].url}`);
  }
  return rooms;
}

/**
 * Scrape artworks from a room page
 */
async function scrapeRoomArtworks(page, roomUrl, roomName) {
  console.log(`    Scraping room: ${roomName}`);
  
  try {
    await page.goto(roomUrl, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    console.log(`    Warning: Page load timeout, continuing...`);
  }
  
  await page.waitForTimeout(1500);
  
  // Click "Load more" buttons
  for (let i = 0; i < 10; i++) {
    try {
      const loadMoreBtn = await page.$('button:has-text("Load")');
      if (loadMoreBtn && await loadMoreBtn.isVisible()) {
        await loadMoreBtn.click();
        await page.waitForTimeout(1000);
      } else break;
    } catch (e) { break; }
  }
  
  // Extract artworks
  const artworks = await page.evaluate(() => {
    const results = [];
    
    // Find all artwork images
    const images = document.querySelectorAll('img[src*="media.tate.org.uk/art/images"]');
    
    for (const img of images) {
      const imageSrc = img.src || '';
      const idMatch = imageSrc.match(/\/([A-Z]\d{5})_/i) || imageSrc.match(/\/([NTPDL]\d+)_/i);
      const artworkId = idMatch ? idMatch[1].toUpperCase() : '';
      
      if (!artworkId) continue;
      
      // Find parent container for text info
      let container = img.closest('figure, [class*="artwork"], [class*="Card"]') || img.parentElement;
      for (let i = 0; i < 5 && container && !container.querySelector('a[href*="/art/artworks/"]'); i++) {
        container = container.parentElement;
      }
      
      const link = container?.querySelector('a[href*="/art/artworks/"]');
      const textContent = container?.textContent || '';
      
      results.push({
        id: artworkId,
        image: imageSrc,
        url: link?.href || `https://www.tate.org.uk/art/artworks/${artworkId.toLowerCase()}`,
        textContent: textContent.substring(0, 500)
      });
    }
    
    // Remove duplicates
    const seen = new Set();
    return results.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  });
  
  console.log(`    Found ${artworks.length} artworks`);
  return artworks;
}

/**
 * Fetch artwork details from artwork page
 */
async function fetchArtworkDetails(page, artworkUrl) {
  try {
    await page.goto(artworkUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(500);
    
    const data = await page.evaluate(() => {
      // Title from h1
      const titleEl = document.querySelector('h1');
      const title = titleEl?.textContent?.trim() || '';
      
      // Get all text content
      const bodyText = document.body.textContent || '';
      
      // Find artist name - look for heading or caption
      const artistEl = document.querySelector('[class*="artist"]') || document.querySelector('h2');
      let artist = artistEl?.textContent?.trim() || '';
      
      // If no artist found, try More by pattern
      if (!artist) {
        const moreByMatch = bodyText.match(/More by ([^\n,]+)/);
        if (moreByMatch) artist = moreByMatch[1].trim();
      }
      
      // Year - find 4-digit year patterns
      const yearPatterns = [
        /(?:made|dated|painted|created|exhibited)\s+(\d{4})/i,
        /(\d{4})(?:\s*[-–]\s*\d{2,4})?/,
        /c\.?\s*(\d{4})/i
      ];
      
      let year = '';
      for (const pattern of yearPatterns) {
        const match = bodyText.match(pattern);
        if (match && match[1]) {
          const y = parseInt(match[1]);
          if (y >= 1400 && y <= 2025) {
            year = match[1];
            break;
          }
        }
      }
      
      return { title, artist, year };
    });
    
    return data;
  } catch (e) {
    console.log(`    Error fetching details: ${e.message}`);
    return null;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('=== Tate Modern Display Exhibitions Scraper ===\n');
  
  // Load existing data
  let tateModernData = { items: [] };
  try {
    tateModernData = JSON.parse(fs.readFileSync(TATE_MODERN_FILE, 'utf-8'));
  } catch (e) {
    console.log('No existing tate-modern.json, starting fresh');
  }
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  // Accept cookies to dismiss cookie banner
  console.log('Accepting cookies...');
  try {
    await page.goto('https://www.tate.org.uk', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    
    // Click "I Accept" button
    const acceptBtn = await page.$('button:has-text("I Accept"), button:has-text("Accept")');
    if (acceptBtn) {
      await acceptBtn.click({ force: true });
      console.log('  Cookie banner dismissed');
      await page.waitForTimeout(1000);
    }
  } catch (e) {
    console.log(`  Cookie accept failed: ${e.message}`);
  }
  
  const allDisplays = [];
  
  for (const display of DISPLAYS) {
    console.log(`\n=== Processing: ${display.name} ===`);
    
    // Check if already exists
    const existing = tateModernData.items.find(it => it.id === display.id);
    if (existing && existing.rooms && existing.rooms.length > 0) {
      console.log(`  Already exists with ${existing.rooms.length} rooms, skipping...`);
      allDisplays.push(existing);
      continue;
    }
    
    // Scrape room list
    const rooms = await scrapeRoomsList(page, display.baseUrl);
    
    const displayData = {
      id: display.id,
      title: display.name,
      name: display.name,
      description: display.description,
      location: display.location,
      url: display.baseUrl,
      dateRange: 'Ongoing',
      rooms: []
    };
    
    // For each room, scrape artworks
    for (const room of rooms) {
      const artworks = await scrapeRoomArtworks(page, room.url, room.name);
      
      const enrichedArtworks = [];
      
      // Fetch details for first few artworks (to avoid being blocked)
      for (let i = 0; i < Math.min(artworks.length, 10); i++) {
        const artwork = artworks[i];
        console.log(`      Fetching details for ${artwork.id}...`);
        
        const details = await fetchArtworkDetails(page, artwork.url);
        
        // Download and upload image
        let r2Url = null;
        try {
          const localPath = path.join(IMAGES_DIR, `${artwork.id}.jpg`);
          const downloaded = await downloadImage(artwork.image, localPath);
          if (downloaded) {
            const r2Key = `tate-modern/${display.id}/${artwork.id}.webp`;
            r2Url = await uploadToR2(localPath, r2Key);
            console.log(`        Uploaded: ${r2Url}`);
          }
        } catch (e) {
          console.log(`        Image upload failed: ${e.message}`);
        }
        
        enrichedArtworks.push({
          id: artwork.id,
          title: details?.title || '',
          artist: details?.artist || '',
          year: details?.year || '',
          image: r2Url || artwork.image,
          url: artwork.url
        });
        
        await page.waitForTimeout(300);
      }
      
      // Add remaining artworks without detail fetch
      for (let i = 10; i < artworks.length; i++) {
        const artwork = artworks[i];
        
        // Still try to upload image
        let r2Url = null;
        try {
          const localPath = path.join(IMAGES_DIR, `${artwork.id}.jpg`);
          const downloaded = await downloadImage(artwork.image, localPath);
          if (downloaded) {
            const r2Key = `tate-modern/${display.id}/${artwork.id}.webp`;
            r2Url = await uploadToR2(localPath, r2Key);
          }
        } catch (e) {}
        
        enrichedArtworks.push({
          id: artwork.id,
          image: r2Url || artwork.image,
          url: artwork.url
        });
      }
      
      displayData.rooms.push({
        name: room.name,
        url: room.url,
        artworks: enrichedArtworks
      });
    }
    
    // Get cover image from first room's first artwork
    if (displayData.rooms.length > 0 && displayData.rooms[0].artworks.length > 0) {
      displayData.coverImage = displayData.rooms[0].artworks[0].image;
    }
    
    allDisplays.push(displayData);
    
    // Save progress after each display
    const updatedItems = tateModernData.items.filter(it => !it.id?.startsWith('display-'));
    tateModernData.items = [...updatedItems, ...allDisplays];
    fs.writeFileSync(TATE_MODERN_FILE, JSON.stringify(tateModernData, null, 2));
    console.log(`  Saved progress to ${TATE_MODERN_FILE}`);
  }
  
  await browser.close();
  
  // Final save
  console.log('\n=== Final Summary ===');
  for (const display of allDisplays) {
    const artworkCount = display.rooms?.reduce((sum, r) => sum + (r.artworks?.length || 0), 0) || 0;
    console.log(`${display.title}: ${display.rooms?.length || 0} rooms, ${artworkCount} artworks`);
  }
  
  console.log('\nDone!');
}

main().catch(console.error);
