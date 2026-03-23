/**
 * Upload Tate Britain Display images to R2 as WebP
 * - Downloads images from Tate URLs
 * - Converts to WebP format
 * - Uploads to R2 bucket
 * - Updates JSON with R2 URLs
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// Load env
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = 'armin-gallery-images';
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

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function convertToWebP(buffer) {
  return sharp(buffer)
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
}

async function uploadToR2(buffer, key) {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: 'image/webp',
  });
  await s3Client.send(command);
  return `${R2_PUBLIC_URL}/${key}`;
}

function generateKey(displayTitle, type, filename) {
  const slug = displayTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `tate-britain/${slug}/${type}/${filename}`;
}

async function processImage(imageUrl, displayTitle, type, index) {
  try {
    // Generate unique filename
    const urlParts = imageUrl.split('/');
    const originalName = urlParts[urlParts.length - 1].split('?')[0].replace(/\.[^.]+$/, '');
    const filename = `${index.toString().padStart(3, '0')}-${originalName.substring(0, 30)}.webp`;
    const key = generateKey(displayTitle, type, filename);
    
    // Download
    const imageBuffer = await downloadImage(imageUrl);
    
    // Check if image is valid (not too small/white)
    const metadata = await sharp(imageBuffer).metadata();
    if (metadata.width < 50 || metadata.height < 50) {
      console.log(`  ⚠ Skipping too small: ${imageUrl}`);
      return null;
    }
    
    // Convert to WebP
    const webpBuffer = await convertToWebP(imageBuffer);
    
    // Upload to R2
    const r2Url = await uploadToR2(webpBuffer, key);
    
    return r2Url;
  } catch (error) {
    console.error(`  ✗ Error: ${error.message} - ${imageUrl}`);
    return null;
  }
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== Uploading Tate Britain Images to R2 ===\n');
  
  const mainPath = path.join(__dirname, '../public/data/tate-britain.json');
  const main = JSON.parse(fs.readFileSync(mainPath, 'utf8'));
  
  let totalUploaded = 0;
  let totalFailed = 0;
  
  for (const item of main.items) {
    if (!item.rooms || item.rooms.length === 0) continue;
    
    console.log(`\n📁 ${item.title}`);
    
    // Upload thumbnail
    if (item.image && !item.image.includes('r2.dev')) {
      console.log('  Uploading thumbnail...');
      const thumbUrl = await processImage(item.image, item.title, 'thumbnail', 0);
      if (thumbUrl) {
        item.image = thumbUrl;
        console.log(`  ✓ Thumbnail uploaded`);
        totalUploaded++;
      } else {
        totalFailed++;
      }
      await delay(300);
    }
    
    // Upload artwork images
    let artworkIndex = 1;
    for (const room of item.rooms) {
      if (!room.artworks) continue;
      
      console.log(`  Room: ${room.name}`);
      
      for (const artwork of room.artworks) {
        if (artwork.image && !artwork.image.includes('r2.dev')) {
          const r2Url = await processImage(artwork.image, item.title, 'artworks', artworkIndex);
          if (r2Url) {
            artwork.originalImage = artwork.image; // Keep original
            artwork.image = r2Url;
            process.stdout.write('.');
            totalUploaded++;
          } else {
            totalFailed++;
          }
          artworkIndex++;
          await delay(200); // Rate limit
        }
      }
      console.log('');
    }
  }
  
  // Save updated JSON
  fs.writeFileSync(mainPath, JSON.stringify(main, null, 2));
  
  console.log('\n=== Summary ===');
  console.log(`✓ Uploaded: ${totalUploaded}`);
  console.log(`✗ Failed: ${totalFailed}`);
  console.log(`\nSaved to ${mainPath}`);
}

main().catch(console.error);
