#!/usr/bin/env node
// Curate low-value B&W reproductive PRINTS while KEEPING valuable drawings.
// The distinguishing logic the user asked for: detect grayscale by image saturation, but
// only target category=print (reproductive engravings) — drawings stay even when B&W, and
// colour prints stay. Removes (grayscale AND category=print). Reversible backup.
//
// Grayscale = mean per-pixel saturation (max(R,G,B)-min(R,G,B)) below SAT_TH on a downscaled
// sample of the image. Images fetched via the authenticated R2 (S3) API (no public throttling).
//
// Usage:
//   node scripts/audit/curate-grayscale-prints.mjs <slug> [--sample=N]   # analyze (dry-run / estimate)
//   node scripts/audit/curate-grayscale-prints.mjs <slug> --apply
//   node scripts/audit/curate-grayscale-prints.mjs <slug> --restore
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

const args = process.argv.slice(2);
const slug = args.find(a => !a.startsWith('--'));
const APPLY = args.includes('--apply');
const RESTORE = args.includes('--restore');
const SAMPLE = Number((args.find(a => a.startsWith('--sample=')) || '--sample=0').split('=')[1]);
const CF_TH = Number((args.find(a => a.startsWith('--th=')) || '--th=20').split('=')[1]);   // colorfulness below this = monochrome/B&W
const CONC = 16;
if (!slug) { console.error('usage: curate-grayscale-prints.mjs <slug> [--sample=N] [--apply] [--restore]'); process.exit(1); }

const REPO = path.resolve(fileURLToPath(import.meta.url), '../../..');
require('dotenv').config({ path: path.join(REPO, '.env.local') });
const JSON_PATH = (() => { const a = path.join(REPO, 'public/data', `${slug}-collection.json`); return fs.existsSync(a) ? a : path.join(REPO, 'public/data', `${slug}.json`); })();
const BACKUP = JSON_PATH.replace(/\.json$/, '.grayscale-prints-removed.json');
const s3 = new S3Client({ region: 'auto', endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
const keyOf = (url) => { const p = (url || '').split('.r2.dev/')[1]; return p ? p.split('?')[0] : null; };

const streamToBuf = async (s) => { const c = []; for await (const x of s) c.push(x); return Buffer.concat(c); };
// Hasler-Süsstrunk colorfulness: catches B&W engravings on toned/cream paper (low colour
// VARIETY) that pure saturation misses (the paper tint gives them non-zero saturation).
async function colorfulness(key) {
  try {
    const o = await s3.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
    const buf = await streamToBuf(o.Body);
    const { data } = await sharp(buf, { limitInputPixels: false }).resize(80, 80, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const rg = [], yb = [];
    for (let i = 0; i < data.length; i += 3) { const R = data[i], G = data[i + 1], B = data[i + 2]; rg.push(R - G); yb.push(0.5 * (R + G) - B); }
    const m = a => a.reduce((s, v) => s + v, 0) / a.length;
    const sd = a => { const mu = m(a); return Math.sqrt(m(a.map(v => (v - mu) ** 2))); };
    return Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(m(rg) ** 2 + m(yb) ** 2);
  } catch { return -1; }
}
async function pool(items, fn, c) { let i = 0; const out = []; await Promise.all(Array.from({ length: c }, async () => { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); } })); return out; }

function restore() {
  if (!fs.existsSync(BACKUP)) { console.error('[restore] no backup'); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const removed = JSON.parse(fs.readFileSync(BACKUP, 'utf8')).artworks || [];
  const have = new Set(data.artworks.map(a => a.id));
  data.artworks = data.artworks.concat(removed.filter(a => !have.has(a.id)));
  if (data.total_count != null) data.total_count = data.artworks.length;
  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2)); fs.rmSync(BACKUP);
  console.log(`[restore] ${slug}: +${removed.length} → ${data.artworks.length}`);
}

async function main() {
  if (RESTORE) return restore();
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const arts = data.artworks || [];
  let prints = arts.filter(a => a.category === 'print' && keyOf(a.imageUrl));
  console.log(`[grayscale-prints] ${slug}: ${arts.length} works, ${prints.length} prints`);
  const targets = SAMPLE ? prints.slice(0, SAMPLE) : prints;
  console.log(`  analyzing ${targets.length} print images (colorfulness<${CF_TH}, conc ${CONC})…`);
  const sats = await pool(targets, a => colorfulness(keyOf(a.imageUrl)), CONC);
  const gray = targets.filter((a, i) => sats[i] >= 0 && sats[i] < CF_TH);
  const errs = sats.filter(s => s < 0).length;
  console.log(`  monochrome prints (cf<${CF_TH}): ${gray.length}/${targets.length} (${Math.round(gray.length / targets.length * 100)}%) | errors ${errs}`);
  console.log(`  sample grayscale: ${gray.slice(0, 4).map(a => `"${(a.title || '').slice(0, 18)}"`).join(', ')}`);
  if (SAMPLE) { console.log(`\n  → estimate full: ~${Math.round(gray.length / targets.length * prints.length)} grayscale prints of ${prints.length}. Run without --sample to do all, then --apply.`); return; }

  const ids = new Set(gray.map(a => a.id));
  const keep = arts.filter(a => !ids.has(a.id));
  console.log(`\n  → remove ${gray.length} grayscale prints, keep ${keep.length} (drawings/paintings/colour/photos all kept)`);
  if (!APPLY) { console.log('  (dry-run; --apply to remove. reversible: --restore)'); return; }
  fs.writeFileSync(BACKUP, JSON.stringify({ museum: data.museum, slug, removed_count: gray.length, artworks: gray }, null, 2));
  data.artworks = keep; if (data.total_count != null) data.total_count = keep.length;
  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
  console.log(`  ✓ removed ${gray.length} → ${keep.length} kept. Backup: ${path.basename(BACKUP)} (undo: --restore)`);
}
main().catch(e => { console.error(e); process.exit(1); });
