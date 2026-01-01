/**
 * Upload FLV Collection images to R2
 * FLV imgix 서버는 핫링크 보호가 있어서 puppeteer로 다운로드
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

// Load env
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

// R2 Configuration
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = 'armin-gallery-images';
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';

const INPUT_FILE = path.join(__dirname, '../public/data/flv-collection.json');
const OUTPUT_FILE = INPUT_FILE;
const PROGRESS_FILE = path.join(__dirname, '../downloads/flv-upload-progress.json');

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

async function downloadImageWithPuppeteer(browser, url) {
  const page = await browser.newPage();
  try {
    // Navigate to the FLV site first to get cookies
    await page.goto('https://www.fondationlouisvuitton.fr', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Now fetch the image
    const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    if (!response || !response.ok()) {
      throw new Error(`Failed to load image: ${response?.status()}`);
    }
    const buffer = await response.buffer();
    if (buffer.length < 1000) {
      throw new Error('Image too small');
    }
    return buffer;
  } finally {
    await page.close();
  }
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
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { completed: [], lastIndex: 0 };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  FLV Collection → R2 Upload');
  console.log('═══════════════════════════════════════════');

  // Load collection
  const collection = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  console.log(`📦 Total artworks: ${collection.length}`);

  // Load progress
  const progress = loadProgress();
  const completedSet = new Set(progress.completed);
  console.log(`✅ Already uploaded: ${completedSet.size}`);

  // Filter items that need upload
  const toUpload = collection.filter((item, idx) => {
    // Skip if already completed
    if (completedSet.has(item.id)) return false;
    // Skip if already has R2 URL
    if (item.imageUrl && item.imageUrl.includes('r2.dev')) return false;
    // Skip if no image
    if (!item.imageUrl) return false;
    return true;
  });

  console.log(`📤 To upload: ${toUpload.length}`);

  if (toUpload.length === 0) {
    console.log('✅ All images already uploaded!');
    return;
  }

  // Launch browser
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < toUpload.length; i++) {
    const item = toUpload[i];
    const idx = collection.findIndex(c => c.id === item.id);
    
    console.log(`\n[${i + 1}/${toUpload.length}] ${item.title?.substring(0, 40)}...`);

    try {
      // Download image using puppeteer
      console.log('  📥 Downloading...');
      const buffer = await downloadImageWithPuppeteer(browser, item.imageUrl);
      
      // Convert to WebP
      console.log('  🔄 Converting to WebP...');
      const webpBuffer = await convertToWebP(buffer);

      // Upload to R2
      const key = `flv/${item.id}.webp`;
      console.log('  ☁️  Uploading to R2...');
      const r2Url = await uploadToR2(webpBuffer, key);

      // Update collection
      collection[idx].imageUrl = r2Url;
      
      // Update progress
      progress.completed.push(item.id);
      progress.lastIndex = idx;
      
      successCount++;
      console.log(`  ✅ Done: ${r2Url}`);

      // Save progress every 10 items
      if (successCount % 10 === 0) {
        saveProgress(progress);
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2));
        console.log(`  💾 Saved progress (${successCount} uploaded)`);
      }

      // Rate limiting
      await delay(1000);
    } catch (err) {
      console.log(`  ❌ Failed: ${err.message}`);
      failCount++;
      await delay(500);
    }
  }

  await browser.close();

  // Final save
  saveProgress(progress);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2));

  console.log('\n═══════════════════════════════════════════');
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log('═══════════════════════════════════════════');
}

main().catch(console.error);
