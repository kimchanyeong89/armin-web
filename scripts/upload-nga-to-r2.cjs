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

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const request = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadImage(url.startsWith('http') && !response.headers.location.startsWith('http') ? new URL(response.headers.location, url).href : response.headers.location).then(resolve).catch(reject);
      }
      
      if (response.statusCode < 200 || response.statusCode >= 300) {
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
    if (error.name === 'NotFound') return false;
    return false;
  }
}

async function start() {
    const filePath = path.join(__dirname, '../public/data', 'nga-collection.json');
    if (!fs.existsSync(filePath)) {
        console.log(`File not found: nga-collection.json`);
        return;
    }

    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const data = Array.isArray(parsed) ? parsed : (parsed.items || parsed.artworks || []);
    let successes = 0, errors = 0, skipped = 0;

    const itemsToUpload = [];
    
    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        let targetUrl = item.image_url || item.imageUrl || item.image || item.thumbnail || item.primaryImage || item.original_imageUrl || item.iiifFull || item.iiifUrl || item.iiifurl || "";
        
        // Custom fallbacks if needed
        if (!targetUrl && item.images && item.images.length > 0) targetUrl = item.images[0].url || item.images[0];
        
        if (!targetUrl || typeof targetUrl !== 'string') continue;
        
        let original = item.original_imageUrl || targetUrl;
        
        if (targetUrl.includes('.r2.dev') || targetUrl.includes('r2.cloudflarestorage')) {
            skipped++;
            continue;
        }

        const fallbackId = item.id ? String(item.id) : `${i}`;
        const safeId = fallbackId.replace(/[^a-zA-Z0-9_-]/g, '');
        const r2Key = `artworks/nga-collection/${safeId}-image.webp`;
        const r2Url = `${R2_PUBLIC_URL}/${r2Key}`;

        itemsToUpload.push({ item, index: i, original, r2Key, r2Url });
    }

    console.log(`[R2 Manager] Found ${itemsToUpload.length} items to upload to R2 (already skipped ${skipped} R2 valid items).`);
    
    let currentIndex = 0;
    const processNext = async () => {
        if (currentIndex >= itemsToUpload.length) return;
        const current = itemsToUpload[currentIndex++];
        const { item, original, r2Key, r2Url } = current;

        try {
            const exists = await fileExistsInR2(r2Key);
            if (exists) {
                if(!item.original_imageUrl) item.original_imageUrl = original;
                item.image_url = r2Url;
                item.image_url = r2Url;
                if(item.image_url) item.image_url = r2Url;
                if(item.imageUrl) item.imageUrl = r2Url;
                if(item.image) item.image = r2Url; if(item.iiifFull) item.iiifFull = r2Url; if(item.iiifUrl) item.iiifUrl = r2Url; if(item.iiifurl) item.iiifurl = r2Url;
                if(item.primaryImage) item.primaryImage = r2Url;
                if(item.primaryImage) item.primaryImage = r2Url;
                if(item.thumbnail && !item.thumbnail.includes('.r2')) item.thumbnail = r2Url;
                skipped++;
            } else {
                let fetchUrl = original;
                // Add host if missing based on slug
                if(fetchUrl.startsWith('/')) {
                   if('nga-collection'.includes('famsf')) fetchUrl = 'https://www.famsf.org' + fetchUrl;
                   else if('nga-collection'.includes('lacma')) fetchUrl = 'https://collections.lacma.org' + fetchUrl;
                   else fetchUrl = 'https://' + fetchUrl;
                   // Just blind guess or skip, ideally we know the host
                }
                
                const buffer = await downloadImage(fetchUrl);
                
                let webpBuffer; 
                try { 
                    webpBuffer = await sharp(buffer).resize({ width: 1200, withoutEnlargement: true, fit: "inside" }).webp({ quality: 80 }).toBuffer(); 
                } catch(err) { 
                    throw new Error("Bad image buffer"); 
                }
                
                await s3Client.send(new PutObjectCommand({
                    Bucket: R2_BUCKET_NAME,
                    Key: r2Key,
                    Body: webpBuffer,
                    ContentType: 'image/webp',
                    CacheControl: 'public, max-age=31536000, immutable'
                }));

                if(!item.original_imageUrl) item.original_imageUrl = original;
                item.image_url = r2Url;
                item.image_url = r2Url;
                if(item.image_url) item.image_url = r2Url;
                if(item.imageUrl) item.imageUrl = r2Url;
                if(item.image) item.image = r2Url; if(item.iiifFull) item.iiifFull = r2Url; if(item.iiifUrl) item.iiifUrl = r2Url; if(item.iiifurl) item.iiifurl = r2Url;
                if(item.primaryImage) item.primaryImage = r2Url;
                if(item.primaryImage) item.primaryImage = r2Url;
                if(item.thumbnail && !item.thumbnail.includes('.r2')) item.thumbnail = r2Url;
                
                successes++;
                console.log(`[R2 Engine] Uploaded ${successes}/${itemsToUpload.length} (ID: ${item.id || current.index})`);
            }
        } catch (e) {
            errors++;
        }

        // Save periodically
        if (successes > 0 && successes % 20 === 0) {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        }

        await processNext();
    };

    const CONCURRENCY = 5;
    const workers = [];
    for (let i = 0; i < CONCURRENCY; i++) {
        workers.push(processNext());
    }
    await Promise.all(workers);

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`[R2 Manager] Finished! ${successes} new uploads, ${skipped} skipped, ${errors} errors.`);
}

start();
