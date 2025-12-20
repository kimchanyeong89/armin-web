/**
 * Add missing rooms (rooms without artworks but with cover images)
 * and fetch their info
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
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
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
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
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

async function getRoomInfo(roomUrl, displaySlug, roomIndex) {
  const fullUrl = roomUrl.startsWith('http') ? roomUrl : 'https://www.tate.org.uk' + roomUrl;
  console.log(`  Fetching: ${fullUrl}`);
  const html = await fetch(fullUrl);
  
  // Get og:title for room name
  const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
  let roomName = roomUrl.split('/').pop().replace(/-/g, ' ');
  if (ogTitleMatch) {
    roomName = ogTitleMatch[1]
      .replace(/\s*[–-]\s*Display at Tate Britain/i, '')
      .replace(/\s*\|\s*Tate.*$/i, '')
      .trim();
  }
  
  // Get og:image
  const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
  const ogImage = ogImageMatch ? ogImageMatch[1] : null;
  
  // Get og:description
  const ogDescMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
  const description = ogDescMatch ? ogDescMatch[1] : null;
  
  // Get location
  const roomMatch = html.match(/Room\s*\d+/i);
  const location = roomMatch ? 'Tate Britain, ' + roomMatch[0] : null;
  
  // Upload cover image
  let coverImageUrl = null;
  if (ogImage) {
    try {
      const imgBuffer = await downloadImage(ogImage);
      const webpBuffer = await convertToWebP(imgBuffer);
      const key = `tate-britain/${displaySlug}/rooms/${roomIndex.toString().padStart(2, '0')}-cover.webp`;
      coverImageUrl = await uploadToR2(webpBuffer, key);
      console.log(`    ✓ Cover uploaded`);
    } catch (e) {
      console.log(`    ⚠ Cover failed: ${e.message}`);
      coverImageUrl = ogImage;
    }
  }
  
  return {
    name: roomName,
    url: 'https://www.tate.org.uk' + (roomUrl.startsWith('/') ? roomUrl : '/' + roomUrl),
    coverImage: coverImageUrl,
    description: description,
    location: location,
    artworks: [] // Empty - no artworks in this room
  };
}

async function getAllRoomsFromDisplay(displayUrl) {
  const html = await fetch(displayUrl);
  const urlPath = new URL(displayUrl).pathname;
  const pattern = new RegExp(`href="(${urlPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^"]+)"`, 'g');
  const rooms = new Set();
  let m;
  while ((m = pattern.exec(html)) !== null) {
    rooms.add(m[1]);
  }
  return [...rooms];
}

async function main() {
  console.log('=== Adding Missing Rooms ===\n');
  
  const mainPath = path.join(__dirname, '../public/data/tate-britain.json');
  const main = JSON.parse(fs.readFileSync(mainPath, 'utf8'));
  
  const displays = [
    { title: 'JMW Turner', url: 'https://www.tate.org.uk/visit/tate-britain/display/jmw-turner' }
  ];
  
  for (const display of displays) {
    const item = main.items.find(i => i.title === display.title);
    if (!item) continue;
    
    console.log(`📁 ${display.title}`);
    
    // Get all rooms from website
    const allRoomUrls = await getAllRoomsFromDisplay(display.url);
    console.log(`  Found ${allRoomUrls.length} rooms on website`);
    
    // Find existing room URLs
    const existingUrls = new Set(item.rooms.map(r => {
      const url = r.url || '';
      return url.replace('https://www.tate.org.uk', '');
    }));
    
    // Find missing rooms
    const missingUrls = allRoomUrls.filter(url => !existingUrls.has(url));
    console.log(`  Missing: ${missingUrls.length} rooms`);
    
    // Add missing rooms
    const displaySlug = display.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    let roomIndex = item.rooms.length + 1;
    
    for (const roomUrl of missingUrls) {
      const roomInfo = await getRoomInfo(roomUrl, displaySlug, roomIndex);
      
      // Insert room in correct position based on room number
      const roomNum = roomInfo.location?.match(/Room\s*(\d+)/i)?.[1];
      if (roomNum) {
        // Find correct position
        let insertIndex = item.rooms.length;
        for (let i = 0; i < item.rooms.length; i++) {
          const existingNum = item.rooms[i].location?.match(/Room\s*(\d+)/i)?.[1];
          if (existingNum && parseInt(roomNum) < parseInt(existingNum)) {
            insertIndex = i;
            break;
          }
        }
        item.rooms.splice(insertIndex, 0, roomInfo);
      } else {
        item.rooms.push(roomInfo);
      }
      
      console.log(`  Added: ${roomInfo.name} (${roomInfo.location || 'no location'})`);
      roomIndex++;
      await delay(500);
    }
  }
  
  fs.writeFileSync(mainPath, JSON.stringify(main, null, 2));
  
  // Summary
  console.log('\n=== Summary ===');
  for (const item of main.items) {
    if (item.rooms) {
      let artCount = 0;
      item.rooms.forEach(r => artCount += (r.artworks || []).length);
      console.log(`${item.title}: ${item.rooms.length} rooms, ${artCount} artworks`);
    }
  }
  
  console.log('\nSaved!');
}

main().catch(console.error);
