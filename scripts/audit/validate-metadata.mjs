#!/usr/bin/env node
// Metadata quality validator — catches the lies a naive "field is non-empty" check misses.
// Usage:
//   node scripts/audit/validate-metadata.mjs                       # all *-collection.json
//   node scripts/audit/validate-metadata.mjs malba mathaf          # specific slugs
//
// Flags per collection:
//   - REAL fill rate (placeholder artists like "Anonymous" do NOT count as filled)
//   - placeholder-artist ratio   (≈100% ⇒ parser failed to extract artist at all)
//   - label-contamination        (a value contains another field's label, e.g. title="X Artist: Y")
//   - empty/junk titles, QID-as-title, filename-as-title
//   - duplicate imageUrl
// Exit code 1 if any collection has a BLOCKER (so it can gate a pipeline).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(fileURLToPath(import.meta.url), '../../..');
const DATA = path.join(REPO, 'public', 'data');

const PLACEHOLDER_ARTIST = /^(anonymous|unknown|unidentified|n\/?a|none|sin firma|sin autor|desconocido|no artist|artist unknown|-+)$/i;
// NOTE: "Untitled" / "Sin título" / "No Title" are LEGITIMATE museum-assigned titles for
// genuinely untitled works — NOT junk. Junk = empty, pure punctuation, N/A, QIDs, filenames.
const JUNK_TITLE = /^(n\/?a|none|-+|\?+|\.+)$/i;
// Collections where a >50% anonymous-artist ratio was MANUALLY VERIFIED as genuine
// (museum's own records carry no attribution), not a parser bug. pera-museum: Suna Kıraç
// Orientalist paintings + Ottoman photos — source JSON has no artist field for 63%;
// detail pages are JS-rendered with no additional attribution (checked 2026-06-11).
const VERIFIED_ANON = new Set(['pera-museum']);
const QID_TITLE = /^Q\d+$/;
const FILENAME_TITLE = /\.(jpg|jpeg|png|webp|tif)$/i;
// A value that accidentally swallowed another FIELD label (greedy-regex bug), e.g.
// title="The Red One Artist: Samia Halaby". Match only Capitalised field labels so that
// legitimate lowercase title text like "Portrait of the artist:" is NOT flagged.
// "Sin Título: A" (Spanish "Untitled: A") is a legitimate title — not contamination.
const LABEL_CONTAM = /\b(?<!Sin\s)(Artist|Date|Title|Medium|Technique|Dimensions?|Material|Técnica|Año|Título|Autor)\s*:\s*\S/;

function fill(s) { return s != null && String(s).trim().length > 0; }

