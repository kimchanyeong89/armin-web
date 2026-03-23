/**
 * Upload Dulwich Picture Gallery Collection to R2
 * 규칙 파일: docs/ARCHIVE_RULES.md
 * 
 * 규칙 적용:
 * - Rule 1: WebP 형식, quality 85, max 1200px
 * - Rule 2: 빈 이미지는 건너뜀
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Load env
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

// R2 Configuration
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = 'armin-gallery-images';
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';

const INPUT_FILE = path.join(__dirname, '../public/data/dulwich-collection.json');
const OUTPUT_FILE = INPUT_FILE; // Update in place
const PROGRESS_FILE = path.join(__dirname, '../downloads/dulwich-upload-progress.json');

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    try {
      // Use curl for more reliable downloads (handles SSL better)
      const tempFile = `/tmp/dulwich-temp-${Date.now()}.jpg`;
      execSync(`curl -sL -o "${tempFile}" "${url}"`, { timeout: 60000 });
      const buffer = fs.readFileSync(tempFile);
      fs.unlinkSync(tempFile);
      if (buffer.length < 1000) {
        reject(new Error('Image too small'));
        return;
      }
      resolve(buffer);
    } catch (err) {
      reject(err);
    }
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
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'image/webp',
  });
  await s3.send(command);
  return `${R2_PUBLIC_URL}/${key}`;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return { uploaded: {} };
}

function saveProgress(progress) {
  const dir = path.dirname(PROGRESS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function main() {
  console.log('🎨 Dulwich Picture Gallery → R2 Uploader');
  console.log('📋 Following rules from: docs/ARCHIVE_RULES.md\n');
  
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    console.error('❌ R2 credentials not found!');
    console.error('Set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY environment variables');
    process.exit(1);
  }
  
  // Load collection
  const collection = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  const objects = collection.objects;
  console.log(`📊 Total objects: ${objects.length}\n`);
  
  // Load progress
  const progress = loadProgress();
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  
  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    const key = `dulwich-picture-gallery/${obj.id}.webp`;
    
    // Check if already uploaded
    if (progress.uploaded[obj.id]) {
      obj.image = progress.uploaded[obj.id];
      skipped++;
      continue;
    }
    
    // Rule 2: Skip empty images
    if (!obj.image) {
      console.log(`[${i + 1}/${objects.length}] ⚠️ No image: ${obj.title}`);
      failed++;
      continue;
    }
    
    console.log(`[${i + 1}/${objects.length}] ${obj.title.substring(0, 40)}...`);
    
    try {
      // Download
      console.log(`  📥 Downloading...`);
      const imageBuffer = await downloadImage(obj.image);
      console.log(`  📐 Converting... (${(imageBuffer.length / 1024).toFixed(1)}KB)`);
      
      // Convert to WebP (Rule 1)
      const webpBuffer = await convertToWebP(imageBuffer);
      console.log(`  ☁️ Uploading to R2...`);
      
      // Upload to R2
      const r2Url = await uploadToR2(webpBuffer, key);
      
      // Update object
      obj.image = r2Url;
      progress.uploaded[obj.id] = r2Url;
      uploaded++;
      
      console.log(`  ✅ ${(webpBuffer.length / 1024).toFixed(1)}KB`);
      
      // Save progress every 10 uploads
      if (uploaded % 10 === 0) {
        saveProgress(progress);
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2));
      }
      
      await delay(200);
      
    } catch (err) {
      console.log(`  ❌ ${err.message}`);
      failed++;
    }
  }
  
  // Final save
  saveProgress(progress);
  
  // Update cover image (Rule 7)
  const firstValidImage = objects.find(o => o.image && o.image.startsWith(R2_PUBLIC_URL))?.image;
  if (firstValidImage) {
    collection.coverImage = firstValidImage;
  }
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2));
  
  console.log(`\n✅ Upload Complete!`);
  console.log(`  📤 Uploaded: ${uploaded}`);
  console.log(`  ⏭️ Skipped (already done): ${skipped}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`\n📁 Updated: ${OUTPUT_FILE}`);
}

main().catch(console.error);
