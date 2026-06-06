#!/usr/bin/env node
// Detect & remove NGMA "Image not found" placeholders from the collection.
// NPDR serves a single fixed placeholder (906x1800, jpg sha256 419ab52b…, 96625B) for
// records whose image is missing. content-length filter → sha256 confirm → drop records.
// Usage:  node scripts/audit/detect-ngma-placeholders.mjs [--apply]
//   (dry-run by default; --apply rewrites the JSON and deletes R2 objects)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(fileURLToPath(import.meta.url), '../../../.env.local') });

const REPO = path.resolve(fileURLToPath(import.meta.url), '../../..');
const JSON_PATH = path.join(REPO, 'public/data/ngma-newdelhi-collection.json');
const UA = 'Mozilla/5.0 (compatible; armin-museum-research/1.0)';
const APPLY = process.argv.includes('--apply');

const PLACEHOLDER_ORIG_SHA = '419ab52b489fa687503e5485358b5c2821407ca6fb49bdb97ace802e607bcf1d';
const PLACEHOLDER_LEN = 96625;          // orig jpg content-length (fast 1st-pass filter)
const CONCURRENCY = 8;

const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const s3 = new S3Client({
  region: 'auto', endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

async function headLen(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA } });
    return Number(r.headers.get('content-length') || 0);
  } catch { return -1; }
}
async function sha256(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) return null;
  return crypto.createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex');
}

async function pool(items, fn, conc) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: conc }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  }));
  return out;
}

async function main() {
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const arr = data.artworks;
  console.log(`[detect] ${arr.length} records — HEAD pass for content-length ${PLACEHOLDER_LEN}…`);

  let done = 0;
  const lens = await pool(arr, async (a) => {
    const len = await headLen(a.original_imageUrl);
    if (++done % 1000 === 0) console.log(`  …${done}/${arr.length}`);
    return len;
  }, CONCURRENCY);

  const suspects = arr.map((a, i) => ({ a, i, len: lens[i] })).filter(s => s.len === PLACEHOLDER_LEN);
  console.log(`[detect] ${suspects.length} content-length matches → confirming sha256…`);

  const confirmed = [];
  await pool(suspects, async (s) => {
    const h = await sha256(s.a.original_imageUrl);
    if (h === PLACEHOLDER_ORIG_SHA) confirmed.push(s.a);
  }, CONCURRENCY);

  console.log(`\n[detect] CONFIRMED placeholders: ${confirmed.length}`);
  confirmed.slice(0, 10).forEach(a => console.log(`  - ${a.id}  "${a.title}"`));
  if (confirmed.length > 10) console.log(`  … +${confirmed.length - 10} more`);

  if (!APPLY) { console.log(`\n(dry-run — re-run with --apply to remove ${confirmed.length} records + R2 objects)`); return; }

  // remove from JSON
  const badIds = new Set(confirmed.map(a => a.id));
  data.artworks = arr.filter(a => !badIds.has(a.id));
  data.total_count = data.artworks.length;
  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
  console.log(`[detect] JSON rewritten: ${arr.length} → ${data.artworks.length}`);

  // delete R2 objects (key = path after r2.dev/)
  let del = 0;
  await pool(confirmed, async (a) => {
    const key = a.imageUrl.split('.r2.dev/')[1];
    if (!key) return;
    try { await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key })); del++; } catch {}
  }, CONCURRENCY);
  console.log(`[detect] R2 objects deleted: ${del}`);
}

main().catch(e => { console.error(e); process.exit(1); });
