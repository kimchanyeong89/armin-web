#!/usr/bin/env node
// Remove confirmed-placeholder artworks from collection JSONs and from the
// Vectorize index.  Confirmed = appeared in a (host, content-length, etag)
// cluster of >=5 distinct IDs in scripts/audit/head-results.ndjson.  Each
// cluster represents one image file served under many different URLs / IDs.
//
// Two phases, gated by --apply:
//   Default (dry-run): prints what would be deleted, writes nothing.
//   --apply:           edits JSON files in place AND posts IDs to
//                      https://armin-semantic-search.armin-art.workers.dev/delete-ids
//
// Usage:
//   node scripts/audit/delete-placeholders.mjs           # dry run
//   node scripts/audit/delete-placeholders.mjs --apply   # commits + worker call

import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const DATA_DIR = path.join(REPO_ROOT, 'public', 'data');
const HEAD_LOG = path.join(REPO_ROOT, 'scripts', 'audit', 'head-results.ndjson');
const REPORT_OUT = path.join(REPO_ROOT, 'scripts', 'audit', 'placeholder-deletion-report.json');
const WORKER_DELETE = 'https://armin-semantic-search.armin-art.workers.dev/delete-ids';

const CLUSTER_THRESHOLD = 5;
const APPLY = process.argv.includes('--apply');

function readNdjson() {
  const text = fs.readFileSync(HEAD_LOG, 'utf8');
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return out;
}

function clusterPlaceholders(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (r.status !== 200) continue;
    if (!r.contentLength) continue;
    const key = `${r.host}|${r.contentLength}|${r.etag}`;
    const list = groups.get(key) || [];
    list.push(r);
    groups.set(key, list);
  }
  const clusters = [];
  for (const [signature, list] of groups) {
    const distinct = new Set(list.map((r) => r.id));
    if (distinct.size < CLUSTER_THRESHOLD) continue;
    clusters.push({ signature, list, distinctIds: distinct.size });
  }
  return clusters.sort((a, b) => b.distinctIds - a.distinctIds);
}

function loadJsonResilient(file) {
  const raw = fs.readFileSync(file, 'utf8');
  try {
    return { data: JSON.parse(raw), repaired: false };
  } catch (err) {
    const idx = raw.indexOf('}{');
    if (idx > -1) {
      try {
        const data = JSON.parse(raw.slice(idx + 1));
        return { data, repaired: true };
      } catch {}
    }
    throw err;
  }
}

function getEntriesArray(data) {
  if (Array.isArray(data)) return { arr: data, container: null, key: null };
  for (const k of ['objects', 'items', 'artworks', 'collection']) {
    if (Array.isArray(data?.[k])) return { arr: data[k], container: data, key: k };
  }
  return { arr: [], container: null, key: null };
}

async function postDeleteIds(ids) {
  // Worker /delete-ids accepts {ids: string[]}. Cloudflare Vectorize caps
  // deleteByIds at 100 IDs per call (error code 40007), so we batch tight.
  const BATCH = 100;
  const results = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const res = await fetch(WORKER_DELETE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: batch }),
    });
    const body = await res.text();
    results.push({ batch: i / BATCH, count: batch.length, status: res.status, body: body.slice(0, 500) });
    if (!res.ok) console.warn(`  Vectorize batch ${i / BATCH}: HTTP ${res.status} — ${body.slice(0, 200)}`);
    else console.log(`  Vectorize batch ${i / BATCH}: deleted ${batch.length} (HTTP ${res.status})`);
  }
  return results;
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will edit files + call worker)' : 'DRY RUN (no writes)'}`);
  console.log(`Reading ${HEAD_LOG}...`);
  const rows = readNdjson();
  console.log(`  ${rows.length} probe results loaded.`);

  const clusters = clusterPlaceholders(rows);
  console.log(`Found ${clusters.length} placeholder clusters (>=${CLUSTER_THRESHOLD} distinct IDs sharing a signature).`);

  // Group entries to delete by collection file.
  const perCollection = new Map();
  let totalEntries = 0;
  for (const cl of clusters) {
    for (const entry of cl.list) {
      const list = perCollection.get(entry.collection) || [];
      list.push({ id: entry.id, signature: cl.signature, url: entry.url });
      perCollection.set(entry.collection, list);
      totalEntries++;
    }
  }
  console.log(`Affecting ${totalEntries} entries across ${perCollection.size} collection files.`);

  const summary = [];
  const allIds = new Set();
  for (const [file, entries] of perCollection) {
    const filePath = path.join(DATA_DIR, file);
    let result;
    try { result = loadJsonResilient(filePath); }
    catch (e) { summary.push({ file, error: e.message, removed: 0 }); continue; }

    const { arr } = getEntriesArray(result.data);
    if (!arr.length) { summary.push({ file, error: 'no entries array', removed: 0 }); continue; }

    const removeIds = new Set(entries.map((e) => e.id));
    const before = arr.length;
    const kept = arr.filter((item) => {
      const id = String(item?.id || item?.semanticId || item?.semantic_id || '');
      const drop = id && removeIds.has(id);
      if (drop) allIds.add(id);
      return !drop;
    });
    const removed = before - kept.length;
    summary.push({ file, before, after: kept.length, removed, repaired: result.repaired });
    console.log(`  ${file}: ${before} -> ${kept.length} (removed ${removed}${result.repaired ? ', JSON repaired' : ''})`);

    if (APPLY && removed > 0) {
      // Mutate in place: keep top-level fields, replace array key
      const { container, key } = getEntriesArray(result.data);
      if (Array.isArray(result.data)) {
        fs.writeFileSync(filePath, JSON.stringify(kept, null, 2) + '\n');
      } else if (container && key) {
        container[key] = kept;
        fs.writeFileSync(filePath, JSON.stringify(container, null, 2) + '\n');
      }
    }
  }

  console.log('');
  console.log(`Total unique IDs to delete from Vectorize: ${allIds.size}`);

  let workerResults = null;
  if (APPLY && allIds.size > 0) {
    console.log('Calling worker /delete-ids ...');
    try { workerResults = await postDeleteIds(Array.from(allIds)); }
    catch (e) { console.error('Vectorize delete failed:', e); workerResults = { error: String(e) }; }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    clustersFound: clusters.length,
    totalEntries,
    affectedCollections: perCollection.size,
    uniqueIdsToDelete: allIds.size,
    perCollection: summary,
    workerResults,
  };
  fs.writeFileSync(REPORT_OUT, JSON.stringify(report, null, 2));
  console.log(`Wrote ${REPORT_OUT}`);
  if (!APPLY) console.log(`Re-run with --apply to commit changes.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
