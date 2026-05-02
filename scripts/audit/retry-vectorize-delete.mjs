#!/usr/bin/env node
// Retry just the Vectorize portion of the placeholder deletion using the
// 100-IDs-per-batch limit imposed by Cloudflare. JSONs were already pruned
// by delete-placeholders.mjs --apply; this script only deletes from the
// vector index using the same ID list reconstructed from head-results.ndjson.

import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const HEAD_LOG = path.join(REPO_ROOT, 'scripts', 'audit', 'head-results.ndjson');
const WORKER_DELETE = 'https://armin-semantic-search.armin-art.workers.dev/delete-ids';
const CLUSTER_THRESHOLD = 5;
const BATCH = 100;

function readNdjson() {
  const out = [];
  for (const line of fs.readFileSync(HEAD_LOG, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch {}
  }
  return out;
}

function placeholderIds(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (r.status !== 200 || !r.contentLength) continue;
    const k = `${r.host}|${r.contentLength}|${r.etag}`;
    (groups.get(k) || groups.set(k, []).get(k)).push(r);
  }
  const ids = new Set();
  for (const list of groups.values()) {
    const distinct = new Set(list.map((r) => r.id));
    if (distinct.size >= CLUSTER_THRESHOLD) {
      for (const r of list) ids.add(r.id);
    }
  }
  return Array.from(ids);
}

async function main() {
  const rows = readNdjson();
  const ids = placeholderIds(rows);
  console.log(`Deleting ${ids.length} IDs from Vectorize in batches of ${BATCH}...`);

  let okCount = 0, failCount = 0;
  const failures = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    try {
      const res = await fetch(WORKER_DELETE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: batch }),
      });
      const text = await res.text();
      if (res.ok) {
        okCount += batch.length;
        console.log(`  batch ${i / BATCH}: HTTP ${res.status} (${batch.length} deleted)`);
      } else {
        failCount += batch.length;
        failures.push({ batch: i / BATCH, status: res.status, body: text.slice(0, 200) });
        console.warn(`  batch ${i / BATCH}: HTTP ${res.status} — ${text.slice(0, 200)}`);
      }
    } catch (err) {
      failCount += batch.length;
      failures.push({ batch: i / BATCH, error: String(err) });
      console.warn(`  batch ${i / BATCH}: ${err}`);
    }
  }

  console.log('');
  console.log(`Done. OK=${okCount} fail=${failCount}`);
  if (failures.length) console.log('Failures:', JSON.stringify(failures, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
