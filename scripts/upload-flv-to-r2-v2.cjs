/**
 * FLV 이미지 스크래핑 + R2 업로드
 * 상세 페이지에서 직접 이미지 요소를 스크린샷으로 캡처
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

async function captureImageFromPage(page, detailUrl) {
  await page.goto(detailUrl, { waitUntil: 'networkidle0', timeout: 60000 });
  
  // Wait for image to load
  await page.waitForSelector('img', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 2000));

  // Find the main artwork image
  const imageBuffer = await page.evaluate(async () => {
    // Find the largest image on the page (likely the artwork)
    const images = Array.from(document.querySelectorAll('img'));
    let bestImg = null;
    let maxArea = 0;
    
    for (const img of images) {
      const rect = img.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > maxArea && img.src && !img.src.includes('logo') && !img.src.includes('icon')) {
        maxArea = area;
        bestImg = img;
      }
    }
    
    if (!bestImg || !bestImg.src) return null;
    
    // Try to fetch the image directly
    try {
      const response = await fetch(bestImg.src, { credentials: 'include' });
      if (!response.ok) return null;
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      return Array.from(new Uint8Array(arrayBuffer));
    } catch (e) {
      return null;
    }
  });

  if (imageBuffer && imageBuffer.length > 1000) {
    return Buffer.from(imageBuffer);
  }

  // Fallback: screenshot the image element
  const imgElement = await page.$('main img, article img, .artwork img, img[src*="imgix"]');
  if (imgElement) {
    return await imgElement.screenshot({ type: 'png' });
  }

  throw new Error('Could not capture image');
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

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { completed: [], failed: [] };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  FLV Collection → R2 Upload (Screenshot)');
  console.log('═══════════════════════════════════════════');

  // Load collection
  const collection = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  console.log(`📦 Total artworks: ${collection.length}`);

  // Load progress
  const progress = loadProgress();
  const completedSet = new Set(progress.completed);
  console.log(`✅ Already uploaded: ${completedSet.size}`);

  // Filter items that need upload
  const toUpload = collection.filter((item) => {
    if (completedSet.has(item.id)) return false;
    if (item.imageUrl && item.imageUrl.includes('r2.dev')) return false;
    if (!item.detailUrl) return false;
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
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  
  // Set cookies/headers
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
  });

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < toUpload.length; i++) {
    const item = toUpload[i];
    const idx = collection.findIndex(c => c.id === item.id);
    
    console.log(`\n[${i + 1}/${toUpload.length}] ${item.title?.substring(0, 40)}...`);

    try {
      // Capture image from detail page
      console.log('  📸 Capturing from page...');
      const buffer = await captureImageFromPage(page, item.detailUrl);
      
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
      
      successCount++;
      console.log(`  ✅ Done: ${r2Url}`);

      // Save progress every 5 items
      if (successCount % 5 === 0) {
        saveProgress(progress);
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2));
        console.log(`  💾 Saved progress (${successCount} uploaded)`);
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      console.log(`  ❌ Failed: ${err.message}`);
      progress.failed.push({ id: item.id, error: err.message });
      failCount++;
      await new Promise(r => setTimeout(r, 500));
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
