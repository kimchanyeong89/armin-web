const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const [,, jsonFilename, prefixName] = process.argv;
if (!jsonFilename || !prefixName) { process.exit(1); }

const R2_BUCKET = 'armin-gallery-images';
const s3 = new S3Client({
  region: 'auto', endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY }
});

const filePath = path.join(__dirname, '../public/data', jsonFilename);
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const arr = Array.isArray(data) ? data : (data.objects || data.artworks || data.items || data._data || []);

let reqCount = 0;

async function exists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true; 
  } catch(e) { return false; }
}

async function uploadFile(url, key) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const headers = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36' };
    if (url.includes('grandpalaisrmn.fr')) headers['Referer'] = 'https://art.rmngp.fr/';
    
    const req = mod.get(url, { headers }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return uploadFile(res.headers.location, key).then(resolve).catch(reject);
      }
      const isOk = res.statusCode === 200 || 
                   (res.statusCode === 403 && res.headers['content-type'] && res.headers['content-type'].startsWith('image/'));
      if (!isOk) return resolve(false);
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', async () => {
        try {
          const buf = Buffer.concat(chunks);
          const webp = await sharp(buf).resize(1600, 1600, {fit:'inside', withoutEnlargement:true}).webp({quality:80}).toBuffer();
          await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: webp, ContentType: 'image/webp' }));
          resolve(true);
        } catch(e) { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(15000, () => { req.destroy(); resolve(false); });
  });
}

function delay(ms) {
    return new Promise(res => setTimeout(res, ms));
}

async function run() {
  let done = 0, skipped = 0, err = 0;
  for (let i=0; i<arr.length; i++) {
    const it = arr[i];
    if (JSON.stringify(it).includes('r2.dev')) {
      skipped++;
      if (i % 50 === 0 && i>0) console.log(`[${prefixName}] :: Uploaded ${done}, Skipped ${skipped}, Err ${err} (Total ${i}/${arr.length})`);
      continue;
    }
    
    let imgUrl = it.image || it.image_url || it.imageUrl || it.primaryImage || it.webImage || it.url;
    if (imgUrl && typeof imgUrl === 'object' && imgUrl.iiifUrl) {
      imgUrl = imgUrl.iiifUrl;
      if (!imgUrl.endsWith('.jpg') && !imgUrl.endsWith('.png')) imgUrl += '/full/max/0/default.jpg';
    } else if (imgUrl && typeof imgUrl === 'string' && imgUrl.includes('IIIF3') && !imgUrl.includes('/full/')) {
      imgUrl += '/full/max/0/default.jpg';
    }
    if (!imgUrl && it.images && it.images[0]) imgUrl = it.images[0].url || it.images[0].src;
    if (!imgUrl || !imgUrl.startsWith('http')) { err++; continue; }
    
    let rawId = (it.id || it.objectID || it.objectNumber || (it.metadata && it.metadata['Inventory number']) || `item-${i}`).toString().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const key = `${prefixName}/${rawId}.webp`;

    if (await exists(key)) { 
      skipped++; 
      if (!JSON.stringify(it).includes('r2.dev')) { it.image = `https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/${key}`; }
    }
    else {
      const ok = await uploadFile(imgUrl, key);
      if (ok) { 
        done++; console.log(`[${i+1}/${arr.length}] OK: ${key}`);
        it.image = `https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/${key}`;
      }
      else { err++; console.log(`[${i+1}/${arr.length}] ERR: ${imgUrl}`); }
      reqCount++;
      if (reqCount % 10 === 0) {
          await delay(200);
      }
    }
    
    if (i % 50 === 0 && i>0) console.log(`[${prefixName}] :: Uploaded ${done}, Skipped ${skipped}, Err ${err} (Total ${i}/${arr.length})`);
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`[${prefixName}] Finished! Done:${done} Skip:${skipped} Err:${err}. Saved JSON.`);
}

run();
