#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = 'armin-gallery-images';
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error('❌ Missing R2 credentials in .env.local');
  process.exit(1);
}

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  }
});

const MAX_CONCURRENT_UPLOADS = 5;

// Function to download image as buffer
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    const request = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 15000 }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadImage(response.headers.location).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        return reject(new Error(`Failed to download image (HTTP ${response.statusCode}) from ${url}`));
      }
      
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });
    
    request.on('error', (err) => {
      reject(err);
      request.destroy();
    });
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function fileExistsInR2(key) {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
    return true;
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) return false;
    throw error;
  }
}

async function run() {
    const filePath = path.join(__dirname, '../public/data', 'tepapa-collection.json');
    if (!fs.existsSync(filePath)) {
        console.log(`File not found: tepapa-collection.json`);
        return;
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let successes = 0, errors = 0, skipped = 0;

    // Filter items to upload
    const itemsToUpload = [];
    
    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        let targetUrl = item.image_url || item.image || item.thumbnail || "";
        if (!targetUrl) continue;
        
        // Ensure they have 'original_imageUrl' filled out or set it
        let original = item.original_imageUrl || targetUrl;
        
        // If image is already an R2 link
        if (targetUrl.includes('.r2.dev')) {
            skipped++;
            continue;
        }

        const safeId = item.id.replace(/[^a-zA-Z0-9_-]/g, '');
        const r2Key = `artworks/tepapa-collection/${safeId}-image.webp`;
        const r2Url = `${R2_PUBLIC_URL}/${r2Key}`;

        itemsToUpload.push({ item, index: i, original, r2Key, r2Url });
    }

    console.log(`[R2 Manager] Found ${itemsToUpload.length} items to upload to R2 (already skipped ${skipped} R2 valid items).`);
    let currentIndex = 0;
    
    // Process map
    const processNext = async () => {
        if (currentIndex >= itemsToUpload.length) return;
        const current = itemsToUpload[currentIndex++];
        const { item, original, r2Key, r2Url } = current;

        try {
            const exists = await fileExistsInR2(r2Key);
            if (exists) {
                // Already in R2, update JSON
                item.original_imageUrl = original;
                item.image_url = r2Url;
                item.image = r2Url;
                if (!item.thumbnail) item.thumbnail = r2Url;
                else if (!item.thumbnail.includes('.r2.dev')) item.thumbnail = r2Url;
                skipped++;
            } else {
                // Add Te Papa base if missing
                let fetchUrl = original;
                if(fetchUrl.startsWith('/')) {
                   fetchUrl = 'https://collections.tepapa.govt.nz' + fetchUrl;
                }
                
                const buffer = await downloadImage(fetchUrl);
                
                // Convert to webp
                let webpBuffer; try { webpBuffer = await sharp(buffer).resize({ width: 1200, withoutEnlargement: true, fit: "inside" }).webp({ quality: 80 }).toBuffer(); } catch(err) { console.error("Sharp err:", err.message); throw new Error("Bad image buffer"); }

                await s3Client.send(new PutObjectCommand({
                    Bucket: R2_BUCKET_NAME,
                    Key: r2Key,
                    Body: webpBuffer,
                    ContentType: 'image/webp',
                    CacheControl: 'public, max-age=31536000, immutable'
                }));

                item.original_imageUrl = original;
                item.image_url = r2Url;
                item.image = r2Url;
                if (!item.thumbnail) item.thumbnail = r2Url;
                else if (!item.thumbnail.includes('.r2.dev')) item.thumbnail = r2Url;
                
                successes++;
                if (successes % 10 === 0) {
                    console.log(`[R2 Engine] Uploaded ${successes}/${itemsToUpload.length} (ID: ${item.id})`);
                    fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); // Save progress
                }
            }
        } catch (e) {
            errors++;
            console.error(`[R2 Engine] Error for ID ${item.id}: ${e.message}`);
        }

        await processNext();
    };

    const workers = [];
    for (let i = 0; i < MAX_CONCURRENT_UPLOADS; i++) {
        workers.push(processNext());
    }
    await Promise.all(workers);

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`[R2 Manager] Finished! ${successes} new uploads, ${skipped} skipped, ${errors} errors.`);
}

run();