#!/usr/bin/env node
// Append/refresh a ?v=N cache-buster on every imageUrl in a collection JSON so the
// weserv image CDN (which honours R2's 1-year cache-control) fetches the re-processed
// image instead of a stale cached one. Run AFTER reprocess-images.mjs --apply.
// Usage: node scripts/cache-bust-images.mjs <slug> <version>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [slug, version] = process.argv.slice(2);
if (!slug || !version) { console.error('usage: cache-bust-images.mjs <slug> <version>'); process.exit(1); }
const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
const c1 = path.join(REPO, 'public/data', `${slug}-collection.json`);
const c2 = path.join(REPO, 'public/data', `${slug}.json`);
const JSON_PATH = fs.existsSync(c1) ? c1 : c2;

const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
let n = 0;
for (const a of data.artworks) {
  if (a.imageUrl && a.imageUrl.includes('.r2.dev/')) {
    a.imageUrl = a.imageUrl.split('?')[0] + '?v=' + version;
    n++;
  }
}
fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
console.log(`[cache-bust] ${slug}: tagged ${n} imageUrls with ?v=${version}`);
