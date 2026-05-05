#!/usr/bin/env node
// Apply the deletions identified by reaudit-placeholders.mjs by reading the
// existing report (no re-probing). Edits collection JSONs in place,
// preserving HEAD's formatting (minified vs pretty), and posts the unique
// IDs to the worker's /delete-ids endpoint in 100-id batches.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const DATA_DIR = path.join(REPO_ROOT, 'public', 'data');
const REPORT_IN = path.join(REPO_ROOT, 'scripts', 'audit', 'reaudit-placeholders.json');
const SUMMARY_OUT = path.join(REPO_ROOT, 'scripts', 'audit', 'apply-reaudit-summary.json');
const WORKER_DELETE = 'https://armin-semantic-search.armin-art.workers.dev/delete-ids';
const BATCH = 100;

function headRaw(file) {
  try { return execSync(`git show HEAD:public/data/${file}`, { cwd: REPO_ROOT, maxBuffer: 1024 * 1024 * 1024 }).toString(); }
  catch { return ''; }
}

function detectFormat(raw) {
  const newlines = (raw.match(/\n/g) || []).length;
  if (newlines > 100) return /\n\t/.test(raw) ? 'tab' : 'pretty2';
  return 'minified';
}

function serialize(data, fmt, trailingNewline) {
  let s;
  if (fmt === 'pretty2') s = JSON.stringify(data, null, 2);
  else if (fmt === 'tab') s = JSON.stringify(data, null, '\t');
  else s = JSON.stringify(data);
  return trailingNewline ? s + '\n' : s;
}

async function main() {
  if (!fs.existsSync(REPORT_IN)) {
    console.error(`Missing ${REPORT_IN}. Run reaudit-placeholders.mjs first.`);
    process.exit(1);
  }
  const report = JSON.parse(fs.readFileSync(REPORT_IN, 'utf8'));
  console.log(`Loaded re-audit report: ${report.placeholderConfirmed} hits across ${report.perCollection.length} files.`);

  // Group by collection, skipping search-index-part
  const byCollection = new Map();
  for (const h of report.hits) {
    if (h.collection.startsWith('search-index')) continue;
    const list = byCollection.get(h.collection) || [];
    list.push(h);
    byCollection.set(h.collection, list);
  }
  console.log(`Will edit ${byCollection.size} collection JSON files (skipping search-index-part).`);

  const summary = [];
  for (const [file, hits] of byCollection) {
    const filePath = path.join(DATA_DIR, file);
    let data;
    try { data = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
    catch (e) { summary.push({ file, error: e.message, removed: 0 }); continue; }

    const headText = headRaw(file);
    const fmt = headText ? detectFormat(headText) : 'minified';
    const trailingNewline = headText.endsWith('\n');

    const removeIds = new Set(hits.map((h) => h.id));
    let arr, container, key;
    if (Array.isArray(data)) { arr = data; }
    else {
      key = ['objects', 'items', 'artworks', 'collection'].find((k) => Array.isArray(data[k]));
      if (!key) { summary.push({ file, error: 'no array key', removed: 0 }); continue; }
      arr = data[key];
      container = data;
    }
    const before = arr.length;
    const kept = arr.filter((it) => {
      const id = String(it?.id || it?.semanticId || it?.semantic_id || '');
      return !id || !removeIds.has(id);
    });
    const removed = before - kept.length;
    if (Array.isArray(data)) {
      fs.writeFileSync(filePath, serialize(kept, fmt, trailingNewline));
    } else {
      container[key] = kept;
      fs.writeFileSync(filePath, serialize(container, fmt, trailingNewline));
    }
    summary.push({ file, before, after: kept.length, removed, format: fmt });
    console.log(`  ${file.padEnd(46)} ${before} -> ${kept.length} (-${removed}, fmt=${fmt})`);
  }

  // Vectorize delete (all unique IDs, including those from search-index hits)
  const allIds = Array.from(new Set(report.hits.map((h) => h.id)));
  console.log(`\nDeleting ${allIds.length} unique IDs from Vectorize in batches of ${BATCH}...`);
  let okCount = 0, failCount = 0;
  for (let i = 0; i < allIds.length; i += BATCH) {
    const batch = allIds.slice(i, i + BATCH);
    try {
      const res = await fetch(WORKER_DELETE, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: batch }),
      });
      if (res.ok) { okCount += batch.length; if ((i / BATCH) % 5 === 0) console.log(`  batch ${i / BATCH}: ok (${okCount}/${allIds.length})`); }
      else { failCount += batch.length; console.warn(`  batch ${i / BATCH}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`); }
    } catch (e) { failCount += batch.length; console.warn(`  batch ${i / BATCH}: ${e}`); }
  }
  console.log(`\nVectorize: queued ${okCount} for deletion, ${failCount} failed. (Async — propagation may take minutes.)`);

  fs.writeFileSync(SUMMARY_OUT, JSON.stringify({
    appliedAt: new Date().toISOString(),
    perCollection: summary,
    vectorize: { queued: okCount, failed: failCount, totalUniqueIds: allIds.length },
  }, null, 2));
  console.log(`Wrote ${SUMMARY_OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
