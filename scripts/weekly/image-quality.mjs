// Image sizes of a week's candidate works, and the low-resolution rule (owner's rule, 2026-10-08):
// a low-resolution image is never the cover (hero); it is replaced when another work can take its
// place, and when it has to stay for the count it goes to the bottom of the card.
//
//   node scripts/weekly/image-quality.mjs --week 2026-W42           # report only
//   node scripts/weekly/image-quality.mjs --week 2026-W42 --apply   # reorder: low-res last, a sharp hero first
//
// LOW  = longer side under 900px  → never the hero, sorted to the bottom
// TINY = longer side under 450px  → remove the work (reported; removing is the editor's edit)
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const LOW = 900;
const TINY = 450;
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const week = arg('week');
const apply = process.argv.includes('--apply');
if (!week) { console.error('Usage: node scripts/weekly/image-quality.mjs --week YYYY-Www [--apply]'); process.exit(1); }

const path = `public/data/weekly-proposals/${week}.json`;
const file = JSON.parse(readFileSync(path, 'utf-8'));

async function longSide(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    return Math.max(meta.width ?? 0, meta.height ?? 0);
  } catch {
    return 0;
  }
}

let problems = 0;
for (const card of file.cards) {
  const sized = [];
  for (const work of card.works) sized.push({ work, px: await longSide(work.image_url) });
  console.log(`\n${card.title_ko || card.id}`);
  for (const { work, px } of sized) {
    const mark = px < TINY ? 'TINY' : px < LOW ? 'LOW ' : '    ';
    console.log(`  ${mark} ${String(px).padStart(5)}px  ${work.role === 'hero' ? '★' : ' '} ${work.artist} — ${work.title}`.replace(/\n/g, ' '));
  }
  const tiny = sized.filter((s) => s.px < TINY).length;
  const heroLow = sized.some((s) => s.work.role === 'hero' && s.px < LOW);
  if (tiny) { problems++; console.log(`  → ${tiny} tiny image(s): remove or replace`); }
  if (heroLow) { problems++; console.log('  → the hero is low-resolution'); }
  if (apply) {
    // stable: sharp works keep their order, low-res works follow in theirs
    const ordered = [...sized.filter((s) => s.px >= LOW), ...sized.filter((s) => s.px < LOW)].map((s) => s.work);
    // the editor's hero stays the hero when it is sharp; otherwise the first sharp work takes over
    const hero = sized.find((s) => s.work.role === 'hero' && s.px >= LOW)?.work ?? ordered[0];
    card.works = [hero, ...ordered.filter((w) => w !== hero)].map((w, i) => ({ ...w, position: i + 1, role: i === 0 ? 'hero' : 'standard' }));
  }
}
if (apply) { writeFileSync(path, JSON.stringify(file, null, 2)); console.log(`\nreordered ${path}`); }
else if (problems) process.exitCode = 1;
