/**
 * Fetch correct cover images for Tate Modern Displays
 * Goes to each display page and gets the main hero image
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

const R2_BUCKET = 'armin-gallery-images';
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY }
});

// Display ID -> URL mapping
const DISPLAY_URLS = {
  'display-artist-and-society': 'https://www.tate.org.uk/visit/tate-modern/display/artist-and-society',
  'display-in-the-studio': 'https://www.tate.org.uk/visit/tate-modern/display/in-the-studio',
  'display-materials-and-objects': 'https://www.tate.org.uk/visit/tate-modern/display/materials-and-objects',
  'display-media-networks': 'https://www.tate.org.uk/visit/tate-modern/display/media-networks',
  'display-performer-and-participant': 'https://www.tate.org.uk/visit/tate-modern/display/performer-and-participant',
  'display-tanks': 'https://www.tate.org.uk/visit/tate-modern/display/tanks',
  'display-artist-rooms-richard-long': 'https://www.tate.org.uk/visit/tate-modern/display/artist-rooms-richard-long'
};

// Known hero image selectors - look for the main display image with photo credit
const HERO_IMAGE_SELECTOR = 'figure img, .hero img, [class*="hero"] img, main img[src*="original_images"]';

async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const makeRequest = (reqUrl, redirectCount = 0) => {
      if (redirectCount > 5) return reject(new Error('Too many redirects'));
      const protocol = reqUrl.startsWith('https') ? https : require('http');
      protocol.get(reqUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
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
  const webp = await sharp(buffer).resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: webp,
    ContentType: 'image/webp'
  }));
  return `${R2_PUBLIC_URL}/${key}`;
}

async function main() {
  console.log('Starting Tate Modern cover image fetch...\n');
  
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  // Set shorter timeout
  page.setDefaultTimeout(15000);
  
  // Accept cookies on main site first
  try {
    await page.goto('https://www.tate.org.uk', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(1000);
    const acceptBtn = await page.$('button:has-text("Accept")');
    if (acceptBtn) {
      await acceptBtn.click();
      await page.waitForTimeout(500);
    }
  } catch (e) {
    console.log('Cookie consent skip, continuing...');
  }
  
  for (const item of data.items) {
    if (!item.id || !item.id.startsWith('display-')) continue;
    
    const url = DISPLAY_URLS[item.id];
    if (!url) {
      console.log(`[SKIP] ${item.title} - no URL mapping`);
      continue;
    }
    
    console.log(`\n=== ${item.title} ===`);
    console.log(`  URL: ${url}`);
    
    try {
      // Use domcontentloaded instead of networkidle to avoid hanging
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      
      // Wait a bit for images to start loading
      await page.waitForTimeout(2000);
      
      // Scroll to trigger lazy loading
      await page.evaluate(() => window.scrollTo(0, 500));
      await page.waitForTimeout(1000);
      
      // Get the display's main hero image (gallery installation photo)
      // These are in wgtail-st1-ctr-data/images/ path, NOT art/images/work/
      let imgUrl = null;
      
      // Look for gallery/installation photos (not artwork images)
      const galleryImgs = await page.$$eval('img[src*="wgtail-st1-ctr-data/images/"]', imgs => 
        imgs.map(img => img.src)
          .filter(src => {
            // Exclude navigation/footer images
            if (src.includes('tate_britain_exterior')) return false;
            if (src.includes('tate_modern_1')) return false;
            if (src.includes('Tate_Liverpool')) return false;
            if (src.includes('tate_st_ives')) return false;
            if (src.includes('logo')) return false;
            // Must be a sized image
            return src.includes('.width-') || src.includes('.max-');
          })
      );
      
      console.log(`  Found ${galleryImgs.length} gallery images`);
      
      if (galleryImgs.length > 0) {
        // Keep original URL (don't try to get higher resolution that might not exist)
        imgUrl = galleryImgs[0];
        console.log(`  Using gallery image: ${imgUrl.substring(0, 80)}...`);
      }
      
      // Fallback to original_images if no gallery images
      if (!imgUrl) {
        const originalImgs = await page.$$eval('img[src*="original_images"]', imgs =>
          imgs.map(img => img.src).filter(src => !src.includes('Lead_image'))
        );
        if (originalImgs.length > 0) {
          imgUrl = originalImgs[0];
          console.log(`  Fallback to original_images: ${imgUrl.substring(0, 80)}...`);
        }
      }
      
      if (!imgUrl) {
        console.log(`  No suitable image found`);
        continue;
      }
      
      console.log(`  Image: ${imgUrl.substring(0, 100)}...`);
      
      // Download and upload to R2
      const buf = await downloadImage(imgUrl);
      const key = `tate-modern/${item.id}/cover.webp`;
      const r2Url = await uploadToR2(buf, key);
      
      item.image = r2Url;
      console.log(`  Cover updated: ${r2Url}`);
      
      // Small delay between requests
      await page.waitForTimeout(500);
      
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }
  
  await browser.close();
  
  // Save
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  console.log('\n=== Saved! ===');
}

main().catch(console.error);
