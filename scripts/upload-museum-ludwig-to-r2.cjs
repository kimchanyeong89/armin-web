#!/usr/bin/env node
/**
 * Museum Ludwig Image Uploader to R2
 * 
 * Uses Playwright browser context to download images (bypasses 403 errors),
 * converts to WebP format for optimization,
 * uploads to Cloudflare R2,
 * and updates the JSON with R2 URLs.
 * 
 * Usage: node scripts/upload-museum-ludwig-to-r2.cjs [collection]
 * Collections: paintings, photography, graphics, sculpture
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = 'armin-gallery-images';
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error('❌ Missing R2 credentials in .env.local');
  console.error('Required: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
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

const COLLECTIONS = {
  paintings: {
    file: path.join(process.cwd(), 'public', 'data', 'museum-ludwig-paintings.json'),
    r2Prefix: 'museum-ludwig/paintings'
  },
  photography: {
    file: path.join(process.cwd(), 'public', 'data', 'museum-ludwig-photography.json'),
    r2Prefix: 'museum-ludwig/photography'
  },
  graphics: {
    file: path.join(process.cwd(), 'public', 'data', 'museum-ludwig-graphics.json'),
    r2Prefix: 'museum-ludwig/graphics'
  },
  sculpture: {
    file: path.join(process.cwd(), 'public', 'data', 'museum-ludwig-sculpture.json'),
    r2Prefix: 'museum-ludwig/sculpture'
  }
};

// Rate limiting
const DELAY_BETWEEN_DOWNLOADS = 1000; // ms
const DELAY_BETWEEN_UPLOADS = 200; // ms
const MAX_RETRIES = 3;

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkIfExists(key) {
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    }));
    return true;
  } catch (e) {
    if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw e;
  }
}

function generateKey(prefix, itemId) {
  return `${prefix}/${itemId}.webp`;
}

async function convertToWebP(buffer, maxSize = 1200) {
  try {
    const metadata = await sharp(buffer).metadata();
    
    if (!metadata.width || !metadata.height || metadata.width < 50 || metadata.height < 50) {
      throw new Error('Image too small or invalid');
    }
    
    return sharp(buffer)
      .resize(maxSize, maxSize, { 
        fit: 'inside', 
        withoutEnlargement: true 
      })
      .webp({ 
        quality: 85,
        effort: 4
      })
      .toBuffer();
  } catch (e) {
    throw new Error(`WebP conversion failed: ${e.message}`);
  }
}

async function uploadToR2(buffer, key) {
  await s3Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000',
  }));
  return `${R2_PUBLIC_URL}/${key}`;
}

/**
 * Download image using Playwright browser context (bypasses 403 errors)
 * Use a new page in the same context to navigate to image URL
 */
async function downloadImageWithBrowser(context, imageUrl, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    let imagePage = null;
    try {
      // Create a new page in the same context (shares cookies/session)
      imagePage = await context.newPage();
      
      // Navigate to image URL directly - browser context provides cookies/Referer
      const response = await imagePage.goto(imageUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      
      if (!response || !response.ok()) {
        throw new Error(`HTTP ${response?.status() || 'unknown'}`);
      }

      // Get response body as buffer
      const buffer = await response.body();
      
      if (buffer && buffer.length > 5000) {
        await imagePage.close();
        return buffer;
      }

      throw new Error('Invalid image buffer');
    } catch (err) {
      if (imagePage) {
        await imagePage.close().catch(() => {});
      }
      if (attempt < retries) {
        console.log(`    Retry ${attempt}/${retries}: ${err.message}`);
        await delay(2000);
      } else {
        throw err;
      }
    }
  }
  throw new Error('All retries failed');
}

