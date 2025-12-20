/**
 * Scrape cover images directly from Tate what's on page
 * v2: Wait for lazy-loaded images to load
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
  console.log('=== Scraping Tate Modern display covers (v2) ===\n');
  
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
      await page.waitForTimeout(2000);
      
      // Scroll down to trigger lazy loading
      await page.evaluate(() => window.scrollTo(0, 500));
      await page.waitForTimeout(1000);
      
      // Find the main hero image - looking for images with tate.org.uk/aztate or art/images
      const imgSrc = await page.evaluate(() => {
        // Look for the main hero image in the page
        const imgs = Array.from(document.querySelectorAll('img'));
        
        for (const img of imgs) {
          const src = img.src || img.getAttribute('data-src') || '';
          // Skip placeholders and small icons
          if (src.includes('placeholder')) continue;
          if (src.includes('logo')) continue;
          if (src.includes('icon')) continue;
          if (img.width < 200 && img.height < 200) continue;
          
          // Look for Tate media images (gallery photos or artwork images)
          if (src.includes('media.tate.org.uk') || src.includes('aztate-prd')) {
            return src;
          }
        }
        
        // Fallback: get first large image
        for (const img of imgs) {
          const src = img.src || '';
          if (src.includes('placeholder')) continue;
          if (img.width >= 300 || img.height >= 200) {
            return src;
          }
        }
        
        return null;
      });
      
      if (!imgSrc) {
        console.log('  No suitable image found');
        continue;
      }
      
      console.log(`  Found: ${imgSrc.substring(0, 100)}...`);
      
      // Get higher resolution version
      let highResUrl = imgSrc
        .replace(/\.width-\d+/, '.width-1200')
        .replace(/\.max-\d+x\d+/, '.max-1200x1200')
        .replace(/fill-\d+x\d+/, 'fill-1200x1200');
      
      // Handle relative URLs
      if (highResUrl.startsWith('/')) {
        highResUrl = 'https://www.tate.org.uk' + highResUrl;
      }
      
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
