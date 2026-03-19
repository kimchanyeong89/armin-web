#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  }
});
const MAX_CONCURRENT_UPLOADS = 5;

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redir = res.headers.location;
        if (!redir.startsWith('http')) redir = new URL(redir, url).toString();
        return downloadImage(redir).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP '+res.statusCode));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function generateCacheKey(url) {
  return require('crypto').createHash('md5').update(url).digest('hex').substring(0, 8);
}

async function checkExists(key) {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: 'armin-gallery-images', Key: key }));
    return true;
  } catch (error) {
    if (error.name === 'NotFound') return false;
    throw error;
  }
}

async function processCollection(name, file) {
  let data = JSON.parse(fs.readFileSync(file, 'utf8'));
  let index = 0, success = 0;
  async function worker() {
    while (index < data.length) {
      const i = index++;
      const item = data[i];
      let imgUrl = item.original_image || item.image;
      if (!imgUrl || imgUrl.includes('.r2.dev') || imgUrl.includes('.r2.cloudflarestorage')) continue;
      
      const safeId = (item.id || 'item-'+i).replace(/[^a-zA-Z0-9_\-]/g, '_');
      const hash = generateCacheKey(imgUrl);
      const r2Key = `artworks/${name}/${safeId}-${hash}-image.webp`;
      try {
        if (await checkExists(r2Key)) { item.image = `https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/${r2Key}`; continue; }
        const buf = await downloadImage(imgUrl);
        let webpBuf; try { webpBuf = await sharp(buf).webp({ quality: 80 }).toBuffer(); } catch(e) { webpBuf = buf; }
        await s3Client.send(new PutObjectCommand({ Bucket: 'armin-gallery-images', Key: r2Key, Body: webpBuf, ContentType: 'image/webp' }));
        item.image = `https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/${r2Key}`;
        success++;
        console.log(`[R2] Uploaded ${safeId}`);
      } catch (err) {
        console.log(`[Error] ${safeId}: ${err.message}`);
      }
      if (success % 10 === 0) fs.writeFileSync(file, JSON.stringify(data, null, 2));
    }
  }
  await Promise.all(Array(MAX_CONCURRENT_UPLOADS).fill(0).map(() => worker()));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(name + ' Done.');
}
processCollection('nasjonal-collection', 'public/data/nasjonal-collection.json').catch(console.error);
