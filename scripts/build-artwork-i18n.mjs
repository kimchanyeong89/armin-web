#!/usr/bin/env node
// Build authoritative Korean artwork TITLES from Wikidata.
//
// Strategy (high precision, "권위 데이터만" + "작가 QID 매칭"):
//   1. For each artist we know a Wikidata QID for (artists-dates.json, ~2,378),
//      fetch every artwork that artist CREATED (P170) which has a Korean label,
//      capturing its English label AND English aliases (skos:altLabel).
//   2. Match our corpus by SAME ARTIST (creator QID) + EXACT title (label or
//      alias). The artist constraint is what stops "Composition" by Mondrian
//      from grabbing some other "Composition".
//   3. Drop ambiguous keys: if one (artist, title) maps to >1 distinct Korean
//      label, DON'T translate it. This is the safeguard against the "김태→태연"
//      class of wrong match, at corpus scale.
//
// Tier-2 (title-only, no artist) is OFF — see ALLOW_TITLE_ONLY. In audit it
// produced semantic false matches ("Notre Dame, Paris"→a judge's portrait)
// because a short title being unique among ~1.8k ko works is a sampling
// artifact, not proof of the same work.
//
// Output: public/data/i18n/artwork-titles.json
//   { "<normArtist>\t<normTitle>": "<korean title>" }   // tab-separated key
// Keyed by normalized artist+title (not artwork id) so it works across the
// search index, collection files, and de-duplicates the same work across museums.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '../public/data');
const OUT_DIR = path.join(DATA, 'i18n');
const OUT = path.join(OUT_DIR, 'artwork-titles.json');
const STATE = path.join(__dirname, '.state');
const CACHE = path.join(STATE, 'artwork-wd-artist-sweep.json');
const AUDIT = path.join(STATE, 'artwork-i18n-audit.json');

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'ArtCollectionBot/1.0 (https://github.com/armin; research)';
const QID_BATCH = 120; // creator QIDs per SPARQL query