async function processItem(item, collectionConfig, context, index, total, stats) {
  const itemId = item.id || `item-${index}`;
  const prefix = `[${index + 1}/${total}]`;
  
  // Skip if already has R2 URL
  if (item.imageUrl && item.imageUrl.includes('r2.dev')) {
    console.log(`${prefix} ⏭️  ${itemId} - already on R2`);
    stats.skipped++;
    return item;
  }
  
  const imageUrl = item.imageUrl || item.thumbnailUrl;
  if (!imageUrl) {
    console.log(`${prefix} ⚠️  ${itemId} - no image URL`);
    stats.noImage++;
    return item;
  }

  // Skip if not kekmedien URL (shouldn't happen, but safety check)
  if (!imageUrl.includes('kekmedien.kulturelles-erbe-koeln.de')) {
    console.log(`${prefix} ⚠️  ${itemId} - not a kekmedien URL`);
    stats.skipped++;
    return item;
  }
  
  const key = generateKey(collectionConfig.r2Prefix, itemId);
  
  // Check if already uploaded
  const exists = await checkIfExists(key);
  if (exists) {
    console.log(`${prefix} ⏭️  ${itemId} - already uploaded`);
    item.imageUrl = `${R2_PUBLIC_URL}/${key}`;
    if (item.thumbnailUrl) {
      item.thumbnailUrl = `${R2_PUBLIC_URL}/${key}`;
    }
    stats.skipped++;
    return item;
  }
  
  // Download with browser context
  let buffer = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`${prefix} ⬇️  ${itemId} - downloading... (attempt ${attempt})`);
      buffer = await downloadImageWithBrowser(context, imageUrl);
      break;
    } catch (e) {
      if (attempt === MAX_RETRIES) {
        console.log(`${prefix} ❌ ${itemId} - download failed: ${e.message}`);
        stats.failed.push({ id: itemId, url: imageUrl, error: e.message });
        return item;
      }
      await delay(2000 * attempt);
    }
  }
  
  await delay(DELAY_BETWEEN_DOWNLOADS);
  
  // Convert to WebP
  let webpBuffer;
  try {
    console.log(`${prefix} 🔄 ${itemId} - converting to WebP...`);
    webpBuffer = await convertToWebP(buffer);
  } catch (e) {
    console.log(`${prefix} ❌ ${itemId} - conversion failed: ${e.message}`);
    stats.failed.push({ id: itemId, url: imageUrl, error: e.message });
    return item;
  }
  
  // Upload to R2
  try {
    console.log(`${prefix} ⬆️  ${itemId} - uploading to R2...`);
    const r2Url = await uploadToR2(webpBuffer, key);
    item.imageUrl = r2Url;
    if (item.thumbnailUrl) {
      item.thumbnailUrl = r2Url;
    }
    console.log(`${prefix} ✅ ${itemId} - success (${Math.round(webpBuffer.length / 1024)}KB)`);
    stats.uploaded++;
  } catch (e) {
    console.log(`${prefix} ❌ ${itemId} - upload failed: ${e.message}`);
    stats.failed.push({ id: itemId, url: imageUrl, error: e.message });
  }
  
  await delay(DELAY_BETWEEN_UPLOADS);
  
  return item;
}

async function main() {
  const collectionName = process.argv[2] || 'paintings';
  const collectionConfig = COLLECTIONS[collectionName];
  
  if (!collectionConfig) {
    console.error(`❌ Unknown collection: ${collectionName}`);
    console.error(`Available: ${Object.keys(COLLECTIONS).join(', ')}`);
    process.exit(1);
  }

  if (!fs.existsSync(collectionConfig.file)) {
    console.error(`❌ File not found: ${collectionConfig.file}`);
    process.exit(1);
  }

  console.log('🏛️ Museum Ludwig Image Uploader to R2');
  console.log(`Collection: ${collectionName}`);
  console.log(`Input: ${collectionConfig.file}\n`);

  const data = JSON.parse(fs.readFileSync(collectionConfig.file, 'utf8'));
  const items = Array.isArray(data) ? data : [];
  
  console.log(`Found ${items.length} items\n`);

  const stats = {
    uploaded: 0,
    skipped: 0,
    failed: [],
    noImage: 0
  };

  // Launch browser with context
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  // Navigate to museum site first to establish session/cookies
  const page = await context.newPage();
  await page.goto('https://museum-ludwig.kulturelles-erbe-koeln.de/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await delay(2000);

  try {
    for (let i = 0; i < items.length; i++) {
      await processItem(items[i], collectionConfig, context, i, items.length, stats);
      
      // Save progress every 10 items
      if ((i + 1) % 10 === 0) {
        fs.writeFileSync(collectionConfig.file, JSON.stringify(items, null, 2));
        console.log(`\n💾 Progress saved (${i + 1}/${items.length})\n`);
      }
    }

    // Final save
    fs.writeFileSync(collectionConfig.file, JSON.stringify(items, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log('📊 Summary');
    console.log('='.repeat(60));
    console.log(`✅ Uploaded: ${stats.uploaded}`);
    console.log(`⏭️  Skipped: ${stats.skipped}`);
    console.log(`⚠️  No image: ${stats.noImage}`);
    console.log(`❌ Failed: ${stats.failed.length}`);
    
    if (stats.failed.length > 0) {
      console.log('\n❌ Failed items:');
      stats.failed.slice(0, 10).forEach((f, i) => {
        console.log(`  ${i + 1}. ${f.id}: ${f.error}`);
      });
      if (stats.failed.length > 10) {
        console.log(`  ... and ${stats.failed.length - 10} more`);
      }
    }
    
    console.log('\n✅ Done!');
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
