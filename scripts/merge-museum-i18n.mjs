#!/usr/bin/env node
// Compile authoritative Korean museum names from the sidecar
//   public/data/i18n/museums.json   (source of truth, built by build-museum-i18n.mjs)
// INTO src/data/exhibitions.js as inline `name_ko` fields — mirroring the
// existing inline `name_en` convention that Korean museums already use.
//
// The sidecar stays authoritative; this just projects it into the directory
// source so getMuseumDisplayName() (which reads museum.name_ko) renders Korean
// everywhere with no runtime/code changes.
//
// Idempotent: skips museums that already have a name_ko line. Re-run after the
// sidecar changes. A `--dry` flag prints what would change without writing.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIDECAR = path.join(__dirname, '../public/data/i18n/museums.json');
const EXHIBITIONS = path.join(__dirname, '../src/data/exhibitions.js');
const DRY = process.argv.includes('--dry');

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeStr = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const sidecar = JSON.parse(fs.readFileSync(SIDECAR, 'utf8'));
let src = fs.readFileSync(EXHIBITIONS, 'utf8');

let injected = 0;
const skipped = [];
const notFound = [];

for (const [name, entry] of Object.entries(sidecar)) {
  const ko = entry && entry.name_ko;
  if (!ko) continue;
  // Only the top-level museum name line: `<indent>name: "<exact>",` on its own
  // line. Nested exhibition objects are inline (`{ id: ..., name: ... }`) so a
  // `name:` there never starts a line and cannot match.
  const re = new RegExp(`^([ \\t]*)name: "${escapeRe(name)}",[ \\t]*$`, 'm');
  const m = re.exec(src);
  if (!m) { notFound.push(name); continue; }
  const indent = m[1];
  const insertAt = m.index + m[0].length;
  const after = src.slice(insertAt);
  if (/^\s*name_ko:/.test(after)) { skipped.push(name); continue; } // already present
  src = src.slice(0, insertAt) + `\n${indent}name_ko: "${escapeStr(ko)}",` + after;
  injected++;
}

if (!DRY) fs.writeFileSync(EXHIBITIONS, src);

console.log(`${DRY ? '[dry] would inject' : 'injected'} name_ko: ${injected}`);
if (skipped.length) console.log(`skipped (already had name_ko): ${skipped.length}`);
if (notFound.length) {
  console.log(`\nNOT FOUND in exhibitions.js (${notFound.length}) — name mismatch, left to English fallback:`);
  notFound.forEach((n) => console.log(`  - ${n}`));
}
