#!/usr/bin/env node
// The works a new member rates on the last onboarding step.
//
//   node scripts/onboarding/build-taste-picks.mjs
//
// Two pools, written to public/data/onboarding-picks.json:
//   popular - works other members have liked, most likes first (artwork_stats is
//             public, read through the Firestore REST API);
//   random  - paintings drawn at random, a few per museum so no one collection
//             fills the list.
// Every pick is stored on R2 (quick to load) and already has a SigLIP vector
// (siglip_processed_ids.txt), so liking it counts toward the taste profile at once.
// Re-run it to take in new likes; the random draw is seeded, so the same inputs
// give the same file.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(ROOT, 'public/data/onboarding-picks.json');
const PROJECT = 'armin-web';
const RANDOM_COUNT = 480;
const PER_MUSEUM = 6;
const PAINTING = new Set(['painting', 'paintings']);

const embedded = new Set(fs.readFileSync(path.join(ROOT, 'siglip_processed_ids.txt'), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean));

const records = new Map();
for (const file of fs.readdirSync(path.join(ROOT, 'public/data')).filter((f) => /^search-index-part-\d+\.json$/.test(f))) {
  for (const r of JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', file), 'utf8'))) {
    if (r?.id && typeof r.i === 'string' && r.i.includes('.r2.dev/') && embedded.has(r.id)) records.set(r.id, r);
  }
}
console.log(`R2 + embedded records: ${records.size.toLocaleString()}`);

/* the index keeps the first four characters of a date ("ca. ", "wint"), so only
   a plain year is shown; a few artist fields carry a catalogue number after "|" */
const yearOf = (d) => (/^\d{4}$/.test(String(d || '').trim()) ? String(d).trim() : '');
const artistOf = (a) => String(a || '').split('|')[0].trim();
const pick = (r, likes) => ({ id: r.id, t: r.n || '', a: artistOf(r.a), y: yearOf(r.d), m: r.m || '', e: r.e || '', i: r.i, ...(likes ? { likes } : {}) });

/* every artwork_stats document with a like, most first */
async function likedIds() {
  const out = [];
  let after = null;
  for (;;) {
    const structuredQuery = {
      from: [{ collectionId: 'artwork_stats' }],
      where: { fieldFilter: { field: { fieldPath: 'likeCount' }, op: 'GREATER_THAN', value: { integerValue: '0' } } },
      orderBy: [{ field: { fieldPath: 'likeCount' }, direction: 'DESCENDING' }, { field: { fieldPath: '__name__' }, direction: 'DESCENDING' }],
      limit: 300,
      ...(after ? { startAt: { values: after, before: false } } : {}),
    };
    const res = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery }),
    });
    if (!res.ok) throw new Error(`artwork_stats ${res.status}: ${await res.text()}`);
    const rows = (await res.json()).filter((row) => row.document);
    for (const { document: d } of rows) {
      out.push({ id: d.fields?.artworkId?.stringValue || decodeURIComponent(d.name.split('/').pop()), likes: Number(d.fields.likeCount.integerValue) });
    }
    if (rows.length < 300) return out;
    const last = rows[rows.length - 1].document;
    after = [{ integerValue: last.fields.likeCount.integerValue }, { referenceValue: last.name }];
  }
}

/* a small seeded generator, so a re-run with the same data draws the same works */
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const liked = await likedIds();
const popular = [];
for (const { id, likes } of liked) {
  const r = records.get(id) || records.get(id.trim());
  if (r) popular.push(pick(r, likes));
}
console.log(`liked works: ${liked.length}, usable: ${popular.length}`);

const taken = new Set(popular.map((p) => p.id));
const pool = [...records.values()].filter((r) => PAINTING.has(r.c) && r.n && r.a && !/^unknown|anonymous/i.test(r.a) && !taken.has(r.id));
const rand = mulberry32(20260928);
for (let i = pool.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [pool[i], pool[j]] = [pool[j], pool[i]];
}
const perMuseum = new Map();
const random = [];
for (const r of pool) {
  const n = perMuseum.get(r.e) || 0;
  if (n >= PER_MUSEUM) continue;
  perMuseum.set(r.e, n + 1);
  random.push(pick(r));
  if (random.length >= RANDOM_COUNT) break;
}
console.log(`random paintings: ${random.length} from ${perMuseum.size} collections`);

fs.writeFileSync(OUT, JSON.stringify({ builtAt: new Date().toISOString(), popular, random }));
console.log(`wrote ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
