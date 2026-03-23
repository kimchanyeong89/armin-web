#!/usr/bin/env node
/**
 * British Museum Collection Image Uploader
 * 
 * Downloads images from scraped British Museum collection,
 * converts to WebP format for optimization,
 * uploads to Cloudflare R2,
 * and updates the JSON with R2 URLs.
 * 
 * Usage: node scripts/upload-british-museum-to-r2.cjs
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
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

const JSON_PATH = path.join(process.cwd(), 'public', 'data', 'british-museum-collection.json');
const TEMP_DIR = path.join(process.cwd(), 'temp-british-museum-images');

// Rate limiting
const DELAY_BETWEEN_DOWNLOADS = 500; // ms
const DELAY_BETWEEN_UPLOADS = 200; // ms
const MAX_RETRIES = 3;

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

function downloadImage(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    if (!url) {
      return reject(new Error('No URL provided'));
    }
    
    // Fix protocol-relative URLs
    if (url.startsWith('//')) {
      url = `https:${url}`;
    }
    
    const protocol = url.startsWith('https') ? https : http;
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.britishmuseum.org/'
      }
    };
    
    const req = protocol.get(url, options, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (redirectUrl.startsWith('//')) {
          redirectUrl = `https:${redirectUrl}`;
        } else if (redirectUrl.startsWith('/')) {
          const urlObj = new URL(url);
          redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;
        }
        return downloadImage(redirectUrl, timeout).then(resolve).catch(reject);
      }
      
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
      }
      
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (buffer.length < 1000) {
          return reject(new Error('Image too small (likely an error)'));
        }
        resolve(buffer);
      });
      res.on('error', reject);
    });
    
    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function convertToWebP(buffer, maxSize = 1200) {
  try {
    // Get metadata first
    const metadata = await sharp(buffer).metadata();
    
    // Skip if image is too small or invalid
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

async function checkIfExists(key) {
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key
    }));
    return true;
  } catch (e) {
    return false;
  }
}

async function uploadToR2(buffer, key) {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000',
  });
  
  await s3Client.send(command);
  return `${R2_PUBLIC_URL}/${key}`;
}

function generateKey(roomId, objectId, suffix = '') {
  // Clean up IDs for safe file paths
  const cleanRoomId = String(roomId).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  const cleanObjectId = String(objectId).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').substring(0, 50);
  const filename = suffix ? `${cleanObjectId}-${suffix}.webp` : `${cleanObjectId}.webp`;
  return `british-museum/${cleanRoomId}/${filename}`;
}

async function processItem(item, roomId, index, total, stats) {
  const itemId = item.id || `item-${index}`;
  const prefix = `[${index + 1}/${total}]`;
  
  // Skip if already has R2 URL
  if (item.image && item.image.includes('r2.dev')) {
    console.log(`${prefix} ⏭️  ${itemId} - already on R2`);
    stats.skipped++;
    return item;
  }
  
  if (!item.image) {
    console.log(`${prefix} ⚠️  ${itemId} - no image URL`);
    stats.noImage++;
    return item;
  }
  
  const key = generateKey(roomId, itemId);
  
  // Check if already uploaded
  const exists = await checkIfExists(key);
  if (exists) {
    console.log(`${prefix} ⏭️  ${itemId} - already uploaded`);
    item.image = `${R2_PUBLIC_URL}/${key}`;
    stats.skipped++;
    return item;
  }
  
  // Download with retries
  let buffer = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`${prefix} ⬇️  ${itemId} - downloading... (attempt ${attempt})`);
      buffer = await downloadImage(item.image);
      break;
    } catch (e) {
      if (attempt === MAX_RETRIES) {
        console.log(`${prefix} ❌ ${itemId} - download failed: ${e.message}`);
        stats.failed.push({ id: itemId, url: item.image, error: e.message });
        return item;
      }
      await delay(1000 * attempt);
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
    stats.failed.push({ id: itemId, url: item.image, error: e.message });
    return item;
  }
  
  // Upload to R2
  try {
    console.log(`${prefix} ⬆️  ${itemId} - uploading to R2...`);
    const r2Url = await uploadToR2(webpBuffer, key);
    item.image = r2Url;
    item.originalImage = item.image; // Keep original for reference
    console.log(`${prefix} ✅ ${itemId} - success (${Math.round(webpBuffer.length / 1024)}KB)`);
    stats.uploaded++;
  } catch (e) {
    console.log(`${prefix} ❌ ${itemId} - upload failed: ${e.message}`);
    stats.failed.push({ id: itemId, url: item.image, error: e.message });
  }
  
  await delay(DELAY_BETWEEN_UPLOADS);
  
  // Process additional images if any
  if (item.additionalImages && item.additionalImages.length > 0) {
    const additionalR2Urls = [];
    for (let i = 0; i < Math.min(item.additionalImages.length, 5); i++) {
      const addUrl = item.additionalImages[i];
      if (!addUrl || addUrl.includes('r2.dev')) {
        if (addUrl) additionalR2Urls.push(addUrl);
        continue;
      }
      
      const addKey = generateKey(roomId, itemId, `add-${i + 1}`);
      
      try {
        const addBuffer = await downloadImage(addUrl);
        const addWebp = await convertToWebP(addBuffer, 800);
        const addR2Url = await uploadToR2(addWebp, addKey);
        additionalR2Urls.push(addR2Url);
        await delay(DELAY_BETWEEN_DOWNLOADS);
      } catch (e) {
        // Skip failed additional images
      }
    }
    item.additionalImages = additionalR2Urls;
  }
  
  return item;
}

async function main() {
  console.log('🏛️ British Museum Collection - R2 Image Uploader');
  console.log('=================================================\n');
  
  await ensureTempDir();
  
  // Load JSON data
  if (!fs.existsSync(JSON_PATH)) {
    console.error(`❌ Data file not found: ${JSON_PATH}`);
    console.error('Run scrape-british-museum-collection.cjs first!');
    process.exit(1);
  }
  
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  console.log(`📁 Loaded: ${data.rooms?.length || 0} rooms`);
  
  const stats = {
    uploaded: 0,
    skipped: 0,
    noImage: 0,
    failed: []
  };
  
  // Count total items
  let totalItems = 0;
  for (const room of data.rooms || []) {
    totalItems += room.items?.length || 0;
  }
  console.log(`📊 Total items: ${totalItems}\n`);
  
  let currentIndex = 0;
  
  // Process each room
  for (const room of data.rooms || []) {
    console.log(`\n📍 Room: ${room.title}`);
    console.log('─'.repeat(50));
    
    const processedItems = [];
    for (const item of room.items || []) {
      const processed = await processItem(item, room.id, currentIndex, totalItems, stats);
      processedItems.push(processed);
      currentIndex++;
    }
    room.items = processedItems;
    
    // Save progress periodically
    fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
    console.log(`💾 Progress saved`);
  }
  
  // Update metadata
  data.r2Uploaded = true;
  data.r2UploadedAt = new Date().toISOString();
  data.stats = {
    ...data.stats,
    imagesUploaded: stats.uploaded,
    imagesSkipped: stats.skipped,
    imagesFailed: stats.failed.length
  };
  
  // Final save
  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
  
  // Summary
  console.log('\n=================================================');
  console.log('✅ Upload Complete!');
  console.log(`📊 Uploaded: ${stats.uploaded}`);
  console.log(`📊 Skipped (already on R2): ${stats.skipped}`);
  console.log(`📊 No image URL: ${stats.noImage}`);
  console.log(`📊 Failed: ${stats.failed.length}`);
  
  if (stats.failed.length > 0) {
    console.log('\n❌ Failed items:');
    const failedPath = path.join(process.cwd(), 'british-museum-upload-failed.json');
    fs.writeFileSync(failedPath, JSON.stringify(stats.failed, null, 2));
    console.log(`   Saved to: ${failedPath}`);
  }
  
  console.log(`\n📁 Updated: ${JSON_PATH}`);
  
  // Cleanup temp directory
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    console.log('🧹 Cleaned up temp files');
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
