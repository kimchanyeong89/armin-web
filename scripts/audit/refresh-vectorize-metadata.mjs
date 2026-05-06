#!/usr/bin/env node
// Bulk-refresh Vectorize metadata from the local collection JSONs.
// Why: many vectors were upserted historically with empty metadata, so the
// search/recommend response carries blank image/title/artist fields and the
// app renders blank cards even though the underlying embedding exists.
//
// This script:
//   1. Walks every JSON in public/data/, builds an id → metadata map
//      using the same compact keys the worker emits (n, a, m, i, e, d, c, u).
//   2. Posts in batches of 100 to /refresh-metadata.
//      Each batch internally does Vectorize.getByIds + upsert with same vector.
//   3. Reports per-batch updated/missing counts.
//
// Modes:
//   default       — refresh ALL ids in the JSON map (~640K → ~6400 batches)
//   --since-id=X  — start from this id (resume after interruption)
//   --limit=N     — only process N records (debug/test)
//   --ids=a,b,c   — refresh only these specific ids
//   --dry-run     — print the batches without sending them
//
// Also deletes the known debug entries (test-probe-123, test-id-1,
// test-short-id-debug-12345) at the end.

import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const DATA_DIR = path.join(REPO_ROOT, 'public', 'data');
const WORKER = 'https://armin-semantic-search.armin-art.workers.dev';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const sinceArg = args.find((a) => a.startsWith('--since-id='));
const SINCE_ID = sinceArg ? sinceArg.split('=')[1] : null;
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : Infinity;
const idsArg = args.find((a) => a.startsWith('--ids='));
const ID_FILTER = idsArg ? new Set(idsArg.split('=')[1].split(',')) : null;

const TEST_IDS_TO_DELETE = ['test-probe-123', 'test-id-1', 'test-short-id-debug-12345'];
const BATCH_SIZE = 20; // Vectorize getByIds caps at 20 (HTTP 500 above 20)
const CONCURRENCY = 12; // parallel batches sent to the worker

function pickFields(item, defaults) {
  return {
    n: String(item?.title || item?.name || item?.n || '').trim(),
    a: String(item?.artist || item?.creator || item?.a || '').trim(),
    m: String(item?.museum || item?.museumName || item?.m || defaults.museum || '').trim(),
    i: String(item?.image || item?.imageUrl || item?.image_url || item?.i || '').trim(),
    e: String(item?.exhibitionId || item?.exhibition_id || item?.e || defaults.exhibition_id || '').trim(),
    d: String(item?.year || item?.date || item?.d || '').trim(),
    c: String(item?.category || item?.medium || item?.c || '').trim(),
    u: String(item?.sourceUrl || item?.source_url || item?.url || item?.u || item?.detailUrl || '').trim(),
  };
}

function loadIdMap() {
  const map = new Map();
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
  for (const f of files) {
    const full = path.join(DATA_DIR, f);
    let raw;
    try { raw = fs.readFileSync(full, 'utf8'); }
    catch { continue; }
    let data;
    try { data = JSON.parse(raw); }
    catch (parseErr) {
      const idx = raw.indexOf('}{');
      if (idx > -1) {
        try { data = JSON.parse(raw.slice(idx + 1)); } catch { continue; }
      } else { continue; }
    }
    const arr = Array.isArray(data) ? data : (data.objects || data.items || data.artworks || data.collection || []);
    if (!Array.isArray(arr)) continue;

    const defaults = {
      museum: data?.galleryName || data?.museum || '',
      exhibition_id: data?.galleryId || data?.exhibitionId || path.basename(f, '.json'),
    };

    for (const item of arr) {
      const id = String(item?.id || item?.semanticId || item?.semantic_id || '').trim();
      if (!id) continue;
      // Skip if image URL is empty — refreshing metadata to "" is pointless.
      const meta = pickFields(item, defaults);
      if (!meta.i) continue;
      // Skip IDs longer than Vectorize's 64-byte limit. These IDs were
      // never successfully embedded anyway (the original /upsert pipeline
      // would have rejected them with the same VECTOR_GET_ERROR 40008).
      // Sending them in a batch causes Vectorize to reject the entire
      // batch (cascade failure for the 19 valid IDs alongside).
      if (Buffer.byteLength(id, 'utf8') > 64) continue;
      // First write wins (some IDs appear in multiple files; prefer the
      // collection JSON over search-index dups)
      if (!map.has(id) || f.includes('-collection.json')) {
        map.set(id, meta);
      }
    }
  }
  return map;
}

