#!/usr/bin/env node
/**
 * Upload Wallace Collection images to Cloudflare R2
 * Source: public/data/wallace-collection.json (nested: rooms[].artworks[])
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: '.env.local' });

const sharp = (() => { try { return require('sharp'); } catch { return null; } })();

const BUCKET = 'armin-gallery-images';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const PREFIX = 'artworks/wallace-collection';
const JSON_FILE = path.join(__dirname, '../public/data/wallace-collection.json');
const CONCURRENCY = 4;
const SAVE_EVERY = 50;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

function makeId(str) {
  return String(str).replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 120);
}

function downloadBuffer(url, referer = 'https://wallacelive.wallacecollection.org/') {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': referer,
        'Accept': 'image/webp,image/*,*/*;q=0.8',
      },
      timeout: 30000,
    };
    const req = lib.get(url, opts, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadBuffer(res.headers.location, referer).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
  });
}

async function fileExistsInR2(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (e) {
    if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) return false;
    throw e;
  }
}

async function uploadFile(imgUrl, key) {
  try {
    const buf = await downloadBuffer(imgUrl);
    let webp;
    if (sharp) {
      webp = await sharp(buf)
        .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
    } else {
      webp = buf;
    }
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: webp,
      ContentType: sharp ? 'image/webp' : 'image/jpeg',
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    return true;
  } catch (e) {
    return e.message;
  }
}

async function run() {
  const data = JSON.parse(fs.readFileSync(JSON_FILE, 'utf-8'));

  // Flatten rooms → artworks
  const allItems = [];
  for (const room of data.rooms || []) {
    for (const artwork of room.artworks || []) {
      artwork._roomId = room.id;
      artwork._roomName = room.name;
      allItems.push(artwork);
    }
  }

  console.log(`Total Wallace items: ${allItems.length}`);

  const todo = allItems.filter(item => {
    const img = item.image || '';
    return img && !img.includes('r2.dev');
  });

  console.log(`Items to upload: ${todo.length}`);

  let uploaded = 0, skipped = 0, errors = 0;
  const saveData = () => fs.writeFileSync(JSON_FILE, JSON.stringify(data, null, 2));

  const queue = [...todo];
  let active = 0;
  let done = 0;

  await new Promise((resolve) => {
    function next() {
      while (active < CONCURRENCY && queue.length > 0) {
        const item = queue.shift();
        active++;
        (async () => {
          const id = item.id || item.collectionId || `item-${done}`;
          const safeId = makeId(id);
          const key = `${PREFIX}/${safeId}-image.webp`;

          const exists = await fileExistsInR2(key);
          if (exists) {
            item.original_image = item.image;
            item.image = `${R2_PUBLIC}/${key}`;
            skipped++;
          } else {
            const result = await uploadFile(item.image, key);
            if (result === true) {
              item.original_image = item.image;
              item.image = `${R2_PUBLIC}/${key}`;
              uploaded++;
            } else {
              console.error(`  ERR [${id}]: ${result}`);
              errors++;
            }
          }

          done++;
          if (done % SAVE_EVERY === 0) {
            saveData();
            console.log(`  [${done}/${todo.length}] uploaded=${uploaded} skipped=${skipped} errors=${errors}`);
          }
          active--;
          if (queue.length === 0 && active === 0) resolve();
          else next();
        })();
      }
      if (queue.length === 0 && active === 0) resolve();
    }
    next();
  });

  saveData();
  console.log(`\nDone! uploaded=${uploaded} skipped=${skipped} errors=${errors}`);
}

run().catch(console.error);
