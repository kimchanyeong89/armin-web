/**
 * Fetch room cover images and info for Tate Britain displays
 * - Gets og:image (room cover image)
 * - Gets room description
 * - Gets location info
 * - Uploads cover images to R2 as WebP
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const sharp = require('sharp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = 'armin-gallery-images';
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
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
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: 'image/webp',
  });
  await s3Client.send(command);
  return `${R2_PUBLIC_URL}/${key}`;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function decodeHtmlEntities(text) {
  if (!text) return text;
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#8211;/g, '–')
    .replace(/&#8217;/g, "'");
}

async function getRoomInfo(roomUrl, displaySlug, roomIndex) {
  try {
    console.log(`  Fetching: ${roomUrl}`);
    const html = await fetch(roomUrl);
    
    // Get og:image (room cover)
    const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
                         html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i);
    const ogImage = ogImageMatch ? ogImageMatch[1] : null;
    
    // Get og:description
    const ogDescMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i) ||
                        html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
    const description = ogDescMatch ? decodeHtmlEntities(ogDescMatch[1]) : null;
    
    // Get location info (Room number, floor)
    // Pattern: "Tate Britain\nMain Floor Clore Gallery\nRoom 31"
    const locationMatch = html.match(/Tate Britain[^<]*(?:Main Floor|Lower Floor|Upper Floor)[^<]*(?:Gallery|Wing)[^<]*Room\s*\d+/i);
    let location = null;
    if (locationMatch) {
      location = locationMatch[0].replace(/\s+/g, ' ').trim();
    } else {
      // Try simpler pattern
      const roomMatch = html.match(/Room\s*\d+/i);
      if (roomMatch) {
        location = 'Tate Britain, ' + roomMatch[0];
      }
    }
    
    // Upload cover image to R2
    let coverImageUrl = null;
    if (ogImage) {
      try {
        const imgBuffer = await downloadImage(ogImage);
        const webpBuffer = await convertToWebP(imgBuffer);
        const key = `tate-britain/${displaySlug}/rooms/${roomIndex.toString().padStart(2, '0')}-cover.webp`;
        coverImageUrl = await uploadToR2(webpBuffer, key);
        console.log(`    ✓ Cover image uploaded`);
      } catch (e) {
        console.log(`    ⚠ Cover image failed: ${e.message}`);
        coverImageUrl = ogImage; // Use original URL as fallback
      }
    }
    
    return {
      coverImage: coverImageUrl,
      description: description,
      location: location
    };
  } catch (e) {
    console.error(`  ✗ Error: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log('=== Fetching Room Cover Images & Info ===\n');
  
  const mainPath = path.join(__dirname, '../public/data/tate-britain.json');
  const main = JSON.parse(fs.readFileSync(mainPath, 'utf8'));
  
  let totalRooms = 0;
  let totalUpdated = 0;
  
  for (const item of main.items) {
    if (!item.rooms || item.rooms.length === 0) continue;
    
    const displaySlug = item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    console.log(`\n📁 ${item.title}`);
    
    let roomIndex = 1;
    for (const room of item.rooms) {
      totalRooms++;
      
      if (room.url) {
        const info = await getRoomInfo(room.url, displaySlug, roomIndex);
        
        if (info) {
          if (info.coverImage) room.coverImage = info.coverImage;
          if (info.description) room.description = info.description;
          if (info.location) room.location = info.location;
          totalUpdated++;
        }
        
        await delay(500); // Rate limit
      }
      roomIndex++;
    }
  }
  
  // Save updated JSON
  fs.writeFileSync(mainPath, JSON.stringify(main, null, 2));
  
  console.log('\n=== Summary ===');
  console.log(`Total rooms: ${totalRooms}`);
  console.log(`Updated: ${totalUpdated}`);
  console.log(`\nSaved to ${mainPath}`);
}

main().catch(console.error);
