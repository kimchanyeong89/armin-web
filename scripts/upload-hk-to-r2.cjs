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
    // Determine HTTP or HTTPS
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
        return reject(new Error(`Failed to download image, status code: ${response.statusCode}`));
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

async function processCollection(collectionName) {
    const filename = `hamburger-kunsthalle-${collectionName}.json`;
    console.log(`\n\n=== Processing ${filename} ===`);
    const filePath = path.join(__dirname, '../public/data', filename);
    if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${filename}`);
        return;
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const items = data.artworks || data.objects || data;
    let successes = 0, errors = 0, skipped = 0;

    // Filter items to upload
    const itemsToUpload = [];
    
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.imageUrl) continue;
        
        let original = item.original_imageUrl || item.thumbnailUrl || "";
        
        // If image is already an R2 link
        if (item.imageUrl.includes('pub-396fad1f96754c2f816f260faf970e63.r2.dev')) {
            skipped++;
            continue;
        }

        // We know they are wrapped in wsrv.nl or raw
        if (item.imageUrl.includes('wsrv.nl/?url=')) {
            original = decodeURIComponent(item.imageUrl.split('wsrv.nl/?url=')[1].split('&')[0]);
        } else if (!original) {
            original = item.imageUrl;
        }

        const safeId = item.id.replace(/[^a-zA-Z0-9_-]/g, '');
        const r2Key = `artworks/hamburger-kunsthalle-${collectionName}/${safeId}-imageUrl.webp`;
        const r2Url = `${R2_PUBLIC_URL}/${r2Key}`;

        itemsToUpload.push({ item, index: i, original, r2Key, r2Url });
    }

    console.log(`Found ${itemsToUpload.length} items to upload out of ${items.length} (skipped ${skipped})`);

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
                item.imageUrl = r2Url;
                skipped++;
            } else {
                // Download using wsrv.nl to bypass Anubis
                const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(original)}`;
                const buffer = await downloadImage(proxyUrl);
                
                // Convert to webp
                const webpBuffer = await sharp(buffer)
                    .resize({ width: 1200, withoutEnlargement: true, fit: 'inside' })
                    .webp({ quality: 80 })
                    .toBuffer();

                await s3Client.send(new PutObjectCommand({
                    Bucket: R2_BUCKET_NAME,
                    Key: r2Key,
                    Body: webpBuffer,
                    ContentType: 'image/webp',
                    CacheControl: 'public, max-age=31536000, immutable'
                }));

                item.original_imageUrl = original;
                item.imageUrl = r2Url;
                successes++;
                if (successes % 20 === 0) {
                    console.log(`[${collectionName}] Uploaded ${successes}/${itemsToUpload.length}`);
                    fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); // Save progress
                }
            }
        } catch (e) {
            errors++;
            console.error(`[${collectionName}] Error for ${item.id}: ${e.message}`);
        }

        await processNext();
    };

    const workers = [];
    for (let i = 0; i < MAX_CONCURRENT_UPLOADS; i++) {
        workers.push(processNext());
    }
    await Promise.all(workers);

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Finished ${collectionName}: ${successes} uploaded, ${skipped} skipped (total/existing), ${errors} errors.`);
}

async function run() {
    await processCollection('paintings');
    await processCollection('drawings');
    await processCollection('video');
    console.log('All collections processed!');
}

run();
