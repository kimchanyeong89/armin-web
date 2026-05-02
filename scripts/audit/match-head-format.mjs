#!/usr/bin/env node
// For each affected JSON, detect HEAD's format (minified vs pretty 2-space)
// and re-write the current file to match. Keeps the diff focused on the
// actual entry deletions instead of formatting noise.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const FILES = [
  'ngprague-collection.json',
  'mmca-collection.json',
  'hayward-gallery-collection.json',
  'royal-academy-collection.json',
  'leopold-museum-collection.json',
  'albertina-permanent-collection.json',
  'macval-collection.json',
  'mucem-collection.json',
  'musee-chagall-collection.json',
  'musee-conde-collection.json',
  'museo-egizio-collection.json',
  'musee-guimet-collection.json',
  'petit-palais-collection.json',
  'louvre-painting-collection.json',
  'smb-humboldt-forum-collection.json',
  'versailles-collection.json',
  'pompidou-design-collection.json',
  'pompidou-painting-collection.json',
];

function headRaw(file) {
  try {
    return execSync(`git show HEAD:public/data/${file}`, { cwd: REPO_ROOT, maxBuffer: 1024 * 1024 * 1024 }).toString();
  } catch {
    return '';
  }
}

function detectFormat(raw) {
  // Newline-count heuristic: a multi-MB minified JSON has 0–10 newlines;
  // anything pretty-printed has thousands. The previous `\n  "` regex missed
  // array-of-object layouts where keys sit at 4-space indent (not 2).
  const newlines = (raw.match(/\n/g) || []).length;
  if (newlines > 100) {
    // Tab-indented files have \t after a newline at the start of object body.
    if (/\n\t/.test(raw)) return 'tab';
    return 'pretty2';
  }
  return 'minified';
}

for (const f of FILES) {
  const fullPath = path.join(REPO_ROOT, 'public', 'data', f);
  let current;
  try { current = JSON.parse(fs.readFileSync(fullPath, 'utf8')); }
  catch (e) { console.warn('skip', f, e.message); continue; }

  const headText = headRaw(f);
  const fmt = headText ? detectFormat(headText) : 'minified';
  let serialized;
  if (fmt === 'pretty2') serialized = JSON.stringify(current, null, 2);
  else if (fmt === 'tab') serialized = JSON.stringify(current, null, '\t');
  else serialized = JSON.stringify(current);

  // Trailing newline if HEAD had one
  if (headText.endsWith('\n')) serialized += '\n';

  fs.writeFileSync(fullPath, serialized);
  console.log(`${f}: HEAD=${fmt}, lines=${(serialized.match(/\n/g) || []).length}`);
}
