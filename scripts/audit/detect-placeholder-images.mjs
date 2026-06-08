#!/usr/bin/env node
// CONTENT-BASED placeholder/broken-image detector via the AUTHENTICATED R2 (S3) API.
// The earlier audit only caught SHARED imageUrls; some sources (boijmans) return one "no
// image" placeholder that the scraper uploaded under a DIFFERENT R2 key per artwork — same
// CONTENT, different URL. And the public r2.dev endpoint rate-limits a 20k HEAD burst (false
// 404s). So: ListObjectsV2 the collection's R2 prefix → {key: etag(MD5), size} for ALL objects
// in ~20 paginated calls (no throttling), cluster by ETag. Any ETag shared by >= MIN artworks
// is a placeholder (real photos never share an exact MD5). Artworks whose key is MISSING from
// R2 are broken. Remove both. REVERSIBLE → {slug}.placeholder-removed.json (undo: --restore).
//
// Usage:
//   node scripts/audit/detect-placeholder-images.mjs <slug>                # dry-run
//   node scripts/audit/detect-placeholder-images.mjs <slug> --apply [--min=10]
//   node scripts/audit/detect-placeholder-images.mjs <slug> --restore
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const args = process.argv.slice(2);
const slug = args.find(a => !a.startsWith('--'));
const APPLY = args.includes('--apply');
const RESTORE = args.includes('--restore');
const MIN = Number((args.find(a => a.startsWith('--min=')) || '--min=10').split('=')[1]);
if (!slug) { console.error('usage: detect-placeholder-images.mjs <slug> [--apply] [--min=10] [--restore]'); process.exit(1); }

const REPO = path.resolve(fileURLToPath(import.meta.url), '../../..');
require('dotenv').config({ path: path.join(REPO, '.env.local') });
const c1 = path.join(REPO, 'public/data', `${slug}-collection.json`);
const c2 = path.join(REPO, 'public/data', `${slug}.json`);
const JSON_PATH = fs.existsSync(c1) ? c1 : c2;
const BACKUP = JSON_PATH.replace(/\.json$/, '.placeholder-removed.json');
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const s3 = new S3Client({ region: 'auto', endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });

const keyOf = (url) => { const p = (url || '').split('.r2.dev/')[1]; return p ? p.split('?')[0] : null; };

function restore() {
  if (!fs.existsSync(BACKUP)) { console.error(`[restore] no backup at ${BACKUP}`); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const removed = JSON.parse(fs.readFileSync(BACKUP, 'utf8')).artworks || [];
  const have = new Set(data.artworks.map(a => a.id));
  data.artworks = data.artworks.concat(removed.filter(a => !have.has(a.id)));
  if (data.total_count != null) data.total_count = data.artworks.length;
  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
  fs.rmSync(BACKUP);
  console.log(`[restore] ${slug}: re-merged ${removed.length} → ${data.artworks.length} total.`);
}

async function main() {
  if (RESTORE) return restore();
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const arts = data.artworks || [];
  const withImg = arts.filter(a => keyOf(a.imageUrl));
  // prefix = artworks/{stem}/  (derive from the first key)
  const sampleKey = keyOf(withImg[0]?.imageUrl) || '';
  const prefix = sampleKey.split('/').slice(0, 2).join('/') + '/';
  console.log(`[placeholder] ${slug}: listing R2 prefix ${prefix} …`);

  const etagByKey = new Map();
  let token, pages = 0;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix, ContinuationToken: token, MaxKeys: 1000 }));
    for (const o of (r.Contents || [])) etagByKey.set(o.Key, { etag: (o.ETag || '').replace(/"/g, ''), size: o.Size });
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
    pages++;
  } while (token);
  console.log(`  R2 objects in prefix: ${etagByKey.size} (${pages} pages)`);

  const byEtag = new Map(); const missing = [];
  for (const a of withImg) {
    const meta = etagByKey.get(keyOf(a.imageUrl));
    if (!meta) { missing.push(a); continue; }
    if (!byEtag.has(meta.etag)) byEtag.set(meta.etag, { works: [], size: meta.size });
    byEtag.get(meta.etag).works.push(a);
  }
  const clusters = [...byEtag.entries()].filter(([e, v]) => v.works.length >= MIN).sort((a, b) => b[1].works.length - a[1].works.length);

  console.log(`  missing from R2 (broken upload): ${missing.length}`);
  console.log(`  ETag clusters (≥${MIN} artworks share identical image = placeholder):`);
  const remove = new Set(missing.map(a => a.id));
  for (const [etag, v] of clusters) {
    console.log(`    ${v.works.length}× ${v.size}B  md5=${etag.slice(0, 12)}  → PLACEHOLDER (identical content)`);
    v.works.forEach(a => remove.add(a.id));
  }
  if (!clusters.length) console.log('    (none — no identical-content clusters)');

  const removed = arts.filter(a => remove.has(a.id));
  const keep = arts.filter(a => !remove.has(a.id));
  console.log(`\n  → remove ${removed.length} (placeholder ${removed.length - missing.length} + broken ${missing.length}), keep ${keep.length}`);
  if (!APPLY) { console.log(`  (dry-run; --apply to remove. reversible: --restore)`); return; }

  fs.writeFileSync(BACKUP, JSON.stringify({ museum: data.museum, slug, removed_count: removed.length, artworks: removed }, null, 2));
  data.artworks = keep;
  if (data.total_count != null) data.total_count = keep.length;
  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
  console.log(`  ✓ removed ${removed.length} → ${keep.length} kept. Backup: ${path.basename(BACKUP)} (undo: --restore)`);
}
main().catch(e => { console.error(e); process.exit(1); });
