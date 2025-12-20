/**
 * Scrape cover images from each Tate display page
 * v4: Find the main hero image by position and size
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');
const sharp = require('sharp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const DATA_PATH = path.join(__dirname, '../public/data/tate-modern.json');
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = 'armin-gallery-images';
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY }
});

async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : require('http');
    const makeRequest = (reqUrl, redirects = 0) => {
      if (redirects > 5) return reject(new Error('Too many redirects'));
      protocol.get(reqUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return makeRequest(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    };
    makeRequest(url);
  });
}

async function uploadToR2(buffer, key) {
  const webp = await sharp(buffer).resize(800, 800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: webp, ContentType: 'image/webp' }));
  return `${R2_PUBLIC_URL}/${key}`;
}

// Map display URL paths to our IDs
const hrefToId = {
  '/visit/tate-modern/display/artist-and-society': 'display-artist-and-society',
  '/visit/tate-modern/display/in-the-studio': 'display-in-the-studio',
  '/visit/tate-modern/display/materials-and-objects': 'display-materials-and-objects',
  '/visit/tate-modern/display/media-networks': 'display-media-networks',
  '/visit/tate-modern/display/performer-and-participant': 'display-performer-and-participant',
  '/visit/tate-modern/display/tanks': 'display-tanks',
  '/visit/tate-modern/display/artist-rooms-richard-long': 'display-artist-rooms-richard-long'
};

async function main() {
  console.log('=== Scraping Tate Modern display covers (v4) ===\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ 
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  
  // Visit each display page individually to get the hero image
  for (const [href, displayId] of Object.entries(hrefToId)) {
    const display = data.items.find(it => it.id === displayId);
    if (!display) {
      console.log(`Display not found: ${displayId}`);
      continue;
    }
    
    const url = `https://www.tate.org.uk${href}`;
    console.log(`\n=== ${display.title} ===`);
    console.log(`URL: ${url}`);
    
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      
      // Accept cookies if present
      try {
        const acceptBtn = await page.$('button:has-text("Accept")');
        if (acceptBtn) {
          await acceptBtn.click();
          await page.waitForTimeout(500);
        }
      } catch {}
      
      // Wait for images to load
      await page.waitForTimeout(3000);
      
      // Find the main hero image - the first large image below the header (top > 100)
      const heroImg = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        
        for (const img of imgs) {
          const rect = img.getBoundingClientRect();
          const src = img.src || '';
          
          // Skip if no src or placeholder
          if (!src || src.includes('placeholder')) continue;
          
          // Skip header/nav images (top = 0 or negative)
          if (rect.top <= 100) continue;
          
          // Skip small images
          if (img.width < 400 || img.height < 300) continue;
          
          // Skip known non-content images
          if (src.includes('logo') || src.includes('icon')) continue;
          if (src.includes('tate_britain_exterior')) continue;
          if (src.includes('tate_modern_1')) continue;
          if (src.includes('Tate_Liverpool')) continue;
          if (src.includes('tate_st_ives')) continue;
          
          // This should be the hero image
          return {
            src: src,
            width: img.width,
            height: img.height,
            top: rect.top
          };
        }
        
        return null;
      });
      
      if (!heroImg) {
        console.log('  No hero image found');
        continue;
      }
      
      console.log(`  Found: ${heroImg.src.substring(0, 80)}...`);
      console.log(`  Size: ${heroImg.width}x${heroImg.height}, top: ${heroImg.top}`);
      
      // Get higher resolution version
      let highResUrl = heroImg.src
        .replace(/\.width-\d+/, '.width-1200')
        .replace(/\.max-\d+x\d+/, '.max-1200x1200');
      
      const buf = await downloadImage(highResUrl);
      const key = `tate-modern/${displayId}/cover.webp`;
      const r2Url = await uploadToR2(buf, key);
      
      display.image = r2Url;
      display.coverImage = r2Url;
      console.log(`  Uploaded: ${r2Url}`);
      
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }
  
  await browser.close();
  
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  console.log('\n=== Saved to tate-modern.json ===');
}

main().catch(console.error);
