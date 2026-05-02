#!/usr/bin/env node
// Audit collection-image URLs across every public/data/*-collection.json file.
//
// Phase 1 (HEAD pass): probes every artwork.image URL with a HEAD request,
// records status / content-length / etag in a resumable NDJSON checkpoint.
// Phase 2 (cluster):   groups successful probes by (host, content-length, etag);
// any signature that covers >= CLUSTER_THRESHOLD distinct artwork IDs is a
// placeholder-candidate (one image served under many names).
// Phase 3 (verify):    for each candidate cluster, downloads one sample, hashes
// it, records the SHA-256 alongside a sample artwork URL for human review.
// Phase 4 (report):    writes audit-report.json — per-collection counts, the
// full deletion candidate list, and the placeholder cluster signatures.
//
// Outputs (all in scripts/audit/):
//   - head-results.ndjson  resumable per-URL probe log
//   - audit-report.json    final classification (BROKEN / PLACEHOLDER / OK)
//
// Usage: node scripts/audit/audit-images.mjs [--resume] [--limit=N]

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';

const REPO_ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const DATA_DIR = path.join(REPO_ROOT, 'public', 'data');
const OUT_DIR = path.join(REPO_ROOT, 'scripts', 'audit');
const HEAD_LOG = path.join(OUT_DIR, 'head-results.ndjson');
const REPORT_FILE = path.join(OUT_DIR, 'audit-report.json');

const CONCURRENCY_DEFAULT = 24;
const PER_HOST_CONCURRENCY = { default: 6, 'pub-396fad1f96754c2f816f260faf970e63.r2.dev': 24 };
const HEAD_TIMEOUT_MS = 10_000;
const CLUSTER_THRESHOLD = 5;        // >=N IDs sharing a signature = candidate
const MAX_CLUSTER_VERIFY_BYTES = 2_000_000;

const args = new Set(process.argv.slice(2));
const RESUME = args.has('--resume');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : Infinity;
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY_FILES = onlyArg ? new Set(onlyArg.split('=')[1].split(',')) : null;

fs.mkdirSync(OUT_DIR, { recursive: true });

function loadCollections() {
  const files = fs.readdirSync(DATA_DIR).filter((f) => /-collection\.json$/.test(f));
  const tasks = [];
  const malformed = [];

  for (const file of files) {
    if (ONLY_FILES && !ONLY_FILES.has(file)) continue;
    const fullPath = path.join(DATA_DIR, file);
    let raw;
    try { raw = fs.readFileSync(fullPath, 'utf8'); }
    catch (e) { malformed.push({ file, error: `read: ${e.message}` }); continue; }

    let data;
    try { data = JSON.parse(raw); }
    catch (parseErr) {
      const idx = raw.indexOf('}{');
      if (idx > -1) {
        try {
          data = JSON.parse(raw.slice(idx + 1));
          malformed.push({ file, error: `concatenated JSON; using second blob` });
        } catch (e2) {
          malformed.push({ file, error: `parse: ${parseErr.message}` });
          continue;
        }
      } else {
        malformed.push({ file, error: `parse: ${parseErr.message}` });
        continue;
      }
    }

    const arr = Array.isArray(data) ? data : (data.objects || data.items || data.artworks || data.collection || []);
    for (const item of arr) {
      const url = item?.image || item?.imageUrl || item?.image_url || item?.i || '';
      const id = item?.id || item?.semanticId || item?.semantic_id || '';
      if (!url || !id) continue;
      tasks.push({ collection: file, id: String(id), url: String(url) });
      if (tasks.length >= LIMIT) return { tasks, malformed };
    }
  }

  return { tasks, malformed };
}

function loadCheckpoint() {
  const seen = new Set();
  if (!fs.existsSync(HEAD_LOG)) return seen;
  const text = fs.readFileSync(HEAD_LOG, 'utf8');
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row.collection && row.id) seen.add(`${row.collection}${row.id}`);
    } catch { /* skip malformed lines */ }
  }
  return seen;
}

