/**
 * Upload Wawel Collection images to R2
 * Optimized WebP 85%
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
// const pLimit = require('p-limit'); // Moved to main due to ESM

// Load env
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

// R2 Configuration
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = 'armin-gallery-images';
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';

const INPUT_FILE = path.join(__dirname, '../public/data/wawel-collection.json');
const OUTPUT_FILE = INPUT_FILE;
const PROGRESS_FILE = path.join(__dirname, '../downloads/wawel-upload-progress.json');

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

async function downloadImage(url) {
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'arraybuffer',
    timeout: 30000, // 30s timeout
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    }
  });
  return response.data;
}

async function convertToWebP(buffer) {
  return sharp(buffer)
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }) // reasonable max size for web
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

// Load progress
let progress = { completed: [] };
if (fs.existsSync(PROGRESS_FILE)) {
  progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
}

function saveProgress(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

async function processItemWithRetry(item, index, completedSet, limit) {
    // Identify by ID
    const id = item.id || item._id;
    if (completedSet.has(id)) return;

    const originalUrl = item.generated_image_url || item.image;
    // Skip if already R2
    if (originalUrl && originalUrl.includes(R2_PUBLIC_URL)) {
        completedSet.add(id);
        return;
    }
    // Also check item.image separately just in case
    if (item.image && item.image.includes(R2_PUBLIC_URL)) {
        completedSet.add(id);
        return;
    }

    if (!originalUrl) return;

    let attempts = 0;
    while (attempts < 3) {
        try {
            await limit(async () => {
                // 1. Download
                console.log(`    Downloading: ${id}...`);
                const buffer = await downloadImage(originalUrl);
                
                // 2. Convert
                const webpBuffer = await convertToWebP(buffer);
                
                // 3. Upload
                const key = `wawel/${id}.webp`;
                const r2Url = await uploadToR2(webpBuffer, key);
                
                // 4. Update item
                item.image = r2Url;
                item.generated_image_url = r2Url; 
                item.originalImage = originalUrl;
                
                completedSet.add(id);
                return r2Url;
            });
            return; // Success
        } catch (err) {
            attempts++;
            if (attempts >= 3) {
                console.error(`  ✗ Failed [${index + 1}]: ${originalUrl} -> ${err.message}`);
                // Don't mark as completed so we can retry later or manually fix
            } else {
                 // Wait a bit before retry (exponential backoff)
                 const delay = 1000 * attempts;
                 await new Promise(res => setTimeout(res, delay));
            }
        }
    }
}

async function main() {
  console.log('Starting Wawel image upload to R2...');
  
  const pLimit = (await import('p-limit')).default;
  const collection = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  const completedSet = new Set(progress.completed);
  let uploadCount = 0;
  
  const limit = pLimit(2); // Reduced concurrency to 2 to avoid timeouts/bans

  const tasks = collection.map((item, index) => {
      return processItemWithRetry(item, index, completedSet, limit).then(() => {
          if (completedSet.has(item.id || item._id)) {
              uploadCount++;
              if (uploadCount % 10 === 0) {
                 const pct = (uploadCount / collection.length * 100).toFixed(1); 
                 console.log(`  ✓ Progress: ${uploadCount}/${collection.length} checked/completed...`);
                 
                 // Save incrementally
                 fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2));
                 saveProgress({ completed: Array.from(completedSet) });
              }
          }
      });
  });

  await Promise.all(tasks);

  // Final save
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2));
  saveProgress({ completed: Array.from(completedSet) });

  console.log('═══════════════════════════════════════════');
  console.log(`Upload complete. Total managed in this run: ${uploadCount}`);
}

main().catch(console.error);
