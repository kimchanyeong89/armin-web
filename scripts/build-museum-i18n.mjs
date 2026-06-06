#!/usr/bin/env node
// Build authoritative Korean museum names from Wikidata.
//
// Museums in src/data/exhibitions.js have NO wikiId, so this resolves each
// museum NAME -> Wikidata QID first (wbsearchentities), validates the hit is a
// cultural institution (description heuristic), then batch-fetches the ko label.
//
// Tier-1 authoritative-only: only museums with a confident match AND a real ko
// label are written. Output is a SIDECAR (does not mutate exhibitions.js):
//   public/data/i18n/museums.json
//   { [museumName]: { name_ko, wikiId, source: "wikidata", matched_en } }
//
// `matched_en` is recorded so the resolved entity can be spot-checked for
// mismatches before the data is wired into the UI.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXHIBITIONS = pathToFileURL(path.join(__dirname, '../src/data/exhibitions.js')).href;
const OUT_DIR = path.join(__dirname, '../public/data/i18n');
const OUT = path.join(OUT_DIR, 'museums.json');

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const WBSEARCH = 'https://www.wikidata.org/w/api.php';
const USER_AGENT = 'ArtCollectionBot/1.0 (https://github.com/armin; research)';
const BATCH_SIZE = 200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A hit is plausibly a cultural institution if its short description mentions one
// of these (covers en/fr/de/it/es/pt descriptions Wikidata returns).
const INSTITUTION_RE = /museum|gallery|galleria|galerie|galería|art\b|arts\b|collection|kunst|mus[ée]e|museo|museu|博物|美术|美術|미술관|박물관|foundation|fundaci|fondation|institute|institut/i;

const cleanName = (n) => n.replace(/\s*\([^)]*\)\s*$/, '').trim();

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9가-힣]+/g, ' ')
    .trim();

async function wbsearch(name) {
  const params = new URLSearchParams({
    action: 'wbsearchentities',
    search: name,
    language: 'en',
    uselang: 'en',
    type: 'item',
    limit: '5',
    format: 'json',
    origin: '*',
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`${WBSEARCH}?${params}`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 429) {
        await sleep(30000 + attempt * 15000);
        continue;
      }
      if (!res.ok) throw new Error(`wbsearch ${res.status}`);
      const json = await res.json();
      return json.search || [];
    } catch (err) {
      if (attempt === 3) {
        console.warn(`  wbsearch failed for "${name}": ${err.message}`);
        return [];
      }
      await sleep(3000 * (attempt + 1));
    }
  }
  return [];
}

async function sparqlKoLabels(qids) {
  const values = qids.map((q) => `wd:${q}`).join(' ');
  const query = `PREFIX wd: <http://www.wikidata.org/entity/>
SELECT ?item ?ko WHERE {
  VALUES ?item { ${values} }
  ?item rdfs:label ?ko . FILTER(lang(?ko) = "ko")
}`;
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' },
        signal: AbortSignal.timeout(60000),
      });
      if (res.status === 429) {
        await sleep(60000 + attempt * 30000);
        continue;
      }
      if (!res.ok) throw new Error(`SPARQL ${res.status}`);
      const json = await res.json();
      const map = {};
      for (const b of json.results.bindings) {
        map[b.item.value.split('/').pop()] = b.ko.value;
      }
      return map;
    } catch (err) {
      if (attempt === 3) throw err;
      await sleep(5000 * (attempt + 1));
    }
  }
  return {};
}

// Choose the best candidate: first hit (by search rank) that looks like an
// institution; prefer one whose label is similar to the cleaned name.
function pickCandidate(hits, cleaned) {
  const wantedTokens = new Set(norm(cleaned).split(' ').filter((t) => t.length >= 3));
  let institutional = hits.filter((h) => INSTITUTION_RE.test(h.description || '') || INSTITUTION_RE.test(h.label || ''));
  if (institutional.length === 0) institutional = hits; // fall back to raw rank
  // score by token overlap with the label
  let best = null;
  let bestScore = -1;
  institutional.forEach((h, i) => {
    const labelTokens = new Set(norm(h.label).split(' ').filter(Boolean));
    let overlap = 0;
    for (const t of wantedTokens) if (labelTokens.has(t)) overlap++;
    const score = overlap * 10 - i; // overlap dominates, rank breaks ties
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  });
  return best;
}

async function main() {
  const { exhibitions } = await import(EXHIBITIONS);
  const museums = exhibitions.filter((e) => e && e.name && typeof e.latitude === 'number');
  console.log(`museums: ${museums.length}`);

  // Phase 1: resolve name -> candidate QID
  const resolved = []; // { name, cleaned, qid, en }
  let searchHits = 0;
  for (let i = 0; i < museums.length; i++) {
    const m = museums[i];
    const cleaned = cleanName(m.name);
    const hits = await wbsearch(cleaned);
    const best = pickCandidate(hits, cleaned);
    if (best && /^Q\d+$/.test(best.id)) {
      resolved.push({ name: m.name, cleaned, qid: best.id, en: best.label, desc: best.description || '' });
      searchHits++;
    }
    if ((i + 1) % 25 === 0) console.log(`  resolved ${i + 1}/${museums.length} (qid hits: ${searchHits})`);
    await sleep(250);
  }
  console.log(`candidate QIDs: ${resolved.length}/${museums.length}`);

  // Phase 2: batch-fetch ko labels for the candidate QIDs
  const uniqQids = [...new Set(resolved.map((r) => r.qid))];
  const koMap = {};
  for (let i = 0; i < uniqQids.length; i += BATCH_SIZE) {
    const batch = uniqQids.slice(i, i + BATCH_SIZE);
    Object.assign(koMap, await sparqlKoLabels(batch));
    console.log(`  ko-label batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(uniqQids.length / BATCH_SIZE)}`);
    await sleep(1000);
  }

  // Phase 3: keep Tier-1 (has ko label), write sidecar
  const result = {};
  let labeled = 0;
  for (const r of resolved) {
    const ko = koMap[r.qid];
    if (!ko) continue;
    result[r.name] = { name_ko: ko, wikiId: r.qid, source: 'wikidata', matched_en: r.en };
    labeled++;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const sorted = Object.fromEntries(Object.keys(result).sort().map((k) => [k, result[k]]));
  fs.writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`\nwrote ${OUT}`);
  console.log(`ko labels: ${labeled}/${museums.length} museums (${((labeled / museums.length) * 100).toFixed(1)}%)`);
  console.log('\n--- spot-check sample (name -> name_ko [matched_en]) ---');
  Object.entries(sorted)
    .slice(0, 20)
    .forEach(([name, v]) => console.log(`  "${name}" -> ${v.name_ko}  [${v.matched_en}]`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
