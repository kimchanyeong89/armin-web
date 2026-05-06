#!/usr/bin/env node
// Migrate the 17K artwork records whose IDs are longer than Vectorize's
// 64-byte limit. For each:
//   1. Determine the deterministic vbz_xxxx alias (computed by the worker)
//   2. POST to /encode-and-upsert with {originalId, imageUrl, metadata}
//   3. Worker fetches the image, runs SigLIP get_image_features, upserts
//      under the alias with metadata.o = originalId
//
// After this completes, frontend queries with the long original ID
// transparently round-trip through the alias — every endpoint
// (/recommend-by-id, /check-ids, /delete-ids, /search-by-text, etc.)
// translates inbound IDs and substitutes metadata.o back into the
// response. The frontend never sees a vbz_ alias.
//
// Prerequisites:
//   - SigLIP HuggingFace Space redeployed with the new /encode-image
//     endpoint (workers/siglip-encoder-space/app.py + requirements.txt)
//   - Worker version ef809f05 or later (has /encode-and-upsert)
//
// Modes:
//   default          — process every long-ID artwork in JSON
//   --limit=N        — only process N records (debug/test)
//   --since-id=X     — resume after this id
//   --collection=X   — only process this collection file
//   --dry-run        — print what would be sent, don't call worker

import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const DATA_DIR = path.join(REPO_ROOT, 'public', 'data');
const WORKER = 'https://armin-semantic-search.armin-art.workers.dev';
const REPORT_OUT = path.join(REPO_ROOT, 'scripts', 'audit', 'migrate-long-ids-report.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : Infinity;
const sinceArg = args.find((a) => a.startsWith('--since-id='));
const SINCE_ID = sinceArg ? sinceArg.split('=')[1] : null;
const collectionArg = args.find((a) => a.startsWith('--collection='));
const COLLECTION_FILTER = collectionArg ? collectionArg.split('=')[1] : null;

// /encode-and-upsert caps at 10 records/call (image encoding is heavy).
const BATCH_SIZE = 10;
// Image encoding on free-tier HF CPU Space is ~2-5s per image. Don't pile on.
const CONCURRENCY = 2;

function pickFields(item, defaults) {
  return {
    n: String(item?.title || item?.name || item?.n || '').trim(),
    a: String(item?.artist || item?.creator || item?.a || '').trim(),
    m: String(item?.museum || item?.museumName || item?.m || defaults.museum || '').trim(),
    e: String(item?.exhibitionId || item?.exhibition_id || item?.e || defaults.exhibition_id || '').trim(),
    d: String(item?.year || item?.date || item?.d || '').trim(),
    c: String(item?.category || item?.medium || item?.c || '').trim(),
    u: String(item?.sourceUrl || item?.source_url || item?.url || item?.u || item?.detailUrl || '').trim(),
  };
}

function loadLongIdEntries() {
  const entries = [];
  const seen = new Set();
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
  for (const f of files) {
    if (COLLECTION_FILTER && f !== COLLECTION_FILTER) continue;
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); }
    catch { continue; }
    const arr = Array.isArray(data) ? data : (data.objects || data.items || data.artworks || data.collection || []);
    if (!Array.isArray(arr)) continue;

    const defaults = {
      museum: data?.galleryName || data?.museum || '',
      exhibition_id: data?.galleryId || data?.exhibitionId || path.basename(f, '.json'),
    };

    for (const item of arr) {
      const id = String(item?.id || item?.semanticId || item?.semantic_id || '').trim();
      if (!id) continue;
      // Long IDs only
      if (Buffer.byteLength(id, 'utf8') <= 64) continue;
      // Need an image URL to encode
      const imageUrl = String(item?.image || item?.imageUrl || item?.image_url || item?.i || '').trim();
      if (!imageUrl) continue;
      // Dedupe across files
      if (seen.has(id)) continue;
      seen.add(id);
      entries.push({ id, imageUrl, metadata: pickFields(item, defaults), collection: f });
    }
  }
  return entries;
}

async function postBatch(batch) {
  const body = {
    records: batch.map((r) => ({ id: r.id, imageUrl: r.imageUrl, metadata: r.metadata })),
  };
  const res = await fetch(`${WORKER}/encode-and-upsert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY (will call /encode-and-upsert)'}`);
  console.log(`Loading long-ID entries from ${DATA_DIR}...`);
  let entries = loadLongIdEntries();
  console.log(`Found ${entries.length} unique long-ID entries with image URLs.`);

  if (SINCE_ID) {
    const idx = entries.findIndex((e) => e.id === SINCE_ID);
    if (idx >= 0) {
      entries = entries.slice(idx);
      console.log(`Resuming from --since-id=${SINCE_ID}: ${entries.length} remaining`);
    }
  }
  if (entries.length > LIMIT) entries = entries.slice(0, LIMIT);

  console.log(`Will process ${entries.length} records, batches of ${BATCH_SIZE}, concurrency ${CONCURRENCY}.`);
  console.log(`Estimated time: ~${Math.round(entries.length * 3 / CONCURRENCY)}s on free-tier CPU Space.`);

  if (DRY_RUN) {
    console.log('\nFirst 5 entries:');
    entries.slice(0, 5).forEach((e) => {
      const bytes = Buffer.byteLength(e.id, 'utf8');
      console.log(`  [${bytes}B] ${e.id.slice(0, 60)}... → ${e.imageUrl.slice(0, 80)}...`);
    });
    return;
  }

  const batches = [];
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    batches.push({ idx: i / BATCH_SIZE, batch: entries.slice(i, i + BATCH_SIZE) });
  }

  let upserted = 0;
  let failed = 0;
  let processed = 0;
  const startedAt = Date.now();
  const failures = [];
  const queue = batches.slice();

  const lastReportedAt = { ts: Date.now() };
  async function worker() {
    while (queue.length) {
      const { idx, batch } = queue.shift();
      try {
        const r = await postBatch(batch);
        if (r.status === 200) {
          upserted += r.upserted || 0;
          failed += r.failed || 0;
          if (r.results) {
            for (const item of r.results) {
              if (!item.ok) failures.push({ id: item.id, lookupId: item.lookupId, error: item.error });
            }
          }
        } else {
          failed += batch.length;
          if (idx % 5 === 0) console.warn(`  batch ${idx}: HTTP ${r.status} — ${JSON.stringify(r).slice(0, 200)}`);
        }
      } catch (e) {
        failed += batch.length;
        console.warn(`  batch ${idx}: ${e.message || e}`);
      }
      processed += batch.length;
      if (Date.now() - lastReportedAt.ts > 10000) {
        lastReportedAt.ts = Date.now();
        const elapsed = (Date.now() - startedAt) / 1000;
        const rate = processed / elapsed;
        const eta = ((entries.length - processed) / Math.max(rate, 0.1)) | 0;
        console.log(`  ${processed}/${entries.length} processed (${(processed/entries.length*100).toFixed(1)}%), upserted=${upserted}, failed=${failed}, ${rate.toFixed(2)} rec/s, ETA ${eta}s`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log(`\nDone. upserted=${upserted}, failed=${failed} in ${((Date.now()-startedAt)/1000).toFixed(0)}s`);

  fs.writeFileSync(REPORT_OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalProcessed: processed,
    upserted,
    failed,
    failures,
  }, null, 2));
  console.log(`Wrote ${REPORT_OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
