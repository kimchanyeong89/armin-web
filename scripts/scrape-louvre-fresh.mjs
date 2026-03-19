#!/usr/bin/env node
/**
 * Louvre painting collection scraper (fresh)
 * Source: https://collections.louvre.fr/en/recherche?typology[0]=22
 * ~110 pages × 100 items = ~11,000 paintings
 * Uses per-ark JSON API: /en/ark:/53355/{arkId}.json
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';

const BASE = 'https://collections.louvre.fr';
const SEARCH_URL = (page) =>
  `${BASE}/en/recherche?typology%5B0%5D=22&limit=100&page=${page}`;
const ARK_JSON_URL = (arkId) =>
  `${BASE}/en/ark:/53355/${arkId}.json`;

const OUT = '/Users/kietzsche/armin-web-main/public/data/louvre-painting-collection.json';
const CHECKPOINT = '/tmp/louvre-ark-ids.json';
const PROGRESS = '/tmp/louvre-objects.jsonl';

const CONCURRENCY = 12;
const DELAY = 150; // ms between page fetches
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- helpers --------------------------------------------------------

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
};

const JSON_HEADERS = {
  ...HEADERS,
  Accept: 'application/json,text/html,*/*',
};

async function fetchText(url, attempt = 1) {
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.text();
  } catch (e) {
    if (attempt < 3) {
      await sleep(2000 * attempt);
      return fetchText(url, attempt + 1);
    }
    throw e;
  }
}

async function fetchJson(url, attempt = 1) {
  try {
    const res = await fetch(url, { headers: JSON_HEADERS });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.json();
  } catch (e) {
    if (attempt < 3) {
      await sleep(2000 * attempt);
      return fetchJson(url, attempt + 1);
    }
    console.warn(`  Failed ${url}: ${e.message}`);
    return null;
  }
}

// ---------- Phase 1: collect ark IDs from search pages ---------------------

async function collectArkIds() {
  if (existsSync(CHECKPOINT)) {
    const cached = JSON.parse(readFileSync(CHECKPOINT, 'utf8'));
    console.log(`Loaded ${cached.length} ark IDs from checkpoint`);
    return cached;
  }

  const arkIds = [];
  const seen = new Set();

  for (let page = 1; page <= 130; page++) {
    const url = SEARCH_URL(page);
    process.stdout.write(`Page ${page}: `);

    let html;
    try {
      html = await fetchText(url);
    } catch (e) {
      console.error(`ERROR: ${e.message}`);
      if (page > 10) {
        console.log('Stopping at page', page);
        break;
      }
      continue;
    }

    // Extract ark IDs: ark:/53355/cl0... or cl...
    const re = /ark:\/53355\/(cl[0-9]+)/g;
    let m;
    let pageCount = 0;
    while ((m = re.exec(html)) !== null) {
      if (!seen.has(m[1])) {
        seen.add(m[1]);
        arkIds.push(m[1]);
        pageCount++;
      }
    }

    console.log(`${pageCount} new IDs (total: ${arkIds.length})`);

    if (pageCount === 0) {
      console.log('No new IDs, stopping.');
      break;
    }

    await sleep(DELAY);
  }

  writeFileSync(CHECKPOINT, JSON.stringify(arkIds, null, 2), 'utf8');
  console.log(`\nSaved ${arkIds.length} ark IDs to checkpoint\n`);
  return arkIds;
}

// ---------- Phase 2: fetch JSON per ark ------------------------------------