function getHost(url) {
  try { return new URL(url).host; } catch { return ''; }
}

class HostLimiter {
  constructor() { this.active = new Map(); this.waiters = new Map(); }
  async acquire(host) {
    const max = PER_HOST_CONCURRENCY[host] ?? PER_HOST_CONCURRENCY.default;
    const cur = this.active.get(host) || 0;
    if (cur < max) { this.active.set(host, cur + 1); return; }
    await new Promise((resolve) => {
      const list = this.waiters.get(host) || [];
      list.push(resolve);
      this.waiters.set(host, list);
    });
    this.active.set(host, (this.active.get(host) || 0) + 1);
  }
  release(host) {
    this.active.set(host, Math.max(0, (this.active.get(host) || 0) - 1));
    const list = this.waiters.get(host);
    if (list && list.length) {
      const next = list.shift();
      this.waiters.set(host, list);
      next();
    }
  }
}

async function probe(task, limiter) {
  const host = getHost(task.url);
  await limiter.acquire(host);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HEAD_TIMEOUT_MS);
  let result;
  try {
    const res = await fetch(task.url, { method: 'HEAD', signal: ctrl.signal, redirect: 'follow' });
    result = {
      collection: task.collection,
      id: task.id,
      url: task.url,
      host,
      status: res.status,
      contentLength: Number(res.headers.get('content-length') || 0),
      etag: res.headers.get('etag') || '',
      contentType: res.headers.get('content-type') || '',
      ts: Date.now(),
    };
  } catch (err) {
    result = {
      collection: task.collection,
      id: task.id,
      url: task.url,
      host,
      status: 0,
      contentLength: 0,
      etag: '',
      contentType: '',
      error: err.name === 'AbortError' ? 'timeout' : (err.message || 'network'),
      ts: Date.now(),
    };
  } finally {
    clearTimeout(timer);
    limiter.release(host);
  }
  return result;
}

