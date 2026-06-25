// Re-process National Gallery (UK) images: the original scrape square-cropped every
// image to 800×800. Re-fetch the full-ratio source (`originalImage`, nationalgallery.org.uk
// *-hd.jpg), resize preserving aspect ratio (no crop), re-upload to R2 at the SAME key so
// the app's image URLs are unchanged. Resumable.
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

const REPO = path.resolve('.');
dotenv.config({ path: path.join(REPO, '.env.local') });
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const COLL = 'public/data/national-gallery-permanent.json';
const STATE = 'scripts/.state/ng-reprocess-done.json';

const items = JSON.parse(fs.readFileSync(COLL, 'utf8')).items;
let done = new Set();
try { done = new Set(JSON.parse(fs.readFileSync(STATE, 'utf8'))); } catch {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, skip = 0, err = 0, n = 0;
console.log(`[ng-reprocess] ${items.length} items, ${done.size} already done`);
for (const it of items) {
  n++;
  if (!it.originalImage || !it.image) { skip++; continue; }
  const key = it.image.replace(/^https:\/\/pub-[^/]+\.r2\.dev\//, '');
  if (done.has(key)) { skip++; continue; }
  try {
    const res = await fetch(it.originalImage, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) Chrome/124' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    const webp = await sharp(buf).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: webp, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
    done.add(key); ok++;
  } catch (e) {
    err++;
    if (err <= 10) console.log(`  err ${key.slice(0, 40)}: ${String(e.message || e).slice(0, 40)}`);
  }
  if (n % 25 === 0) { fs.writeFileSync(STATE, JSON.stringify([...done])); console.log(`  ${n}/${items.length} ok=${ok} skip=${skip} err=${err}`); }
  await sleep(70);
}
fs.writeFileSync(STATE, JSON.stringify([...done]));
console.log(`[ng-reprocess] DONE ok=${ok} skip=${skip} err=${err}`);
