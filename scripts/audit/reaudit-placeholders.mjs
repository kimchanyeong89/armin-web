#!/usr/bin/env node
// Targeted re-audit: re-HEAD every R2 image URL still in our collection
// JSONs at LOW concurrency (so R2 doesn't throttle), then flag any URL
// whose (content-length, etag) matches the placeholder signatures already
// confirmed during the first audit.  Outputs:
//   scripts/audit/reaudit-placeholders.json  — full list of (collection, id)
//                                                tuples confirmed as placeholder
// Run with --apply to actually delete from JSON + Vectorize.
//
// Why this exists:
// The original audit at concurrency 24 against R2 produced inconsistent
// HEAD responses (occasional 429s, slow timeouts).  Only entries whose
// successful 200 response made it into a cluster of >=5 distinct IDs got
// deleted.  Many surviving entries actually share the placeholder bytes
// but didn't end up in a cluster purely because their HEAD response was
// slow / dropped during the initial run.
//
// This script trusts the known placeholder signatures from the first
// audit (every cluster of >=5 IDs that we already verified) and just
// re-checks every URL one more time at safe concurrency.

import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const DATA_DIR = path.join(REPO_ROOT, 'public', 'data');
const HEAD_LOG = path.join(REPO_ROOT, 'scripts', 'audit', 'head-results.ndjson');
const REPORT_OUT = path.join(REPO_ROOT, 'scripts', 'audit', 'reaudit-placeholders.json');
const WORKER_DELETE = 'https://armin-semantic-search.armin-art.workers.dev/delete-ids';

const APPLY = process.argv.includes('--apply');
const SCOPE_ARG = process.argv.find((a) => a.startsWith('--scope='));
const SCOPE_FILES = SCOPE_ARG ? new Set(SCOPE_ARG.split('=')[1].split(',')) : null;
const CONCURRENCY = 6;
const HEAD_TIMEOUT = 15_000;
const RETRY_BACKOFF_MS = 1500;
const MAX_RETRIES = 3;

// 1) Load known placeholder signatures from the first audit.
function loadKnownSignatures() {
  if (!fs.existsSync(HEAD_LOG)) {
    console.error('Missing head-results.ndjson — run audit-images.mjs first.');
    process.exit(1);
  }
  const groups = new Map();
  for (const line of fs.readFileSync(HEAD_LOG, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r.status !== 200 || !r.contentLength) continue;
      const sig = `${r.host}|${r.contentLength}|${r.etag}`;
      const list = groups.get(sig) || [];
      list.push(r.id);
      groups.set(sig, list);
    } catch {}
  }
  const sigs = new Set();
  for (const [sig, ids] of groups) {
    const distinct = new Set(ids);
    if (distinct.size >= 5) sigs.add(sig);
  }
  return sigs;
}

// 2) Walk every JSON in public/data, gather (collection, id, url) for R2 URLs.
function loadAllEntries() {
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
  const entries = [];
  for (const f of files) {
    if (SCOPE_FILES && !SCOPE_FILES.has(f)) continue;
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); }
    catch { continue; }
    const arr = Array.isArray(data) ? data : (data.objects || data.items || data.artworks || data.collection || []);
    if (!Array.isArray(arr)) continue;
    for (const it of arr) {
      const url = it?.image || it?.imageUrl || it?.image_url || it?.i || '';
      const id = it?.id || it?.semanticId || it?.semantic_id || '';
      if (!url || !id) continue;
      if (!String(url).includes('r2.dev')) continue; // only R2-hosted
      entries.push({ collection: f, id: String(id), url: String(url) });
    }
  }
  return entries;
}