async function runHeadPass(tasks) {
  const seen = RESUME ? loadCheckpoint() : new Set();
  if (!RESUME && fs.existsSync(HEAD_LOG)) fs.unlinkSync(HEAD_LOG);

  const pending = tasks.filter((t) => !seen.has(`${t.collection}${t.id}`));
  console.log(`HEAD pass: ${pending.length} URLs to probe (${tasks.length - pending.length} resumed).`);

  const out = fs.createWriteStream(HEAD_LOG, { flags: 'a' });
  const limiter = new HostLimiter();
  const queue = pending.slice();
  let done = 0;
  let errors = 0;
  const startedAt = Date.now();

  async function worker() {
    while (queue.length) {
      const task = queue.shift();
      const result = await probe(task, limiter);
      out.write(JSON.stringify(result) + '\n');
      done++;
      if (result.status === 0 || result.status >= 400) errors++;
      if (done % 1000 === 0) {
        const elapsed = (Date.now() - startedAt) / 1000;
        const rate = done / elapsed;
        const eta = (queue.length / rate) | 0;
        console.log(`  ${done}/${pending.length} probed (${(100 * done / pending.length).toFixed(1)}%), ${errors} errors, ${rate.toFixed(1)}/s, ETA ${eta}s`);
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY_DEFAULT }, () => worker());
  await Promise.all(workers);
  await new Promise((res) => out.end(res));
  const elapsed = (Date.now() - startedAt) / 1000;
  console.log(`HEAD pass done. ${done} probed in ${elapsed.toFixed(0)}s (${errors} errors).`);
}

function readAllResults() {
  const rows = [];
  const text = fs.readFileSync(HEAD_LOG, 'utf8');
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return rows;
}

function clusterPlaceholders(results) {
  const groups = new Map();
  for (const r of results) {
    if (r.status !== 200) continue;
    if (!r.contentLength) continue;
    const key = `${r.host}|${r.contentLength}|${r.etag}`;
    const list = groups.get(key) || [];
    list.push(r);
    groups.set(key, list);
  }
  const candidates = [];
  for (const [signature, list] of groups) {
    if (list.length < CLUSTER_THRESHOLD) continue;
    const distinctIds = new Set(list.map((r) => r.id));
    if (distinctIds.size < CLUSTER_THRESHOLD) continue;
    candidates.push({ signature, count: list.length, distinctIds: distinctIds.size, samples: list.slice(0, 5), all: list });
  }
  candidates.sort((a, b) => b.count - a.count);
  return candidates;
}

async function verifyCluster(cluster) {
  const sampleUrl = cluster.samples[0]?.url;
  if (!sampleUrl) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HEAD_TIMEOUT_MS * 2);
  try {
    const res = await fetch(sampleUrl, { signal: ctrl.signal });
    if (!res.ok) return null;
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
      if (total > MAX_CLUSTER_VERIFY_BYTES) { ctrl.abort(); break; }
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    return { sampleUrl, byteLength: buf.length, sha256: sha };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function buildReport(results, candidates, malformed) {
  const perCollection = new Map();
  for (const r of results) {
    const c = perCollection.get(r.collection) || { ok: 0, broken: 0, placeholder: 0, total: 0, brokenIds: [], placeholderIds: [] };
    c.total++;
    if (r.status === 200) c.ok++;
    else { c.broken++; c.brokenIds.push(r.id); }
    perCollection.set(r.collection, c);
  }

  const placeholderIds = new Set();
  const placeholderById = new Map();
  for (const cand of candidates) {
    for (const r of cand.all) {
      const key = `${r.collection}${r.id}`;
      placeholderIds.add(key);
      placeholderById.set(key, cand.signature);
      const c = perCollection.get(r.collection);
      if (c) {
        c.placeholder++;
        c.ok = Math.max(0, c.ok - 1);
        c.placeholderIds.push(r.id);
      }
    }
  }

  const collectionsArr = Array.from(perCollection.entries())
    .map(([file, c]) => ({ file, ...c }))
    .sort((a, b) => (b.broken + b.placeholder) - (a.broken + a.placeholder));

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      collections: perCollection.size,
      probed: results.length,
      ok: results.filter((r) => r.status === 200).length - placeholderIds.size,
      broken: results.filter((r) => r.status !== 200).length,
      placeholder: placeholderIds.size,
    },
    malformedFiles: malformed,
    placeholderClusters: candidates.map((c) => ({
      signature: c.signature,
      count: c.count,
      distinctIds: c.distinctIds,
      verified: c.verified || null,
      sampleUrls: c.samples.slice(0, 3).map((s) => s.url),
    })),
    collections: collectionsArr,
  };
}

async function main() {
  console.log(`Audit starting. Data dir: ${DATA_DIR}`);
  const { tasks, malformed } = loadCollections();
  console.log(`Loaded ${tasks.length} tasks across ${new Set(tasks.map((t) => t.collection)).size} collections.`);
  if (malformed.length) console.log(`Malformed files: ${malformed.length}`, malformed);

  await runHeadPass(tasks);

  console.log('Reading checkpoint into memory...');
  const results = readAllResults();
  console.log(`Loaded ${results.length} probe results.`);

  console.log('Clustering for placeholder signatures...');
  const candidates = clusterPlaceholders(results);
  console.log(`Found ${candidates.length} candidate clusters (>=${CLUSTER_THRESHOLD} distinct IDs share a signature).`);

  console.log('Verifying top clusters with SHA-256 hash...');
  for (const cand of candidates.slice(0, 50)) {
    const v = await verifyCluster(cand);
    cand.verified = v;
    if (v) console.log(`  signature ${cand.signature}: ${cand.distinctIds} IDs, sha=${v.sha256.slice(0, 12)}..., ${v.byteLength}B`);
  }

  const report = buildReport(results, candidates, malformed);
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  console.log(`Wrote ${REPORT_FILE}`);
  console.log(JSON.stringify(report.totals, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
