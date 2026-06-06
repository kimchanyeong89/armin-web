#!/usr/bin/env node
// Re-process a collection's R2 images through autocrop (remove studio backdrop +
// colour-charts), re-uploading ONLY the ones that actually crop. Paintings that fill
// the frame are no-ops (left untouched). White-paper works with non-uniform corners
// are skipped by the safety gate.
//
// Usage:
//   node scripts/reprocess-images.mjs <slug>           # dry-run: shrink distribution
//   node scripts/reprocess-images.mjs <slug> --apply   # re-upload cropped images
//   node scripts/reprocess-images.mjs <slug> --apply --sample=20   # cap for testing

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { autocropToWebp } from './lib/autocrop.mjs';

const require = createRequire(import.meta.url);
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(fileURLToPath(import.meta.url), '../../.env.local') });

const args = process.argv.slice(2);
const slug = args.find(a => !a.startsWith('--'));
const APPLY = args.includes('--apply');
const sampleArg = args.find(a => a.startsWith('--sample='));
const SAMPLE = sampleArg ? Number(sampleArg.split('=')[1]) : null;
const CONC = 5;
if (!slug) { console.error('usage: reprocess-images.mjs <slug> [--apply] [--sample=N]'); process.exit(1); }

const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
const cand1 = path.join(REPO, 'public/data', `${slug}-collection.json`);
const cand2 = path.join(REPO, 'public/data', `${slug}.json`);
const JSON_PATH = fs.existsSync(cand1) ? cand1 : cand2;
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const s3 = new S3Client({
  region: 'auto', endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const UA = 'armin-museum-research/1.0';

const keyOf = (url) => { const p = url.split('.r2.dev/')[1]; return p ? p.split('?')[0] : undefined; };

async function dl(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function pool(items, fn, c) {
  let i = 0; const out = [];
  await Promise.all(Array.from({ length: c }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  }));
  return out;
}

async function main() {
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  let arr = data.artworks;
  if (SAMPLE) arr = arr.slice(0, SAMPLE);
  console.log(`[reprocess] ${slug}: ${arr.length} images, mode=${APPLY ? 'APPLY' : 'dry-run'}`);

  let cropped = 0, noop = 0, refused = 0, skipped = 0, err = 0, done = 0;
  const shrinks = [];

  await pool(arr, async (a) => {
    const url = a.imageUrl;
    const key = keyOf(url);
    if (!key) { skipped++; return; }
    try {
      const src = await dl(url);
      const r = await autocropToWebp(src);
      if (r.cropped) {
        if (APPLY) {
          let ok = false;
          for (let att = 1; att <= 4 && !ok; att++) {
            try { await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: r.buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' })); ok = true; }
            catch (e) { if (att === 4) { err++; if (err <= 3) console.log('  PUT err:', e.name, e.message); } else await new Promise(r => setTimeout(r, 400 * att)); }
          }
          if (ok) { cropped++; shrinks.push(Math.round(r.shrink * 100)); }
        } else { cropped++; shrinks.push(Math.round(r.shrink * 100)); }
      } else if (/refused/.test(r.reason)) refused++;
      else if (/non-uniform/.test(r.reason)) skipped++;
      else noop++;
    } catch (e) { err++; if (err <= 3) console.log('  proc err:', e.name, e.message); }
    if (++done % 100 === 0) console.log(`  …${done}/${arr.length} (cropped ${cropped})`);
  }, CONC);

  shrinks.sort((a, b) => a - b);
  const med = shrinks.length ? shrinks[shrinks.length >> 1] : 0;
  console.log(`\n[reprocess] ${slug} done:`);
  console.log(`  cropped:  ${cropped}${APPLY ? ' (re-uploaded)' : ' (would crop)'}  median shrink ${med}%`);
  console.log(`  no-op (already tight): ${noop}`);
  console.log(`  skipped (non-uniform corners / white-paper safe): ${skipped}`);
  console.log(`  refused (shrink > 62%, suspicious): ${refused}`);
  console.log(`  errors: ${err}`);
  if (!APPLY && cropped) console.log(`\n  → re-run with --apply to re-upload the ${cropped} cropped images`);
}

main().catch(e => { console.error(e); process.exit(1); });
