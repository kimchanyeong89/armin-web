#!/usr/bin/env node
// Reads back, for every work in the search index, whether its vector exists and whether it carries
// the work's card (an image address in its metadata) - /check-ids' foundIds and namedIds.
// A vector without the card is found by similarity and then dropped by the app, so a collection
// in that state gives no recommendations (86 collections, 2026-10-09).
//
//   node scripts/audit/verify-vector-metadata.mjs                     # every collection
//   node scripts/audit/verify-vector-metadata.mjs --collections=a,b   # these (by collection id prefix)
//   node scripts/audit/verify-vector-metadata.mjs --sample=200        # this many works per collection
//
// Writes scripts/.state/vector-metadata-unnamed.txt: the ids found without a card, one a line -
// feed them back with  refresh-vectorize-metadata.mjs --ids-file=<that file>.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const WORKER = 'https://armin-semantic-search.armin-art.workers.dev';
const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1];
const COLLECTIONS = arg('collections') ? arg('collections').split(',') : null;
const SAMPLE = Number(arg('sample') || 0);
const CONCURRENCY = Number(arg('concurrency') || 6);

const byCollection = new Map();
for (const file of fs.readdirSync(path.join(ROOT, 'public/data')).filter((f) => /^search-index-part-\d+\.json$/.test(f))) {
  for (const work of JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', file), 'utf8'))) {
    if (!work.i) continue;
    const e = String(work.e || '');
    if (COLLECTIONS && !COLLECTIONS.some((c) => e.startsWith(c))) continue;
    if (!byCollection.has(e)) byCollection.set(e, []);
    byCollection.get(e).push(String(work.id));
  }
}
const jobs = [];
for (const [e, ids] of byCollection) {
  const pick = SAMPLE && ids.length > SAMPLE ? ids.sort(() => Math.random() - 0.5).slice(0, SAMPLE) : ids;
  for (let i = 0; i < pick.length; i += 20) jobs.push({ e, ids: pick.slice(i, i + 20) });
}
const tally = new Map([...byCollection.keys()].map((e) => [e, { asked: 0, found: 0, named: 0, errors: 0 }]));
const unnamed = [];
let done = 0;
async function check(job) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const res = await fetch(`${WORKER}/check-ids`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: job.ids }) });
      const data = await res.json();
      if (res.ok && Array.isArray(data.foundIds) && Array.isArray(data.namedIds)) return data;
    } catch { /* asked again below */ }
    await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
  }
  return null;
}
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (jobs.length) {
    const job = jobs.pop();
    const t = tally.get(job.e);
    const data = await check(job);
    t.asked += job.ids.length;
    if (!data) { t.errors += job.ids.length; continue; }
    t.found += data.foundIds.length;
    t.named += data.namedIds.length;
    const named = new Set(data.namedIds);
    for (const id of data.foundIds) if (!named.has(id)) unnamed.push(id);
    if (++done % 500 === 0) process.stdout.write(`\r  ${done} calls, ${unnamed.length} without a card`);
  }
}));
const rows = [...tally].map(([e, t]) => ({ collection: e, ...t, unnamed: t.found - t.named })).sort((a, b) => b.unnamed - a.unnamed);
const bad = rows.filter((r) => r.unnamed > 0);
const total = rows.reduce((s, r) => ({ asked: s.asked + r.asked, found: s.found + r.found, named: s.named + r.named, errors: s.errors + r.errors }), { asked: 0, found: 0, named: 0, errors: 0 });
console.log(`\n${rows.length} collections, ${total.asked} works asked: ${total.found} have a vector, ${total.named} of those carry the card, ${total.found - total.named} do not; ${total.errors} could not be read`);
console.log(`collections with any vector lacking its card: ${bad.length}`);
console.table(bad.slice(0, 40));
fs.mkdirSync(path.join(ROOT, 'scripts/.state'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'scripts/.state/vector-metadata-unnamed.txt'), unnamed.join('\n'));
fs.writeFileSync(path.join(ROOT, 'scripts/.state/vector-metadata-report.json'), JSON.stringify({ at: new Date().toISOString(), total, rows }, null, 1));
