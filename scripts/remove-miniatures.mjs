#!/usr/bin/env node
// Remove portrait-miniature works from a collection JSON — the small ivory/enamel/vellum
// locket portraits that are technically "paintings" but pollute the visual grid + SigLIP.
//
// Detection (in priority order):
//   1. category === 'miniature'  — the museum's OWN authoritative classification (best).
//   2. --medium fallback: medium contains ivory|enamel|vellum AND max-dim <= maxCm
//      (heuristic, for sources that don't expose a category field).
//
// REVERSIBLE: removed artworks are written to public/data/{slug}.miniatures-removed.json.
// To undo: node scripts/remove-miniatures.mjs <slug> --restore
// R2 images are left in place (harmless orphans) so a restore re-shows them instantly.
//
// Usage:
//   node scripts/remove-miniatures.mjs <slug>                 # dry-run: count + sample
//   node scripts/remove-miniatures.mjs <slug> --apply         # remove (category-based)
//   node scripts/remove-miniatures.mjs <slug> --apply --medium [--max-cm=14]
//   node scripts/remove-miniatures.mjs <slug> --restore       # undo (re-merge backup)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const slug = args.find(a => !a.startsWith('--'));
const APPLY = args.includes('--apply');
const RESTORE = args.includes('--restore');
const USE_MEDIUM = args.includes('--medium');
const maxCmArg = args.find(a => a.startsWith('--max-cm='));
const MAX_CM = maxCmArg ? Number(maxCmArg.split('=')[1]) : 14;
if (!slug) { console.error('usage: remove-miniatures.mjs <slug> [--apply] [--medium] [--max-cm=14] [--restore]'); process.exit(1); }

const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
const c1 = path.join(REPO, 'public/data', `${slug}-collection.json`);
const c2 = path.join(REPO, 'public/data', `${slug}.json`);
const JSON_PATH = fs.existsSync(c1) ? c1 : c2;
const BACKUP_PATH = JSON_PATH.replace(/\.json$/, '.miniatures-removed.json');

// max dimension in cm. Handles "7.8 cm", "3 × 2.5cm", "317 mm" (→31.7cm).
function maxCm(dim) {
  if (!dim) return null;
  const s = String(dim);
  const isMm = /\bmm\b/i.test(s) && !/\bcm\b/i.test(s);
  const nums = [...s.matchAll(/([\d.]+)/g)].map(m => parseFloat(m[1])).filter(n => !isNaN(n) && n > 0);
  if (!nums.length) return null;
  const mx = Math.max(...nums);
  return isMm ? mx / 10 : mx;
}
// Refined medium heuristic (for sources lacking a `category` field). Verified high-precision
// on Ashmolean (218 hits, 100% genuine minis). Excludes the false-positive classes:
//   - "vellum paper" (ordinary smooth paper, e.g. Picasso etchings) — not parchment
//   - long mixed-media material lists (>55 chars, e.g. Rijksmuseum objects with ivory as 1 of 15)
//   - non-paint-led mediums (e.g. "Leather. Metal and enamel buttons" = a coat)
function isMiniByMedium(a) {
  const m = (a.medium || '').trim();
  if (/vellum\s+paper/i.test(m)) return false;
  if (m.length > 55) return false;
  if (!/^(water\s?colou?r|gouache|tempera|oil|bodycolour|painted|enamel|miniature)\b/i.test(m)) return false;
  if (!/\b(ivory|vellum|enamel)\b/i.test(m)) return false;
  const cm = maxCm(a.dimensions);
  return cm == null || cm <= MAX_CM;
}

function isMiniature(a) {
  if (String(a.category || '').toLowerCase() === 'miniature') return 'category';
  if (USE_MEDIUM && isMiniByMedium(a)) return 'medium';
  return null;
}

function restore() {
  if (!fs.existsSync(BACKUP_PATH)) { console.error(`[restore] no backup at ${BACKUP_PATH}`); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const removed = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
  const have = new Set(data.artworks.map(a => a.id));
  const back = removed.artworks.filter(a => !have.has(a.id));
  data.artworks = data.artworks.concat(back).sort((a, b) => (a.id || 0) - (b.id || 0));
  if (data.total_count != null) data.total_count = data.artworks.length;
  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
  fs.rmSync(BACKUP_PATH);
  console.log(`[restore] ${slug}: re-merged ${back.length} works → ${data.artworks.length} total. Backup removed.`);
}

function main() {
  if (RESTORE) return restore();
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const arts = data.artworks || [];
  const minis = [], keep = [];
  const byMedium = {};
  for (const a of arts) {
    const why = isMiniature(a);
    if (why) { minis.push(a); const m = (a.medium || '(none)').toLowerCase(); byMedium[m] = (byMedium[m] || 0) + 1; }
    else keep.push(a);
  }
  console.log(`[miniatures] ${slug}: ${arts.length} total → ${minis.length} miniatures, ${keep.length} kept`);
  console.log(`  detection: category=miniature${USE_MEDIUM ? ` + medium(ivory/enamel/vellum)≤${MAX_CM}cm` : ''}`);
  const top = Object.entries(byMedium).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log('  by medium:', top.map(([m, n]) => `${n}×${m}`).join(', '));
  console.log('  sample:', minis.slice(0, 6).map(a => `"${a.title}"`).join(', '));

  if (!APPLY) { console.log(`\n  → dry-run. Re-run with --apply to remove (backup written, reversible via --restore).`); return; }

  // write backup (merge with any existing backup so repeat applies don't lose history)
  let prevRemoved = [];
  if (fs.existsSync(BACKUP_PATH)) { try { prevRemoved = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8')).artworks || []; } catch {} }
  const seen = new Set(prevRemoved.map(a => a.id));
  const allRemoved = prevRemoved.concat(minis.filter(a => !seen.has(a.id)));
  fs.writeFileSync(BACKUP_PATH, JSON.stringify({ museum: data.museum, slug, removed_count: allRemoved.length, artworks: allRemoved }, null, 2));

  data.artworks = keep;
  if (data.total_count != null) data.total_count = keep.length;
  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
  console.log(`\n  ✓ removed ${minis.length} → ${keep.length} kept. Backup: ${path.basename(BACKUP_PATH)} (undo: --restore)`);
}

main();
