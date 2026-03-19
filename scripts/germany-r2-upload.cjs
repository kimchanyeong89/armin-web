const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
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
  },
});

const FILES = ['hamburger-kunsthalle-drawings.json', 'hamburger-kunsthalle-video.json'];
const dataDir = path.join(__dirname, '../public/data');
const MAX_CONCURRENT = 10;

async function fetchImage(url) {
  return new Promise((resolve, reject) => {
    let target = url;
    if(target.startsWith('//')) target = 'https:' + target;
    if(!target.startsWith('http')) target = 'https://' + target;
    
    const client = target.startsWith('https') ? https : http;
    const req = client.get(target, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchImage(res.headers.location));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Status Code: ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function processItem(item, folderName) {
  let sourceUrl = item.image || item.imageUrl || item.thumb || item.imageURL || item.thumbnail || item.original_imageUrl;
  if (!sourceUrl || sourceUrl.includes('.r2.dev') || sourceUrl.includes('armin-r2')) return { r2: true };

  try {
    const buffer = await fetchImage(sourceUrl);
    const webpBuffer = await sharp(buffer).resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    
    const imageId = item.id || item.objectID || Date.now().toString();
    const key = `artworks/${folderName}/${imageId.replace(/\//g,'-')}-${Date.now().toString().slice(-4)}.webp`;
    
    await s3Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: webpBuffer,
      ContentType: 'image/webp',
    }));

    const r2Url = `${R2_PUBLIC_URL}/${key}`;
    if (item.imageUrl) item.imageUrl = r2Url;
    if (item.image) item.image = r2Url;
    
    return { r2: false, ok: true };
  } catch (error) {
    return { r2: false, ok: false, error: error.message };
  }
}

async function run() {
  for (let f of FILES) {
      const p = path.join(dataDir, f);
      if (!fs.existsSync(p)) continue;
      
      const folderName = f.replace('.json', '');
      let data = JSON.parse(fs.readFileSync(p));
      let items = Array.isArray(data) ? data : (data.objects || data.items || data.artworks || []);
      
      let toProcess = [];
      for(let i of items) {
          let url = i.image || i.imageUrl || i.thumb || i.imageURL || i.thumbnail || i.original_imageUrl;
          if(url && !url.includes('.r2.dev') && !url.includes('armin-r2')) {
              toProcess.push(i);
          }
      }
      
      console.log(`\nStarting upload for ${f} - ${toProcess.length} items to process...`);
      
      let success = 0, fail = 0;
      for (let i = 0; i < toProcess.length; i += MAX_CONCURRENT) {
          const chunk = toProcess.slice(i, i + MAX_CONCURRENT);
          const results = await Promise.all(chunk.map(item => processItem(item, folderName)));
          
          results.forEach(r => {
             if(r.ok) success++; else fail++;
          });
          
          console.log(`... [${Math.min(i + MAX_CONCURRENT, toProcess.length)}/${toProcess.length}] Success: ${success}, Fail: ${fail}`);
          
          // periodic save
          if (i % 100 === 0) {
              fs.writeFileSync(p, JSON.stringify(data, null, 2));
          }
      }
      
      fs.writeFileSync(p, JSON.stringify(data, null, 2));
      console.log(`Finished ${f}. Saved JSON.`);
  }
}

run();