async function probeOnce(url, attempt = 0) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), HEAD_TIMEOUT);
  try {
    const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal, redirect: 'follow' });
    if (res.status === 429 && attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS * (attempt + 1)));
      return probeOnce(url, attempt + 1);
    }
    return {
      status: res.status,
      contentLength: Number(res.headers.get('content-length') || 0),
      etag: res.headers.get('etag') || '',
    };
  } catch (e) {
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS * (attempt + 1)));
      return probeOnce(url, attempt + 1);
    }
    return { status: 0, contentLength: 0, etag: '', error: String(e) };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will delete)' : 'DRY RUN'}`);
  const sigs = loadKnownSignatures();
  console.log(`Known placeholder signatures: ${sigs.size}`);

  const all = loadAllEntries();
  console.log(`Re-probing ${all.length} R2 URLs at concurrency ${CONCURRENCY}...`);

  const placeholderHits = [];
  let done = 0;
  let throttled = 0;
  const queue = all.slice();
  const startedAt = Date.now();

  async function worker() {
    while (queue.length) {
      const item = queue.shift();
      const r = await probeOnce(item.url);
      done++;
      const sig = `${new URL(item.url).host}|${r.contentLength}|${r.etag}`;
      if (r.status === 200 && sigs.has(sig)) {
        placeholderHits.push({ ...item, signature: sig, contentLength: r.contentLength, etag: r.etag });
      }
      if (r.status === 429) throttled++;
      if (done % 500 === 0) {
        const elapsed = (Date.now() - startedAt) / 1000;
        const rate = done / elapsed;
        const eta = ((all.length - done) / rate) | 0;
        console.log(`  ${done}/${all.length} done (${(done / all.length * 100).toFixed(1)}%), placeholder hits=${placeholderHits.length}, throttled=${throttled}, ${rate.toFixed(1)}/s, ETA ${eta}s`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  console.log(`\nDone in ${((Date.now() - startedAt) / 1000).toFixed(0)}s. Placeholder hits: ${placeholderHits.length}, 429-throttled: ${throttled}.`);

  // Group by collection for the report
  const byCollection = new Map();
  for (const h of placeholderHits) {
    const list = byCollection.get(h.collection) || [];
    list.push(h);
    byCollection.set(h.collection, list);
  }
  const collectionsSorted = Array.from(byCollection.entries())
    .map(([file, list]) => ({ file, count: list.length }))
    .sort((a, b) => b.count - a.count);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    totalProbed: all.length,
    placeholderConfirmed: placeholderHits.length,
    perCollection: collectionsSorted,
    hits: placeholderHits,
  };
  fs.writeFileSync(REPORT_OUT, JSON.stringify(report, null, 2));
  console.log(`Wrote ${REPORT_OUT}`);

  console.log('\nTop affected collections:');
  collectionsSorted.slice(0, 25).forEach((c) => console.log(`  ${c.file.padEnd(46)} ${c.count}`));

  if (!APPLY) {
    console.log('\nRe-run with --apply to delete from JSON + Vectorize.');
    return;
  }

  // 3) Apply: per-collection JSON edits.
  // Skip search-index-part-*.json — those are auto-generated from the
  // collection files and will regenerate clean after the next index build.
  console.log('\nApplying JSON deletions (collection files only — search-index files regenerate)...');
  for (const [file, list] of byCollection) {
    if (file.startsWith('search-index')) {
      console.log(`  ${file}: SKIPPED (auto-generated; rebuild after collection cleanup)`);
      continue;
    }
    const filePath = path.join(DATA_DIR, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const arr = Array.isArray(data) ? data : (data.objects || data.items || data.artworks || data.collection || []);
    const removeIds = new Set(list.map((e) => e.id));
    const before = arr.length;
    const kept = arr.filter((it) => {
      const id = String(it?.id || it?.semanticId || it?.semantic_id || '');
      return !id || !removeIds.has(id);
    });
    if (Array.isArray(data)) {
      const out = JSON.stringify(kept);
      fs.writeFileSync(filePath, out);
    } else {
      const key = ['objects', 'items', 'artworks', 'collection'].find((k) => Array.isArray(data[k]));
      if (key) { data[key] = kept; fs.writeFileSync(filePath, JSON.stringify(data)); }
    }
    console.log(`  ${file}: ${before} -> ${kept.length} (removed ${before - kept.length})`);
  }

  // 4) Vectorize delete
  console.log('\nDeleting from Vectorize (batches of 100)...');
  const allIds = Array.from(new Set(placeholderHits.map((h) => h.id)));
  const BATCH = 100;
  for (let i = 0; i < allIds.length; i += BATCH) {
    const batch = allIds.slice(i, i + BATCH);
    try {
      const res = await fetch(WORKER_DELETE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: batch }),
      });
      if (res.ok) console.log(`  batch ${i / BATCH}: ${batch.length} queued for deletion`);
      else console.warn(`  batch ${i / BATCH}: HTTP ${res.status}`);
    } catch (e) {
      console.warn(`  batch ${i / BATCH}: ${e}`);
    }
  }
  console.log('\nDone. Vectorize deletions are async — propagation may take a few minutes.');
}

main().catch((e) => { console.error(e); process.exit(1); });
