/**
 * Upload Art Around the Building cover images to R2 as WebP
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const sharp = require('sharp');

const DATA_FILE = path.join(__dirname, '../public/data/tate-britain.json');
const R2_BUCKET = 'armin-gallery-images';
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const ACCOUNT_ID = '6ce5ae60b244951ac36ffd277fd6ef76';
const API_TOKEN = 'EnnxTANrr9O6m6mCeEh303c0C723HERSQWq049Wx';

function fetchImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchImage(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function uploadToR2(key, buffer, contentType) {
  return new Promise((resolve, reject) => {
    const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${R2_BUCKET}/objects/${encodeURIComponent(key)}`;
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': contentType,
        'Content-Length': buffer.length
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(true);
        } else {
          reject(new Error(`Upload failed: ${res.statusCode} - ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const artAround = data.items.find(i => i.id === 'tate-britain-display-art-around-building');
  
  if (!artAround || !artAround.rooms) {
    console.error('Art Around the Building not found');
    return;
  }
  
  for (let i = 0; i < artAround.rooms.length; i++) {
    const room = artAround.rooms[i];
    if (!room.coverImage || room.coverImage.includes('r2.dev')) {
      console.log(`Skipping ${room.name} - no image or already on R2`);
      continue;
    }
    
    console.log(`Processing ${room.name}...`);
    try {
      const imgBuffer = await fetchImage(room.coverImage);
      console.log(`  Downloaded ${imgBuffer.length} bytes`);
      
      const webpBuffer = await sharp(imgBuffer)
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
      console.log(`  Converted to WebP: ${webpBuffer.length} bytes`);
      
      const key = `tate-britain/art-around-building/rooms/${String(i + 1).padStart(2, '0')}-cover.webp`;
      await uploadToR2(key, webpBuffer, 'image/webp');
      
      const newUrl = `${R2_PUBLIC_URL}/${key}`;
      room.coverImage = newUrl;
      console.log(`  Uploaded: ${newUrl}`);
    } catch (e) {
      console.error(`  Error: ${e.message}`);
    }
  }
  
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  console.log('\nDone!');
}

main().catch(console.error);
