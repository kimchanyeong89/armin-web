/**
 * Add cover images to Tate Modern Display exhibitions
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
const R2_BUCKET = 'armin-gallery-images';
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const TATE_MODERN_FILE = path.join(__dirname, '../public/data/tate-modern.json');

// Cover images for each display - matching the Tate website what's on page thumbnails
// Uses the highlight artwork images that Tate shows on their display listing pages
const COVER_IMAGES = {
  // Artist and Society: Lucio Fontana - Spatial Concept 'Waiting' (gold frame with slash)
  'display-artist-and-society': 'https://media.tate.org.uk/art/images/work/T/T00/T00694_9.jpg',
  // In the Studio: Georges Braque - Clarinet and Bottle of Rum on a Mantelpiece (cubist drawing)
  'display-in-the-studio': 'https://media.tate.org.uk/art/images/work/T/T02/T02318_10.jpg',
  // Materials and Objects: Marcel Duchamp - Fountain (urinal)
  'display-materials-and-objects': 'https://media.tate.org.uk/art/images/work/T/T07/T07573_10.jpg',
  // Media Networks: Roy Lichtenstein - Whaam! (comic panel)
  'display-media-networks': 'https://media.tate.org.uk/art/images/work/T/T00/T00897_10.jpg',
  // Performer and Participant: Pipilotti Rist - Lungenflügel (colorful installation)
  'display-performer-and-participant': 'https://media.tate.org.uk/art/images/work/T/T16/T16113_10.jpg',
  // Tanks: Gallery/staircase photo of visitors
  'display-tanks': 'https://media.tate.org.uk/aztate-prd-ew-dg-wgtail-st1-ctr-data/images/tanks_staircase_tate_modern_1_W3VMCQj.width-600.jpg',
  // Artist Rooms Richard Long: Red Slate Circle artwork
  'display-artist-rooms-richard-long': 'https://media.tate.org.uk/art/images/work/T/T01/T01720_9.jpg'
};

async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
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

async function uploadToR2(buffer, key) {
  const webpBuffer = await sharp(buffer)
    .resize(800, 600, { fit: 'cover' })
    .webp({ quality: 85 })
    .toBuffer();
  
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: webpBuffer,
    ContentType: 'image/webp',
  });
  
  await s3Client.send(command);
  return `${R2_PUBLIC_URL}/${key}`;
}

async function main() {
  console.log('=== Updating cover images for Tate Modern Displays ===\n');
  
  const data = JSON.parse(fs.readFileSync(TATE_MODERN_FILE, 'utf-8'));
  
  for (const [displayId, imageUrl] of Object.entries(COVER_IMAGES)) {
    const display = data.items.find(it => it.id === displayId);
    if (!display) {
      console.log(`Display ${displayId} not found`);
      continue;
    }
    
    console.log(`Processing: ${display.title}...`);
    console.log(`  Source: ${imageUrl.substring(0, 80)}...`);
    
    try {
      const buffer = await downloadImage(imageUrl);
      const r2Key = `tate-modern/${displayId}/cover.webp`;
      const r2Url = await uploadToR2(buffer, r2Key);
      
      // Update both image and coverImage fields
      display.image = r2Url;
      display.coverImage = r2Url;
      console.log(`  Uploaded: ${r2Url}`);
    } catch (e) {
      console.log(`  Error: ${e.message}`);
      // Use first artwork image as fallback
      if (display.rooms && display.rooms[0]?.artworks?.[0]?.image) {
        const fallback = display.rooms[0].artworks[0].image;
        display.image = fallback;
        display.coverImage = fallback;
        console.log(`  Using first artwork as cover: ${fallback}`);
      }
    }
  }
  
  fs.writeFileSync(TATE_MODERN_FILE, JSON.stringify(data, null, 2));
  console.log('\nSaved to tate-modern.json');
}

main().catch(console.error);
