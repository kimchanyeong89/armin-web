#!/usr/bin/env node
// Backfill the missing "Year of Work" for NGMA New Delhi artworks.
//
// Why this exists:
//   public/data/ngma-newdelhi-collection.json has ~12k artworks but only ~330
//   carry a year. The original scraper's extractYear() never checked the actual
//   metadata key the museum uses — "Period / Year of Work" — so it dropped years
//   that ARE present on the live detail page (static HTML, no AJAX needed).
//
// What it does:
//   For every artwork WITHOUT a year, fetch the NPDR detail page
//     https://museumsofindia.gov.in/repository/record/{ngmaRecordId}
//   parse its <th>/<td> metadata table, read "Period / Year of Work" (fall back to
//   a 4-digit year in "Inscription"), and set artwork.year (number) + artwork.date
//   (string). Images / R2 are NOT touched.
//
// Fetch note: the museumsofindia.gov.in TLS chain is self-signed from Node's view
//   (SELF_SIGNED_CERT_IN_CHAIN) and global fetch() ignores a custom https.Agent,
//   so we shell out to `curl`, which trusts it via the system store.
//
// Resumable: progress (which record IDs are done + what was found) is persisted to
//   scripts/.state/ngma-years-progress.json after every batch, so re-running picks
//   up where it left off. The collection JSON is rewritten incrementally.
//
// Usage:
//   node scripts/backfill-ngma-years.mjs            # all remaining records
//   node scripts/backfill-ngma-years.mjs --limit=30 # only first 30 still-missing
//   node scripts/backfill-ngma-years.mjs --reset    # wipe progress, start over

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const COLLECTION = path.join(REPO_ROOT, 'public/data/ngma-newdelhi-collection.json');
const STATE_FILE = path.join(REPO_ROOT, 'scripts/.state/ngma-years-progress.json');
const BASE = 'https://museumsofindia.gov.in';
const UA = 'Mozilla/5.0 (compatible; armin-museum-research/1.0)';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const LIMIT = args.limit ? Number(args.limit) : null;
const DELAY_MS = args.delay ? Number(args.delay) : 150;   // polite pause between requests
const SAVE_EVERY = 25;                                     // flush state + JSON every N processed

const sleep = ms => new Promise(r => setTimeout(r, ms));

const dec = s => (s || '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ');

// Parse the detail page's <tr><th>Field</th><td>Value</td></tr> metadata table.
function parseDetail(html) {
  const f = {};
  for (const m of html.matchAll(/<tr[^>]*>[\s\S]*?<th[^>]*>([\s\S]*?)<\/th>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/g)) {
    const k = dec(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    const v = dec(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (k) f[k] = v;
  }
  return f;
}

// Plausible artwork year: 1500–2029. Avoids matching dimensions / accession noise.
const YEAR_RE = /\b(1[5-9]\d{2}|20[0-2]\d)\b/;

// Returns { year:Number, raw:String, source:'period'|'inscription' } or null.
function extractYear(fields) {
  const period = fields['Period / Year of Work'] || '';
  let m = period.match(YEAR_RE);
  if (m) return { year: Number(m[0]), raw: period, source: 'period' };
  const inscr = fields['Inscription'] || '';
  m = inscr.match(YEAR_RE);
  if (m) return { year: Number(m[0]), raw: inscr.slice(0, 80), source: 'inscription' };
  return null;
}

// Fetch detail HTML via curl. --retry handles 429/5xx with backoff. Throws on failure.
async function fetchDetail(id) {
  const url = `${BASE}/repository/record/${id}`;
  const { stdout } = await execFileP('curl', [
    '-sS', '--fail', '--max-time', '40',
    '--retry', '3', '--retry-delay', '2', '--retry-all-errors',
    '-A', UA, url,
  ], { maxBuffer: 30 * 1024 * 1024 });
  return stdout;
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { processed: {}, startedAt: new Date().toISOString() };
  }
}
function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function main() {
  if (args.reset && fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
    console.log('[ngma-years] reset: cleared progress state');
  }

  const collection = JSON.parse(fs.readFileSync(COLLECTION, 'utf8'));
  const artworks = collection.artworks;
  const byId = new Map(artworks.map(a => [a.metadata?.ngmaRecordId || a.id, a]));

  const state = loadState();

  // Records still needing a year AND not already processed this/previous run.
  const hasYear = a => a.year != null && a.year !== '' && a.year !== 0;
  let todo = artworks
    .filter(a => !hasYear(a))
    .map(a => a.metadata?.ngmaRecordId || a.id)
    .filter(id => !state.processed[id]);
  if (LIMIT) todo = todo.slice(0, LIMIT);

  const alreadyDone = Object.keys(state.processed).length;
  console.log(`[ngma-years] collection=${artworks.length}  with-year=${artworks.filter(hasYear).length}  ` +
              `already-processed=${alreadyDone}  todo-this-run=${todo.length}${LIMIT ? ` (limit ${LIMIT})` : ''}`);

  let recovered = 0, missed = 0, errors = 0, processed = 0;
  const examples = [];

  // Apply any years recovered in a prior run that hadn't been written back yet.
  for (const [id, rec] of Object.entries(state.processed)) {
    if (rec.year && byId.has(id) && !hasYear(byId.get(id))) {
      const a = byId.get(id);
      a.year = rec.year;
      a.date = rec.date;
    }
  }

  const flush = () => {
    fs.writeFileSync(COLLECTION, JSON.stringify(collection, null, 2));
    saveState(state);
  };

  for (const id of todo) {
    let html;
    try {
      html = await fetchDetail(id);
    } catch (e) {
      errors++;
      state.processed[id] = { year: null, error: String(e.message || e).slice(0, 120) };
      processed++;
      if (processed % SAVE_EVERY === 0) flush();
      await sleep(DELAY_MS);
      continue;
    }

    const fields = parseDetail(html);
    const found = extractYear(fields);
    const art = byId.get(id);

    if (found) {
      art.year = found.year;
      art.date = found.raw;            // keep the museum's literal string (e.g. "c. 1931", "June 1935")
      state.processed[id] = { year: found.year, date: found.raw, source: found.source };
      recovered++;
      if (examples.length < 12) {
        examples.push(`${id} | ${art.artist} -> ${found.year} [${found.source}] raw="${found.raw}"`);
      }
    } else {
      state.processed[id] = { year: null };
      missed++;
    }

    processed++;
    if (processed % SAVE_EVERY === 0) {
      flush();
      console.log(`[ngma-years] ${processed}/${todo.length}  recovered=${recovered}  missed=${missed}  errors=${errors}`);
    }
    await sleep(DELAY_MS);
  }

  flush();

  const totalWithYear = artworks.filter(hasYear).length;
  console.log('\n=== backfill done ===');
  console.log(`  processed this run : ${processed}`);
  console.log(`  years recovered    : ${recovered}`);
  console.log(`  no year available  : ${missed}`);
  console.log(`  fetch errors       : ${errors}`);
  console.log(`  collection now has : ${totalWithYear}/${artworks.length} with a year`);
  if (examples.length) {
    console.log('\n  examples:');
    examples.forEach(e => console.log('    ' + e));
  }
  console.log(`\n  wrote: ${COLLECTION}`);
  console.log(`  state: ${STATE_FILE}`);
}

main().catch(e => { console.error(e); process.exit(1); });
