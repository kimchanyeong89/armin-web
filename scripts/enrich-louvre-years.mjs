/**
 * Enrich Louvre painting collection with precise years from the Louvre API.
 * Items that only have century-text years (e.g. "2e tiers du XVIIIe siècle")
 * get updated with the API's integer startYear (e.g. 1755).
 *
 * Usage: node scripts/enrich-louvre-years.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, '../public/data/louvre-painting-collection.json');
const CONCURRENCY = 20;
const DELAY_MS = 100; // ms between batches to be polite

const raw = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
const items = raw.objects;

// Only enrich items that have NO 4-digit year in their year field
const HAS_YEAR_RE = /\d{4}/;
const toEnrich = items.filter(item => item.year && !HAS_YEAR_RE.test(String(item.year)));

console.log(`Total items: ${items.length}`);
console.log(`Items to enrich (no 4-digit year): ${toEnrich.length}`);

// Build a map from id → item index for fast update
const idToIndex = new Map();
items.forEach((item, idx) => idToIndex.set(item.id, idx));

async function fetchYear(item) {
  const arkId = item.id.replace('louvre-', '');
  const url = `https://collections.louvre.fr/en/ark:/53355/${arkId}.json`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; museum-enrichment-bot/1.0)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const dateCreated = data.dateCreated?.[0];
    if (!dateCreated) return null;
    const startYear = dateCreated.startYear;
    const endYear = dateCreated.endYear;
    if (startYear == null) return null;
    if (endYear != null && endYear !== startYear) {
      return `${startYear} - ${endYear}`;
    }
    return String(startYear);
  } catch {
    return null;
  }
}

// Process in batches of CONCURRENCY
let updated = 0;
let failed = 0;
const total = toEnrich.length;
const startTime = Date.now();

for (let i = 0; i < total; i += CONCURRENCY) {
  const batch = toEnrich.slice(i, i + CONCURRENCY);
  const results = await Promise.all(batch.map(item => fetchYear(item)));

  results.forEach((newYear, j) => {
    const item = batch[j];
    if (newYear) {
      const idx = idToIndex.get(item.id);
      if (idx !== undefined) {
        items[idx].year = newYear;
        updated++;
      }
    } else {
      failed++;
    }
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const pct = (((i + batch.length) / total) * 100).toFixed(1);
  process.stdout.write(`\r[${elapsed}s] ${i + batch.length}/${total} (${pct}%) updated=${updated} failed=${failed}  `);

  if (i + CONCURRENCY < total) {
    await new Promise(r => setTimeout(r, DELAY_MS));
  }
}

console.log(`\n\nDone! Updated: ${updated}, Failed/No-data: ${failed}`);

// Save updated data
raw.objects = items;
writeFileSync(DATA_FILE, JSON.stringify(raw, null, 0));
console.log(`Saved to ${DATA_FILE}`);

// Quick stats
const still_no_year = items.filter(x => x.year && !HAS_YEAR_RE.test(String(x.year)));
console.log(`Items still lacking 4-digit year: ${still_no_year.length}`);
