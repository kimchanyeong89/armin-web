#!/usr/bin/env node
// Incremental gap-filler for public/data/i18n/museums.json.
//
// The initial build (build-museum-i18n.mjs) resolved 132/214 museums but a
// SPARQL ko-label batch evidently failed mid-run, dropping flagships (the Met,
// MoMA, Louvre, Uffizi, Art Institute…). This re-resolves ONLY museums that
// still lack name_ko and MERGES new authoritative hits into the sidecar —
// existing entries (including manual corrections) are never touched.
//
// Museums whose `name` is already Korean are skipped: getMuseumDisplayName
// falls back to `name`, so they already render Korean with no sidecar entry.
//
// `--dry` prints what would change without writing.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXHIBITIONS = pathToFileURL(path.join(__dirname, '../src/data/exhibitions.js')).href;
const OUT = path.join(__dirname, '../public/data/i18n/museums.json');
const DRY = process.argv.includes('--dry');

const WBSEARCH = 'https://www.wikidata.org/w/api.php';
const USER_AGENT = 'ArtCollectionBot/1.0 (https://github.com/armin; research)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hasHangul = (s) => /[가-힣]/.test(s);
const INSTITUTION_RE = /museum|gallery|galleria|galerie|galería|art\b|arts\b|collection|kunst|mus[ée]e|museo|museu|博物|美术|美術|미술관|박물관|foundation|fundaci|fondation|institute|institut|palace|palais|castle|castello|château|kremlin|library/i;
const cleanName = (n) => n.replace(/\s*\([^)]*\)\s*$/, '').trim();

async function wbsearch(name) {
  const params = new URLSearchParams({
    action: 'wbsearchentities', search: name, language: 'en', uselang: 'en',
    type: 'item', limit: '5', format: 'json', origin: '*',
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`${WBSEARCH}?${params}`, {
        headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000),
      });
      if (res.status === 429) { await sleep(30000 + attempt * 15000); continue; }
      if (!res.ok) throw new Error(`wbsearch ${res.status}`);
      const json = await res.json();
      return json.search || [];
    } catch (err) {
      if (attempt === 3) { console.warn(`  wbsearch failed for "${name}": ${err.message}`); return []; }
      await sleep(3000 * (attempt + 1));
    }
  }
  return [];
}

// Fetch ko labels via wbgetentities (the wbsearch endpoint). WDQS/SPARQL is
// flaky and rate-limits to empty results — wbgetentities is far more reliable
// and accepts up to 50 ids per call.
async function wbLabels(qids) {
  const map = {};
  const BATCH = 50;
  for (let i = 0; i < qids.length; i += BATCH) {
    const ids = qids.slice(i, i + BATCH).join('|');
    const params = new URLSearchParams({
      action: 'wbgetentities', ids, props: 'labels', languages: 'ko', format: 'json', origin: '*',
    });
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(`${WBSEARCH}?${params}`, {
          headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000),
        });
        if (res.status === 429) { await sleep(20000 + attempt * 15000); continue; }
        if (!res.ok) throw new Error(`wbgetentities ${res.status}`);
        const json = await res.json();
        for (const [q, e] of Object.entries(json.entities || {})) {
          const ko = e.labels && e.labels.ko && e.labels.ko.value;
          if (ko) map[q] = ko;
        }
        break;
      } catch (err) {
        if (attempt === 3) console.warn(`  wbgetentities failed: ${err.message}`);
        else await sleep(3000 * (attempt + 1));
      }
    }
    await sleep(500);
  }
  return map;
}

// wbsearch already ranks the real institution first; junk hits (exhibition
// catalogs, guidebooks, apps, regional namesakes) rarely carry a ko label.
// Require BOTH a ko label AND an institutional label/description — a wrong
// Korean name (a movie for "The Broad") is worse than an English fallback, so
// when nothing institutional is ko-labelled we leave it for Tier-2 instead.
function pickKoCandidate(hits, koMap) {
  const inst = hits.filter(
    (h) => koMap[h.id] && (INSTITUTION_RE.test(h.description || '') || INSTITUTION_RE.test(h.label || '')),
  );
  return inst[0] || null;
}

async function main() {
  const { exhibitions } = await import(EXHIBITIONS);
  const museums = exhibitions.filter((e) => e && e.name && typeof e.latitude === 'number');
  const sidecar = JSON.parse(fs.readFileSync(OUT, 'utf8'));

  // Targets: museums with no sidecar name_ko AND whose own name isn't already Korean.
  const targets = museums.filter((m) => !(sidecar[m.name] && sidecar[m.name].name_ko) && !hasHangul(m.name));
  const koNamed = museums.filter((m) => hasHangul(m.name)).length;
  console.log(`museums: ${museums.length} | already in sidecar: ${Object.keys(sidecar).length} | already Korean-named (skip): ${koNamed}`);
  console.log(`re-resolving ${targets.length} missing museums against Wikidata…\n`);

  // Phase 1: search each target and keep ALL hits (wbsearch ranks the real
  // institution first; we disambiguate by ko-label existence afterwards).
  const searched = []; // { name, hits }
  const allQids = new Set();
  for (let i = 0; i < targets.length; i++) {
    const hits = (await wbsearch(cleanName(targets[i].name))).filter((h) => /^Q\d+$/.test(h.id));
    searched.push({ name: targets[i].name, hits });
    hits.forEach((h) => allQids.add(h.id));
    if ((i + 1) % 10 === 0) console.log(`  searched ${i + 1}/${targets.length}`);
    await sleep(250);
  }

  // Phase 2: fetch ko labels for EVERY candidate QID in one batched pass.
  const uniqQids = [...allQids];
  console.log(`\nfetching ko labels for ${uniqQids.length} candidate QIDs via wbgetentities…`);
  const koMap = await wbLabels(uniqQids);
  console.log(`  got ${Object.keys(koMap).length} ko labels`);

  // Phase 3: per museum, pick the first ko-labelled (institutional) hit.
  const added = [];
  const stillMissing = [];
  for (const { name, hits } of searched) {
    const best = pickKoCandidate(hits, koMap);
    if (best) {
      sidecar[name] = { name_ko: koMap[best.id], wikiId: best.id, source: 'wikidata', matched_en: best.label };
      added.push(`${name} -> ${koMap[best.id]}  [${best.label}]`);
    } else {
      stillMissing.push(name);
    }
  }

  const sorted = Object.fromEntries(Object.keys(sidecar).sort().map((k) => [k, sidecar[k]]));
  if (!DRY) fs.writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n');

  console.log(`\n${DRY ? '[dry] would add' : 'added'} name_ko: ${added.length}`);
  added.forEach((a) => console.log(`  + ${a}`));
  console.log(`\nstill missing (${stillMissing.length}) — need Tier-2 transliteration:`);
  stillMissing.forEach((n) => console.log(`  - ${n}`));
}

main().catch((err) => { console.error(err); process.exit(1); });