// Title-only (tier-2) matching is OFF: unreliable (see header). Flip on only
// with a much stronger disambiguator than "globally unique short title".
const ALLOW_TITLE_ONLY = false;
const GENERIC = new Set([
  'untitled', 'still life', 'landscape', 'portrait', 'self-portrait', 'self portrait',
  'composition', 'nude', 'study', 'seascape', 'figure', 'head', 'flowers', 'sketch',
  'no title', 'the artist', 'woman', 'man', 'interior', 'still-life', 'abstract',
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// MUST stay byte-identical to src/i18n/artworkLocalization.ts.
function normTitle(s) {
  return String(s || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[“”"'’`]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '')
    .trim();
}
function normName(s) {
  return String(s || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

async function sparql(query) {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' },
        signal: AbortSignal.timeout(120000),
      });
      if (res.status === 429) {
        const wait = 60000 + attempt * 30000;
        console.log(`  rate limited (429) — waiting ${wait / 1000}s`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`SPARQL status ${res.status}`);
      const json = await res.json();
      return json.results.bindings;
    } catch (err) {
      if (attempt === 3) throw err;
      await sleep(5000 * (attempt + 1));
    }
  }
  return [];
}

async function sweepByArtists(qids) {
  const byCreatorTitle = new Map(); // `${qid}\t${title}` -> Set<ko>
  const byTitle = new Map(); //        `${title}`         -> Set<ko>
  let rows = 0;
  const batches = Math.ceil(qids.length / QID_BATCH);
  for (let i = 0; i < qids.length; i += QID_BATCH) {
    const batch = qids.slice(i, i + QID_BATCH);
    const values = batch.map((q) => `wd:${q}`).join(' ');
    const query = `SELECT ?ko ?en ?alt ?creator WHERE {
  VALUES ?creator { ${values} }
  ?item wdt:P170 ?creator .
  ?item rdfs:label ?ko . FILTER(lang(?ko) = "ko")
  OPTIONAL { ?item rdfs:label ?en . FILTER(lang(?en) = "en") }
  OPTIONAL { ?item skos:altLabel ?alt . FILTER(lang(?alt) = "en") }
}`;
    const bindings = await sparql(query);
    for (const b of bindings) {
      const ko = b.ko?.value;
      const creator = b.creator?.value?.split('/').pop();
      if (!ko || !creator) continue;
      const titles = new Set();
      if (b.en?.value) titles.add(normTitle(b.en.value));
      if (b.alt?.value) titles.add(normTitle(b.alt.value));
      for (const t of titles) {
        if (!t) continue;
        const k = `${creator}\t${t}`;
        if (!byCreatorTitle.has(k)) byCreatorTitle.set(k, new Set());
        byCreatorTitle.get(k).add(ko);
        if (!byTitle.has(t)) byTitle.set(t, new Set());
        byTitle.get(t).add(ko);
        rows++;
      }
    }
    console.log(`  artist batch ${i / QID_BATCH + 1}/${batches} — rows so far: ${rows}`);
    await sleep(800);
  }
  console.log(`Wikidata artist-sweep: ${rows} rows | ${byCreatorTitle.size} (creator,title) keys | ${byTitle.size} titles`);
  return { byCreatorTitle, byTitle };
}

function buildArtistQidIndex() {
  const a = JSON.parse(fs.readFileSync(path.join(DATA, 'artists-dates.json'), 'utf8'));
  const idx = new Map(); // normName -> qid
  for (const [name, v] of Object.entries(a)) {
    const qid = v && typeof v === 'object' ? v.wikiId : null;
    if (!qid || !/^Q\d+$/.test(qid)) continue;
    idx.set(normName(name), qid);
  }
  return idx;
}
function resolveQid(idx, artist) {
  const n = normName(artist);
  if (!n) return null;
  if (idx.has(n)) return idx.get(n);
  if (artist.includes(',') && !artist.includes('(')) {
    const p = artist.split(',');
    if (p.length === 2) {
      const sw = idx.get(normName(`${p[1]} ${p[0]}`));
      if (sw) return sw;
    }
  }
  return null;
}

const SKIP_FILES = new Set([
  'artists-dates.json', 'museum-artwork-counts.json', 'emuseum-codes.json',
  'search-manifest.json', 'search-warm-prefix.json', 'video-embed-ids.json',
  'special-index.json',
]);

function listCorpusFiles() {
  const files = [];
  for (const f of fs.readdirSync(DATA)) {
    if (!f.endsWith('.json')) continue;
    if (SKIP_FILES.has(f)) continue;
    if (f.includes('.backup')) continue;
    files.push(path.join(DATA, f));
  }
  return files;
}

function* iterArtworks(file) {
  let d;
  try {
    d = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return;
  }
  const arr = Array.isArray(d) ? d : Object.values(d).find(Array.isArray);
  if (!Array.isArray(arr)) return;
  for (const a of arr) {
    if (!a || typeof a !== 'object') continue;
    const title = a.title || a.name || a.n;
    const artist = a.artist || a.a;
    if (typeof title === 'string' && typeof artist === 'string' && title.trim() && artist.trim()) {
      yield { title, artist };
    }
  }
}

async function main() {
  const useCache = process.argv.includes('--use-cache');
  const qidIdx = buildArtistQidIndex();
  const qids = [...new Set(qidIdx.values())];
  console.log(`artist QIDs: ${qids.length}`);

  let sweep;
  if (useCache && fs.existsSync(CACHE)) {
    console.log('using cached Wikidata sweep');
    const raw = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    sweep = {
      byCreatorTitle: new Map(raw.byCreatorTitle.map(([k, v]) => [k, new Set(v)])),
      byTitle: new Map(raw.byTitle.map(([k, v]) => [k, new Set(v)])),
    };
  } else {
    sweep = await sweepByArtists(qids);
    fs.mkdirSync(STATE, { recursive: true });
    fs.writeFileSync(
      CACHE,
      JSON.stringify({
        byCreatorTitle: [...sweep.byCreatorTitle].map(([k, v]) => [k, [...v]]),
        byTitle: [...sweep.byTitle].map(([k, v]) => [k, [...v]]),
      }),
    );
  }
  const { byCreatorTitle, byTitle } = sweep;

  const uniqueTitle = new Map();
  for (const [t, kos] of byTitle) {
    if (kos.size !== 1) continue;
    if (GENERIC.has(t) || t.length < 6) continue;
    uniqueTitle.set(t, [...kos][0]);
  }

  const out = {};
  const audit = { tier1: [], tier2: [], tier1Count: 0, tier2Count: 0, ambiguousSkipped: 0 };
  let scanned = 0;
  const seenKeys = new Set();

  for (const file of listCorpusFiles()) {
    for (const { title, artist } of iterArtworks(file)) {
      scanned++;
      const nt = normTitle(title);
      const na = normName(artist);
      if (!nt) continue;
      const key = `${na}\t${nt}`;
      if (out[key] || seenKeys.has(key)) continue;

      const qid = resolveQid(qidIdx, artist);
      if (qid) {
        const kos = byCreatorTitle.get(`${qid}\t${nt}`);
        if (kos) {
          if (kos.size > 1) {
            audit.ambiguousSkipped++;
          } else {
            const ko = [...kos][0];
            out[key] = ko;
            audit.tier1Count++;
            if (audit.tier1.length < 60) audit.tier1.push({ artist, title, ko });
            continue;
          }
        }
      }
      if (ALLOW_TITLE_ONLY) {
        const uko = uniqueTitle.get(nt);
        if (uko) {
          out[key] = uko;
          audit.tier2Count++;
          if (audit.tier2.length < 60) audit.tier2.push({ artist, title, ko: uko });
          continue;
        }
      }
      seenKeys.add(key);
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
  fs.writeFileSync(OUT, JSON.stringify(sorted, null, 0) + '\n');
  fs.mkdirSync(STATE, { recursive: true });
  fs.writeFileSync(AUDIT, JSON.stringify(audit, null, 2) + '\n');

  console.log(`\ncorpus (artist,title) pairs scanned: ${scanned}`);
  console.log(`matched: ${Object.keys(out).length}  (tier1 ${audit.tier1Count}, tier2 ${audit.tier2Count}, title-only ${ALLOW_TITLE_ONLY ? 'ON' : 'OFF'})`);
  console.log(`ambiguous (>1 ko) skipped: ${audit.ambiguousSkipped}`);
  console.log(`wrote ${OUT}`);
  console.log(`audit: ${AUDIT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