function parseArkData(data, arkId) {
  if (!data) return null;

  // Title
  const title = data.title || data.label || '(untitled)';

  // Artist
  let artist = '';
  if (data.creator && data.creator.length > 0) {
    const c = data.creator[0];
    artist = c.label || '';
  }

  // Year
  let year = '';
  if (data.dateCreated && data.dateCreated.length > 0) {
    const d = data.dateCreated[0];
    year = d.displayDate || d.text || d.startYear?.toString() || '';
  }

  // Image
  let image = '';
  if (data.image && data.image.length > 0) {
    const img = data.image[0];
    image = img.urlImage || img.urlThumbnail || '';
  }

  // Dimensions
  let dimensions = '';
  if (data.dimension && data.dimension.length > 0) {
    dimensions = data.dimension.map((d) => d.displayValue || '').filter(Boolean).join('; ');
  }

  // Medium
  const medium = data.materialsAndTechniques || '';

  // Inventory number
  const inventoryNo =
    data.inventoryNumber || (data.inventoryNumbers && data.inventoryNumbers[0]) || '';

  // Detail URL
  const detailUrl = `${BASE}/en/ark:/53355/${arkId}`;

  // Collection area
  let collectionArea = '';
  if (data.collection && data.collection.length > 0) {
    collectionArea = data.collection[0].label || data.collection[0] || '';
  }

  return {
    id: `louvre-${arkId}`,
    title,
    artist,
    year,
    image,
    dimensions,
    medium,
    inventoryNo,
    source: 'Musée du Louvre',
    collectionArea,
    detailUrl,
  };
}

async function runPool(tasks, concurrency) {
  const results = [];
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      const result = await tasks[i]();
      results[i] = result;
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results;
}

// ---------- Main -----------------------------------------------------------

async function main() {
  console.log('=== Louvre Painting Scraper (Fresh) ===\n');

  // Phase 1
  console.log('--- Phase 1: Collecting ark IDs ---');
  const arkIds = await collectArkIds();
  console.log(`\nTotal unique ark IDs: ${arkIds.length}\n`);

  // Phase 2
  console.log('--- Phase 2: Fetching artwork JSON ---');

  // Load existing progress if resuming
  const done = new Map(); // arkId → object
  if (existsSync(PROGRESS)) {
    const lines = readFileSync(PROGRESS, 'utf8').trim().split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        done.set(obj.id.replace('louvre-', ''), obj);
      } catch {}
    }
    console.log(`Resuming: ${done.size} already done`);
  }

  const remaining = arkIds.filter((id) => !done.has(id));
  console.log(`Fetching ${remaining.length} remaining items...\n`);

  let processed = 0;
  let errors = 0;
  const progressStream = [];

  // Process in batches for feedback
  const BATCH = 100;
  for (let b = 0; b < remaining.length; b += BATCH) {
    const batch = remaining.slice(b, b + BATCH);

    const tasks = batch.map((arkId) => async () => {
      await sleep(Math.random() * 100); // small jitter
      const data = await fetchJson(ARK_JSON_URL(arkId));
      const obj = data ? parseArkData(data, arkId) : null;
      if (!obj) {
        errors++;
        return null;
      }
      return obj;
    });

    const results = await runPool(tasks, CONCURRENCY);
    const valid = results.filter(Boolean);
    processed += valid.length;

    // Append to progress file
    const lines = valid.map((o) => JSON.stringify(o)).join('\n');
    if (lines) {
      writeFileSync(PROGRESS, lines + '\n', { flag: 'a' });
    }
    for (const o of valid) {
      done.set(o.id.replace('louvre-', ''), o);
    }

    console.log(
      `Batch ${Math.floor(b / BATCH) + 1}/${Math.ceil(remaining.length / BATCH)}: ${valid.length}/${batch.length} ok (total processed: ${done.size})`
    );
  }

  // Assemble final output
  const objects = arkIds
    .map((id) => done.get(id))
    .filter(Boolean);

  const out = {
    museum: 'Musée du Louvre',
    museumId: 'louvre',
    scrapedAt: new Date().toISOString(),
    totalObjects: objects.length,
    objects,
  };

  writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
  console.log(`\n✅ Saved ${objects.length} items → ${OUT}`);
  if (errors > 0) console.log(`⚠ ${errors} items failed`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