async function postBatch(batch) {
  const body = {
    records: batch.map(([id, metadata]) => ({ id, metadata })),
  };
  const res = await fetch(`${WORKER}/refresh-metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

async function deleteTestEntries() {
  console.log(`Deleting ${TEST_IDS_TO_DELETE.length} test entries...`);
  const res = await fetch(`${WORKER}/delete-ids`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: TEST_IDS_TO_DELETE }),
  });
  const json = await res.json().catch(() => ({}));
  console.log('  Result:', JSON.stringify(json));
}

async function main() {
  console.log(`Building id → metadata map from ${DATA_DIR}...`);
  const map = loadIdMap();
  console.log(`Total IDs with images in JSON: ${map.size}`);

  // Filter / scope
  let entries = Array.from(map.entries());
  if (ID_FILTER) {
    entries = entries.filter(([id]) => ID_FILTER.has(id));
    console.log(`Filtered to --ids: ${entries.length}`);
  }
  if (SINCE_ID) {
    const idx = entries.findIndex(([id]) => id === SINCE_ID);
    if (idx >= 0) {
      entries = entries.slice(idx);
      console.log(`Resuming from --since-id=${SINCE_ID}: ${entries.length} remaining`);
    }
  }
  if (entries.length > LIMIT) entries = entries.slice(0, LIMIT);

  console.log(`Will ${DRY_RUN ? 'PREVIEW' : 'PUSH'} ${entries.length} records in batches of ${BATCH_SIZE}...`);

  let updated = 0;
  let missing = 0;
  let failed = 0;
  let processed = 0;
  const startedAt = Date.now();
  const totalBatches = Math.ceil(entries.length / BATCH_SIZE);

  // Build the work queue (array of batches)
  const batches = [];
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    batches.push({ idx: i / BATCH_SIZE, batch: entries.slice(i, i + BATCH_SIZE) });
  }

  if (DRY_RUN) {
    console.log(`Would push ${batches.length} batches:`);
    batches.slice(0, 3).forEach(({ idx, batch }) => {
      console.log(`  batch ${idx} (${batch.length}):`);
      batch.slice(0, 3).forEach(([id, m]) => console.log(`    ${id}: ${m.n.slice(0,30)} | ${m.a.slice(0,20)} | i=${m.i.slice(0,40)}`));
    });
    return;
  }

  // Worker pool
  const queue = batches.slice();
  const lastReportedAt = { ts: Date.now() };
  async function worker() {
    while (queue.length) {
      const { idx, batch } = queue.shift();
      try {
        const r = await postBatch(batch);
        if (r.status === 200) {
          updated += r.updated || 0;
          missing += r.missing || 0;
        } else {
          failed += batch.length;
          if (idx % 50 === 0) console.warn(`  batch ${idx}: HTTP ${r.status} — ${JSON.stringify(r).slice(0, 200)}`);
        }
      } catch (e) {
        failed += batch.length;
        console.warn(`  batch ${idx}: ${e.message || e}`);
      }
      processed += batch.length;
      // Progress every 5 seconds
      if (Date.now() - lastReportedAt.ts > 5000) {
        lastReportedAt.ts = Date.now();
        const elapsed = (Date.now() - startedAt) / 1000;
        const rate = processed / elapsed;
        const eta = ((entries.length - processed) / Math.max(rate, 1)) | 0;
        console.log(`  ${processed}/${entries.length} processed (${(processed/entries.length*100).toFixed(1)}%), updated=${updated}, missing=${missing}, failed=${failed}, ${rate.toFixed(1)} rec/s, ETA ${eta}s`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log(`\nDone. updated=${updated}  missing=${missing}  failed=${failed}  in ${((Date.now()-startedAt)/1000).toFixed(0)}s`);

  if (!DRY_RUN) {
    await deleteTestEntries();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
