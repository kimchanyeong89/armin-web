#!/usr/bin/env node
// Curate a collection: remove low-visual-value items the user confirmed —
//   (1) old-photo / collage works (category=photograph, collage medium, or Jiří Kolář
//       photo-collages) that read as "old B&W photo scrapbooks", and
//   (2) excess generic-title series — keep at most CAP works per (artist+year) whose title
//       is generic ("Bez názvu"/Untitled/PF/Torn Drawings), drop the rest, so the grid
//       isn't flooded with near-identical "Untitled" entries.
// These are REAL artworks (not placeholders/dupes) — this is curation, so it's REVERSIBLE:
//   removed records are backed up to public/data/{slug}.curated-removed.json (undo: --restore).
//
// Usage:
//   node scripts/curate-collection.mjs <slug>                 # dry-run
//   node scripts/curate-collection.mjs <slug> --apply [--cap=2]
//   node scripts/curate-collection.mjs <slug> --restore
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [slug, ...rest] = process.argv.slice(2);
const APPLY = rest.includes('--apply');
const RESTORE = rest.includes('--restore');
const capArg = rest.find(a => a.startsWith('--cap='));
const CAP = capArg ? Number(capArg.split('=')[1]) : 2;
if (!slug) { console.error('usage: curate-collection.mjs <slug> [--apply] [--cap=2] [--restore]'); process.exit(1); }

const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
const c1 = path.join(REPO, 'public/data', `${slug}-collection.json`);
const c2 = path.join(REPO, 'public/data', `${slug}.json`);
const JSON_PATH = fs.existsSync(c1) ? c1 : c2;
const BACKUP = JSON_PATH.replace(/\.json$/, '.curated-removed.json');

const generic = (t) => /^(bez n[áa]zvu|bez n[áa]zev|untitled|sans titre|ohne titel|pf\b|torn drawings)/i.test(String(t || '').trim());
const oldPhoto = (a) => a.category === 'photograph'
  || /kol[áa][řr]\s+ji[řr][íi]/i.test(a.artist || '')
  || /kol[áa][žz]|collage/i.test(a.medium || '');

function restore() {
  if (!fs.existsSync(BACKUP)) { console.error(`[restore] no backup at ${BACKUP}`); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const removed = JSON.parse(fs.readFileSync(BACKUP, 'utf8')).artworks || [];
  const have = new Set(data.artworks.map(a => a.id));
  data.artworks = data.artworks.concat(removed.filter(a => !have.has(a.id)));
  if (data.total_count != null) data.total_count = data.artworks.length;
  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
  fs.rmSync(BACKUP);
  console.log(`[restore] ${slug}: re-merged ${removed.length} → ${data.artworks.length} total. Backup removed.`);
}

function main() {
  if (RESTORE) return restore();
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const arts = data.artworks || [];
  const remove = new Set();
  let nPhoto = 0, nSeries = 0;
  for (const a of arts) if (oldPhoto(a)) { remove.add(a.id); nPhoto++; }
  const grp = {};
  for (const a of arts) { if (!generic(a.title)) continue; const k = (a.artist || '') + '|' + (a.year || ''); (grp[k] = grp[k] || []).push(a); }
  for (const k in grp) grp[k].slice(CAP).forEach(a => { if (!remove.has(a.id)) { remove.add(a.id); nSeries++; } });

  const keep = arts.filter(a => !remove.has(a.id));
  const removed = arts.filter(a => remove.has(a.id));
  console.log(`[curate] ${slug}: ${arts.length} → keep ${keep.length}, remove ${removed.length}`);
  console.log(`  old-photo/collage: ${nPhoto} | untitled-series excess (cap ${CAP}): ${nSeries}`);
  console.log(`  sample removed: ${removed.slice(0, 6).map(a => `"${(a.title || '').slice(0, 14)}"/${(a.artist || '').slice(0, 12)}`).join(', ')}`);
  if (!APPLY) { console.log(`\n  → dry-run. Re-run with --apply (reversible: --restore).`); return; }

  fs.writeFileSync(BACKUP, JSON.stringify({ museum: data.museum, slug, removed_count: removed.length, artworks: removed }, null, 2));
  data.artworks = keep;
  if (data.total_count != null) data.total_count = keep.length;
  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
  console.log(`\n  ✓ removed ${removed.length} → ${keep.length} kept. Backup: ${path.basename(BACKUP)} (undo: --restore)`);
}

main();