function validate(slug, json) {
  const a = json.artworks || json.items || json.objects || [];
  const n = a.length;
  const issues = [];
  if (n === 0) { issues.push({ level: 'BLOCKER', msg: 'no artworks' }); return { slug, n, issues, real: {} }; }

  const cnt = {
    titleReal: 0, artistReal: 0, year: 0, category: 0, medium: 0, dim: 0,
    placeholderArtist: 0, junkTitle: 0, qidTitle: 0, filenameTitle: 0,
    contamTitle: 0, contamArtist: 0,
  };
  const imgSeen = new Map();
  for (const x of a) {
    const title = (x.title || '').trim();
    const artist = (x.artist || '').trim();
    if (fill(title) && !JUNK_TITLE.test(title)) cnt.titleReal++;
    if (JUNK_TITLE.test(title)) cnt.junkTitle++;
    if (QID_TITLE.test(title)) cnt.qidTitle++;
    if (FILENAME_TITLE.test(title)) cnt.filenameTitle++;
    if (fill(artist) && !PLACEHOLDER_ARTIST.test(artist)) cnt.artistReal++;
    if (PLACEHOLDER_ARTIST.test(artist)) cnt.placeholderArtist++;
    if (LABEL_CONTAM.test(title)) cnt.contamTitle++;
    if (LABEL_CONTAM.test(artist)) cnt.contamArtist++;
    if (x.year != null) cnt.year++;
    if (fill(x.category)) cnt.category++;
    if (fill(x.medium)) cnt.medium++;
    if (fill(x.dimensions)) cnt.dim++;
    const img = x.imageUrl || '';
    if (img) imgSeen.set(img, (imgSeen.get(img) || 0) + 1);
  }
  const dupImg = [...imgSeen.values()].filter(v => v > 1).length;
  const pct = v => Math.round((v / n) * 100);

  // --- rules ---
  // 4-must: title + artist + year + category must be REAL (placeholders don't count)
  if (cnt.titleReal < n) issues.push({ level: cnt.titleReal < n * 0.95 ? 'BLOCKER' : 'WARN', msg: `title real ${pct(cnt.titleReal)}% (${n - cnt.titleReal} junk/empty)` });
  if (cnt.placeholderArtist === n) issues.push({ level: 'BLOCKER', msg: `artist 100% placeholder — parser extracted ZERO real artists` });
  else if (cnt.placeholderArtist > n * 0.5) issues.push({ level: VERIFIED_ANON.has(slug) ? 'WARN' : 'BLOCKER', msg: `artist ${pct(cnt.placeholderArtist)}% placeholder — ${VERIFIED_ANON.has(slug) ? 'manually verified: museum source itself carries no attribution' : 'likely parser bug (verify against detail page)'}` });
  else if (cnt.placeholderArtist > n * 0.15) issues.push({ level: 'WARN', msg: `artist ${pct(cnt.placeholderArtist)}% placeholder — confirm these are genuinely anonymous` });
  if (cnt.contamTitle || cnt.contamArtist) issues.push({ level: 'BLOCKER', msg: `label contamination: ${cnt.contamTitle} titles + ${cnt.contamArtist} artists contain another field's label (greedy-regex bug)` });
  if (cnt.qidTitle) issues.push({ level: 'BLOCKER', msg: `${cnt.qidTitle} titles are raw QIDs (label fetch failed)` });
  if (cnt.filenameTitle) issues.push({ level: 'WARN', msg: `${cnt.filenameTitle} titles look like filenames` });
  if (cnt.year < n * 0.5) issues.push({ level: 'WARN', msg: `year ${pct(cnt.year)}% — verify site truly omits creation date` });
  if (cnt.category < n) issues.push({ level: 'BLOCKER', msg: `category ${pct(cnt.category)}% — must be 100%` });
  if (dupImg > 0) issues.push({ level: 'WARN', msg: `${dupImg} imageUrl values shared by >1 record` });

  return {
    slug, n, issues,
    real: { title: pct(cnt.titleReal), artist: pct(cnt.artistReal), year: pct(cnt.year), category: pct(cnt.category), medium: pct(cnt.medium), dim: pct(cnt.dim) },
  };
}

const slugs = process.argv.slice(2);
const files = (slugs.length
  ? slugs.map(s => `${s}-collection.json`)
  : fs.readdirSync(DATA).filter(f => /-collection\.json$/.test(f) && !f.includes('.bak')));

let hasBlocker = false;
for (const file of files) {
  const fp = path.join(DATA, file);
  if (!fs.existsSync(fp)) { console.log(`\n✗ ${file} — not found`); hasBlocker = true; continue; }
  let json; try { json = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (e) { console.log(`\n✗ ${file} — invalid JSON: ${e.message}`); hasBlocker = true; continue; }
  const r = validate(file.replace('-collection.json', ''), json);
  const blockers = r.issues.filter(i => i.level === 'BLOCKER');
  const warns = r.issues.filter(i => i.level === 'WARN');
  if (blockers.length) hasBlocker = true;
  const mark = blockers.length ? '✗ BLOCKER' : warns.length ? '△ WARN' : '✓ OK';
  console.log(`\n${mark}  ${r.slug}  (n=${r.n})`);
  console.log(`   REAL fill: title ${r.real.title}% · artist ${r.real.artist}% · year ${r.real.year}% · category ${r.real.category}% · medium ${r.real.medium}% · dim ${r.real.dim}%`);
  r.issues.forEach(i => console.log(`   ${i.level === 'BLOCKER' ? '✗' : '△'} ${i.msg}`));
}
console.log(`\n${hasBlocker ? '✗ BLOCKERS present — fix before registering/embedding.' : '✓ all collections passed.'}`);
process.exit(hasBlocker ? 1 : 0);
