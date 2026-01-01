/**
 * FLV 실패한 이미지 재시도
 * 더 긴 대기 시간과 재시도 로직 추가
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = 'armin-gallery-images';
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';

const INPUT_FILE = path.join(__dirname, '../public/data/flv-collection.json');
const OUTPUT_FILE = INPUT_FILE;
const LOG_FILE = path.join(__dirname, '../logs/flv-retry.log');

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const log = (msg) => {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  fs.appendFileSync(LOG_FILE, line + '\n');
  console.log(line);
};

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function captureImageFromPage(page, detailUrl, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await page.goto(detailUrl, { waitUntil: 'networkidle0', timeout: 90000 });
      
      // Wait longer for image to load
      await page.waitForSelector('img', { timeout: 20000 });
      await delay(3000);

      // Find and fetch the largest image
      const imageBuffer = await page.evaluate(async () => {
        const images = Array.from(document.querySelectorAll('img'));
        let bestImg = null;
        let maxArea = 0;
        
        for (const img of images) {
          const rect = img.getBoundingClientRect();
          const area = rect.width * rect.height;
          if (area > maxArea && img.src && !img.src.includes('logo') && !img.src.includes('icon') && !img.src.includes('placeholder')) {
            maxArea = area;
            bestImg = img;
          }
        }
        
        if (!bestImg || !bestImg.src) return null;
        
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

      if (imageBuffer && imageBuffer.length > 5000) {
        return Buffer.from(imageBuffer);
      }

      // Fallback: screenshot the main image
      const imgElement = await page.$('main img, article img, .artwork img, img[src*="imgix"], img[src*="flv"]');
      if (imgElement) {
        const box = await imgElement.boundingBox();
        if (box && box.width > 100 && box.height > 100) {
          return await imgElement.screenshot({ type: 'png' });
        }
      }

      throw new Error('Could not capture valid image');
    } catch (err) {
      if (attempt < retries) {
        log(`  Retry ${attempt}/${retries}: ${err.message}`);
        await delay(3000);
      } else {
        throw err;
      }
    }
  }
}

async function convertToWebP(buffer) {
  return sharp(buffer)
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 90 }) // Higher quality
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

async function main() {
  fs.writeFileSync(LOG_FILE, '');
  log('═══════════════════════════════════════════');
  log('  FLV Failed Images Retry');
  log('═══════════════════════════════════════════');

  const collection = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  
  // Find items still using imgix URLs
  const failedItems = collection.filter(item => 
    item.imageUrl && item.imageUrl.includes('imgix')
  );
  
  log(`📤 Failed items to retry: ${failedItems.length}`);

  if (failedItems.length === 0) {
    log('✅ All images already uploaded!');
    return;
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < failedItems.length; i++) {
    const item = failedItems[i];
    const idx = collection.findIndex(c => c.id === item.id);
    
    log(`\n[${i + 1}/${failedItems.length}] ${item.title?.substring(0, 35)}...`);

    if (!item.detailUrl) {
      log('  ⚠️ No detail URL, skipping');
      failCount++;
      continue;
    }

    try {
      log('  📸 Capturing from page...');
      const buffer = await captureImageFromPage(page, item.detailUrl);
      
      log('  🔄 Converting to WebP...');
      const webpBuffer = await convertToWebP(buffer);

      const key = `flv/${item.id}.webp`;
      log('  ☁️  Uploading to R2...');
      const r2Url = await uploadToR2(webpBuffer, key);

      collection[idx].imageUrl = r2Url;
      successCount++;
      log(`  ✅ Done: ${r2Url}`);

      if (successCount % 5 === 0) {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2));
        log(`  💾 Saved progress`);
      }

      await delay(2000);
    } catch (err) {
      log(`  ❌ Failed: ${err.message}`);
      failCount++;
      await delay(1000);
    }
  }

  await browser.close();

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2));

  log('\n═══════════════════════════════════════════');
  log(`✅ Success: ${successCount}`);
  log(`❌ Failed: ${failCount}`);
  log('═══════════════════════════════════════════');
}

main().catch(console.error);
