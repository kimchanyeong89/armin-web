#!/usr/bin/env node
/**
 * Upload missing Tate St Ives artwork images to Cloudflare R2
 * Tries multiple image size variants (_10, _9, _8, _7)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import got from 'got';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const DOWNLOADS_FILE = path.join(__dirname, '../downloads/tate-st-ives-artworks.json');
const OUTPUT_FILE = path.join(__dirname, '../public/data/tate-st-ives-artworks.json');

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '6ce5ae60b244951ac36ffd277fd6ef76';
const R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';

if (!R2_ACCESS_KEY || !R2_SECRET_KEY) {
  console.error('Missing R2 credentials. Set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY in .env.local');
  process.exit(1);
}

const r2 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY,
    secretAccessKey: R2_SECRET_KEY,
  },
});

// Missing artwork IDs
const MISSING_IDS = [
  'tate-t00352', 'tate-t00649', 'tate-t00752', 'tate-t00956', 'tate-t00959',
  'tate-t01541', 'tate-t01759', 'tate-t01906', 'tate-t02313', 'tate-t03133',
  'tate-t03140', 'tate-t03155', 'tate-t03324', 'tate-t03700', 'tate-t03851',
  'tate-t06894', 'tate-t06980', 'tate-t07448', 'tate-t07623', 'tate-t14902',
  'tate-t15019', 'tate-t15121', 'tate-t15724'
];

async function downloadWithFallback(baseUrl) {
  // Try different size variants: _10, _9, _8, _7
  const sizes = ['10', '9', '8', '7'];
  
  for (const size of sizes) {
    const url = baseUrl.replace(/_\d+\.jpg$/, `_${size}.jpg`);
    try {
      const response = await got(url, {
        responseType: 'buffer',
        timeout: { request: 30000 },
        retry: { limit: 1 },
        headers: {
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });
      console.log(`  ✓ Found at size ${size}`);
      return { buffer: response.body, url };
    } catch (e) {
      // Continue to next size
    }
  }
  return null;
}

async function uploadToR2(buffer, key, contentType = 'image/jpeg') {
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return `${R2_PUBLIC_URL}/${key}`;
}

async function main() {
  const allArtworks = JSON.parse(fs.readFileSync(DOWNLOADS_FILE, 'utf-8'));
  const existingArtworks = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
  
  const missingArtworks = allArtworks.filter(a => MISSING_IDS.includes(a.id));
  console.log(`Processing ${missingArtworks.length} missing artworks...`);
  
  const newlyUploaded = [];
  
  for (let i = 0; i < missingArtworks.length; i++) {
    const artwork = missingArtworks[i];
    console.log(`[${i + 1}/${missingArtworks.length}] ${artwork.title}`);
    
    const result = await downloadWithFallback(artwork.image);
    if (!result) {
      console.log(`  ✗ All sizes failed`);
      continue;
    }
    
    const accession = artwork.accession.toLowerCase();
    const key = `galleries/tate-st-ives/artworks/${accession}.jpg`;
    
    try {
      const publicUrl = await uploadToR2(result.buffer, key);
      newlyUploaded.push({
        ...artwork,
        image: publicUrl,
        scrapedAt: new Date().toISOString()
      });
      console.log(`  ✓ Uploaded`);
    } catch (e) {
      console.log(`  ✗ Upload failed: ${e.message}`);
    }
  }
  
  // Merge with existing
  const merged = [...existingArtworks, ...newlyUploaded];
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(merged, null, 2));
  
  console.log(`\n✓ Added ${newlyUploaded.length} artworks`);
  console.log(`✓ Total: ${merged.length} artworks`);
  console.log(`Saved to ${OUTPUT_FILE}`);
}

main().catch(console.error);
