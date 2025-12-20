/**
 * Scrape Tate Modern Display exhibitions with CORRECT year parsing
 * Year comes from page title: "'Title', Artist, Year | Tate"
 */

const { chromium } = require('playwright');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const https = require('https');
const sharp = require('sharp');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const DATA_PATH = path.join(__dirname, '../public/data/tate-modern.json');

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY;

console.log('R2 configured:', !!R2_ACCOUNT_ID, !!R2_ACCESS_KEY, !!R2_SECRET_KEY);
const R2_BUCKET = 'armin-gallery-images';
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY }
});

async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const makeRequest = (reqUrl, redirectCount = 0) => {
      if (redirectCount > 5) return reject(new Error('Too many redirects'));
      https.get(reqUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return makeRequest(res.headers.location, redirectCount + 1);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    };
    makeRequest(url);
  });
}

async function uploadToR2(buffer, key) {
  const webp = await sharp(buffer).resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: webp,
    ContentType: 'image/webp'
  }));
  return `${R2_PUBLIC_URL}/${key}`;
}

async function fetchArtworkYear(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(300);
    
    // Get page title: "'European Mask', Pacita Abad, 1990 | Tate"
    const title = await page.title();
    
    // Pattern: ..., YEAR | Tate
    // Matches: 1990, c.1939-40, c.1985–6
    const match = title.match(/,\s*(c\.?\s*\d{4}(?:[-–]\d{2,4})?|\d{4})\s*\|\s*Tate/i);
    if (match) {
      return match[1].replace(/\s+/g, '');
    }
    
    return '';
  } catch (e) {
    return '';
  }
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  // Accept cookies
  await page.goto('https://www.tate.org.uk', { waitUntil: 'domcontentloaded' });
  const acceptBtn = await page.$('button:has-text("Accept")');
  if (acceptBtn) await acceptBtn.click();
  await page.waitForTimeout(1000);
  
  // Get display list
  await page.goto('https://www.tate.org.uk/visit/tate-modern/display', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  const displays = await page.$$eval('a[href*="/display/"]', links => {
    const seen = new Set();
    return links.map(a => ({
      title: a.textContent.trim(),
      url: a.href
    })).filter(d => {
      if (seen.has(d.url) || !d.title || d.url.includes('/display/archive')) return false;
      seen.add(d.url);
      return true;
    });
  });
  
  console.log(`Found ${displays.length} displays\n`);
  
  for (const display of displays) {
    const id = 'display-' + display.url.split('/display/')[1]?.split('/')[0]?.split('?')[0] || '';
    if (!id || id === 'display-') continue;
    
    // Skip if already exists
    if (data.items.find(i => i.id === id)) {
      console.log(`[SKIP] ${display.title} (already exists)`);
      continue;
    }
    
    console.log(`\n=== ${display.title} ===`);
    console.log(`  ID: ${id}`);
    
    try {
      await page.goto(display.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(1500);
    } catch (displayNavErr) {
      console.log(`  Display page navigation error, skipping this display`);
      continue;
    }
    
    // Get cover image - main hero image from display page
    let coverUrl = '';
    // Try hero image with media.tate.org.uk first (high quality)
    let coverImg = await page.$('img[src*="media.tate.org.uk"]');
    if (!coverImg) {
      // Fallback to any tate image
      coverImg = await page.$('img[src*="tate.org.uk"]');
    }
    if (coverImg) {
      coverUrl = await coverImg.getAttribute('src');
      if (coverUrl && !coverUrl.startsWith('http')) {
        coverUrl = 'https://www.tate.org.uk' + coverUrl;
      }
      // Get higher resolution
      coverUrl = coverUrl.replace('.max-500x500', '.max-1200x1200')
                         .replace('.width-340', '.width-1200')
                         .replace('.width-600', '.width-1200');
    }
    
    // Get rooms
    const roomLinks = await page.$$eval('a[href*="/display/"][href*="/"]', (links, displayUrl) => {
      const baseUrl = displayUrl.replace(/\/$/, '');
      return links.map(a => ({
        name: a.textContent.trim(),
        url: a.href
      })).filter(r => r.url.startsWith(baseUrl + '/') && r.url !== baseUrl && r.name);
    }, display.url);
    
    // Dedupe rooms
    const rooms = [];
    const seenRooms = new Set();
    for (const r of roomLinks) {
      if (!seenRooms.has(r.url)) {
        seenRooms.add(r.url);
        rooms.push({ name: r.name, url: r.url, artworks: [] });
      }
    }
    
    console.log(`  Found ${rooms.length} rooms`);
    
    // Scrape each room
    for (const room of rooms) {
      try {
        await page.goto(room.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(1000);
      } catch (roomErr) {
        console.log(`    Room: ${room.name} - navigation error, skipping`);
        continue;
      }
      
      const artworkLinks = await page.$$eval('a[href*="/art/artworks/"]', links => {
        const seen = new Set();
        return links.map(a => {
          const img = a.querySelector('img');
          return {
            url: a.href,
            image: img?.src || ''
          };
        }).filter(art => {
          if (seen.has(art.url)) return false;
          seen.add(art.url);
          return true;
        });
      });
      
      console.log(`    Room: ${room.name} (${artworkLinks.length} artworks)`);
      
      for (const art of artworkLinks) {
        const artId = art.url.match(/-([a-z]\d+)$/i)?.[1]?.toUpperCase() || '';
        if (!artId) continue;
        
        // Fetch artwork page to get title, artist, year from page title
        let pageTitle = '';
        try {
          await page.goto(art.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await page.waitForTimeout(300);
          pageTitle = await page.title();
        } catch (navErr) {
          console.log(`      [${artId}] - navigation error, skipping`);
          continue;
        }
        
        // Pattern: "'Title', Artist, Year | Tate" or "Title, Artist, Year | Tate"
        const match = pageTitle.match(/^['']?([^']+)['']?,\s*([^,]+),\s*(c\.?\d{4}(?:[-–]\d{2,4})?|\d{4})\s*\|\s*Tate/i);
        
        let title = '', artist = '', year = '';
        if (match) {
          title = match[1].trim();
          artist = match[2].trim();
          year = match[3].trim();
        } else {
          // Fallback: try simpler pattern
          const simple = pageTitle.match(/^([^|]+)\|\s*Tate/);
          if (simple) {
            const parts = simple[1].split(',').map(s => s.trim());
            if (parts.length >= 2) {
              title = parts[0].replace(/^['']|['']$/g, '');
              artist = parts[1];
              if (parts[2]?.match(/\d{4}/)) year = parts[2];
            }
          }
        }
        
        // Get high-res image
        let imageUrl = '';
        const tateImg = await page.$('img[src*="tate.org.uk/art/images"]');
        if (tateImg) {
          imageUrl = await tateImg.getAttribute('src');
          // Get higher res version
          imageUrl = imageUrl.replace(/_\d+\./, '_10.');
        }
        
        if (!imageUrl && art.image) {
          imageUrl = art.image.replace(/_\d+\./, '_10.');
        }
        
        // Upload to R2
        let r2Url = '';
        if (imageUrl) {
          try {
            const buf = await downloadImage(imageUrl);
            const key = `tate-modern/${id}/${artId}.webp`;
            r2Url = await uploadToR2(buf, key);
            console.log(`      [${artId}] ${title || 'Untitled'} (${year || 'n.d.'}) -> R2`);
          } catch (e) {
            console.log(`      [${artId}] ${title || 'Untitled'} - image error: ${e.message}`);
          }
        }
        
        // Only save artwork if it has an image
        if (r2Url) {
          room.artworks.push({
            id: artId,
            title: title || '',
            artist: artist || '',
            year: year || '',
            image: r2Url,
            url: art.url
          });
        } else {
          console.log(`      [${artId}] Skipped - no image available`);
        }
        
        await page.waitForTimeout(100);
      }
    }
    
    // Upload cover image
    let coverR2 = '';
    if (coverUrl) {
      try {
        const buf = await downloadImage(coverUrl);
        const key = `tate-modern/${id}/cover.webp`;
        coverR2 = await uploadToR2(buf, key);
        console.log(`  Cover uploaded`);
      } catch (e) {
        console.log(`  Cover error: ${e.message}`);
      }
    }
    
    // Add to data
    const totalArtworks = rooms.reduce((sum, r) => sum + r.artworks.length, 0);
    data.items.push({
      id,
      title: display.title,
      url: display.url,
      image: coverR2,
      startDate: '',
      endDate: '',
      dateRange: 'Ongoing',
      rooms
    });
    
    console.log(`  Total: ${totalArtworks} artworks in ${rooms.length} rooms`);
    
    // Save after each display
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
    console.log(`  [SAVED]`);
  }
  
  await browser.close();
  console.log('\n=== Done! ===');
}

main().catch(console.error);
