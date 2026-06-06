#!/usr/bin/env node
// Make artwork IDs GLOBALLY UNIQUE by prefixing each `id` with the collection slug.
//
// WHY: the modal's "Similar Works" resolves an artwork to its SigLIP/Vectorize embedding
// via semanticId, which falls back to the bare `id`. Museum-internal ids (e.g. "9087")
// collide ACROSS collections (astrup "9087" == mfab "9087"), so a not-yet-embedded new
// work matches an OLD work's embedding and shows wrong neighbours (e.g. a Cindy Sherman
// photo recommending Chinese landscapes). Prefixing with the slug → "{slug}-{id}" is
// globally unique → no collision (and forward-compatible: when embedded, the manifest uses
// this same unique id).
//
// SAFE: only the `id` field changes. imageUrl/original_imageUrl/sourceUrl are untouched
// (the R2 key embeds the OLD id as an opaque string — it still resolves). Idempotent:
// already-prefixed ids are skipped.
//
// Usage:
//   node scripts/prefix-collection-ids.mjs <slug>           # dry-run
//   node scripts/prefix-collection-ids.mjs <slug> --apply
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [slug, ...rest] = process.argv.slice(2);
const APPLY = rest.includes('--apply');
if (!slug) { console.error('usage: prefix-collection-ids.mjs <slug> [--apply]'); process.exit(1); }

const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
const c1 = path.join(REPO, 'public/data', `${slug}-collection.json`);
const c2 = path.join(REPO, 'public/data', `${slug}.json`);
const JSON_PATH = fs.existsSync(c1) ? c1 : c2;
const PREFIX = `${slug}-`;

const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const arts = data.artworks || [];
let changed = 0, already = 0;
for (const a of arts) {
  const id = String(a.id ?? '');
  if (!id) continue;
  if (id.startsWith(PREFIX)) { already++; continue; }
  if (APPLY) a.id = PREFIX + id;
  changed++;
}
// uniqueness check after prefixing
const seen = new Set(), dupes = [];
for (const a of arts) { const k = String(a.id); if (seen.has(k)) dupes.push(k); else seen.add(k); }

console.log(`[prefix-ids] ${slug}: ${arts.length} artworks | to-prefix ${changed} | already-prefixed ${already}`);
console.log(`  sample: ${arts.slice(0, 3).map(a => JSON.stringify(a.id)).join(', ')}`);
if (dupes.length) console.log(`  ⚠️ ${dupes.length} duplicate ids WITHIN collection (pre-existing): ${dupes.slice(0, 5).join(', ')}`);
if (APPLY) {
  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
  console.log(`  ✓ applied → ids now "${PREFIX}…" (globally unique)`);
} else if (changed) {
  console.log(`  → dry-run. Re-run with --apply.`);
}
