#!/usr/bin/env node
/**
 * Upload Tate St Ives artwork images to Cloudflare R2
 * Input: downloads/tate-st-ives-artworks.json
 * Output: public/data/tate-st-ives-artworks.json (with R2 URLs)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import got from 'got';
import pLimit from 'p-limit';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const INPUT_FILE = path.join(__dirname, '../downloads/tate-st-ives-artworks.json');
const OUTPUT_FILE = path.join(__dirname, '../public/data/tate-st-ives-artworks.json');

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '6ce5ae60b244951ac36ffd277fd6ef76';
const R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';

const CONCURRENCY = 5;

// Initialize R2 client
const r2 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY,
    secretAccessKey: R2_SECRET_KEY,
  },
});

async function downloadImage(url) {
  try {
    const response = await got(url, {
      responseType: 'buffer',
      timeout: { request: 30000 },
      retry: { limit: 2 },
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    return response.body;
  } catch (e) {
    console.warn(`Failed to download: ${url}`, e.message);
    return null;
  }
}

async function uploadToR2(buffer, key, contentType = 'image/jpeg') {
  try {
    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));
    return `${R2_PUBLIC_URL}/${key}`;
  } catch (e) {
    console.error(`Failed to upload to R2: ${key}`, e.message);
    return null;
  }
}

async function processArtwork(artwork, index, total) {
  const accession = artwork.accession.toLowerCase();
  const r2Key = `galleries/tate-st-ives/artworks/${accession}.jpg`;
  
  // Download image
  const buffer = await downloadImage(artwork.image);
  if (!buffer) {
    console.log(`[${index + 1}/${total}] ❌ ${artwork.title} - download failed`);
    return { ...artwork, r2Image: null };
  }
  
  // Upload to R2
  const r2Url = await uploadToR2(buffer, r2Key);
  if (!r2Url) {
    console.log(`[${index + 1}/${total}] ❌ ${artwork.title} - upload failed`);
    return { ...artwork, r2Image: null };
  }
  
  console.log(`[${index + 1}/${total}] ✓ ${artwork.title}`);
  return { ...artwork, image: r2Url };
}

async function main() {
  // Check R2 credentials
  if (!R2_ACCESS_KEY || !R2_SECRET_KEY) {
    console.error('Missing R2 credentials. Set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY environment variables.');
    process.exit(1);
  }
  
  // Load artworks
  const artworks = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  console.log(`Processing ${artworks.length} artworks...\n`);
  
  // Process with concurrency
  const limit = pLimit(CONCURRENCY);
  const results = await Promise.all(
    artworks.map((artwork, i) => 
      limit(() => processArtwork(artwork, i, artworks.length))
    )
  );
  
  // Filter successful uploads
  const successful = results.filter(r => r.image && r.image.includes('r2.dev'));
  const failed = results.filter(r => !r.image || !r.image.includes('r2.dev'));
  
  console.log(`\n✓ Successfully processed: ${successful.length}/${artworks.length}`);
  if (failed.length > 0) {
    console.log(`✗ Failed: ${failed.length}`);
  }
  
  // Save to output file
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(successful, null, 2));
  console.log(`\nSaved to ${OUTPUT_FILE}`);
}

main().catch(console.error);
