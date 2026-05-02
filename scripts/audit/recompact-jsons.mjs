#!/usr/bin/env node
// Re-compact the placeholder-cleaned JSONs back to their original
// single-line minified format. The deletion script pretty-printed them,
// which produces an enormous git diff that masks the actual entry-level
// removals. Compact format → git diff shows only the structural change.

import fs from 'node:fs';
import path from 'node:path';

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

for (const f of FILES) {
  const p = path.join(REPO_ROOT, 'public', 'data', f);
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    fs.writeFileSync(p, JSON.stringify(data));
    console.log('compacted', f);
  } catch (e) {
    console.warn('skip', f, e.message);
  }
}
