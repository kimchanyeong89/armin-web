const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function ensurePLimit() {
  const m = await import('p-limit');
  return m.default;
}

require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  }
});
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';

async function downloadImage(url) {
  const res = await axios({ url, responseType: 'arraybuffer', timeout: 25000, maxRedirects: 5, headers: { 'User-Agent': 'Mozilla/5.0' }});
  return res.data;
}

async function upload(file, prefix, urlField, nestedArray = false) {
  console.log(`\n\nStarting ${prefix}...`);
  const dataPath = path.join(__dirname, '../public/data', file);
  if (!fs.existsSync(dataPath)) {
     console.log(`File ${file} does not exist. Skipping.`);
     return;
  }
  let data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  let items = nestedArray ? data.artworks : data;
  
  const pLimit = await ensurePLimit();
  const limit = pLimit(5);
  let processed = 0, uploaded = 0, failed = 0, cached = 0;
  
  const tasks = items.map(item => limit(async () => {
    let originalUrl = item[urlField] || item.original_image;
    if (nestedArray && urlField === 'images' && item.images && item.images.length > 0) {
      originalUrl = item.images[0].url;
    }
    
    if (item.image && item.image.startsWith(R2_PUBLIC_URL)) {
      processed++;
      cached++;
      return;
    }
    if (!originalUrl) {
      processed++;
      failed++;
      return;
    }
    
    if (urlField === 'imageUrl' && !originalUrl.startsWith('http')) {
       originalUrl = 'http://www.dumoak.co.kr' + originalUrl;
    }
    
    let objId = item.id;
    if (nestedArray || !item.id) {
       let safeTitle = (item.title || "untitled").replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
       objId = safeTitle + '-' + Math.random().toString(36).substr(2, 5);
       if (!item.id) item.id = objId;
    }
    
    try {
      const r2Key = `artworks/${prefix}/${objId}-image.webp`;
      const buf = await downloadImage(originalUrl);
      const webp = await sharp(buf).webp({ quality: 80 }).toBuffer();
      
      await s3.send(new PutObjectCommand({
        Bucket: 'armin-gallery-images',
        Key: r2Key,
        Body: webp,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000'
      }));
      
      item.original_image = originalUrl;
      item.image = `${R2_PUBLIC_URL}/${r2Key}`;
      uploaded++;
    } catch (e) {
      // console.error(`Failed ${objId}: ${e.message}`);
      failed++;
    }
    processed++;
    if (processed % 10 === 0) {
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
      process.stdout.write(`\r${prefix}: ${processed}/${items.length} (up: ${uploaded}, skip: ${cached}, fail: ${failed})`);
    }
  }));

  await Promise.all(tasks);
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  console.log(`\nDone ${prefix}: total ${processed} items.`);
}

async function run() {
  await upload('pushkin-paintings.json', 'pushkin-collection', 'image');
  await upload('dumoak-kim-work-all.json', 'dumoak-collection', 'imageUrl');
  await upload('guggenheim-bilbao-collection.json', 'guggenheim-bilbao-collection', 'images', true);
}
run();