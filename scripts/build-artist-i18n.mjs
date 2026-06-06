#!/usr/bin/env node
// Build authoritative Korean artist names from Wikidata.
//
// Reads public/data/artists-dates.json (keyed by artist name, ~3,115 entries,
// ~2,378 with a wikiId) and fetches each entity's Korean (ko) rdfs:label via
// batched SPARQL. Output: public/data/i18n/artists.json
//   { [artistName]: { name_ko, wikiId, source: "wikidata" } }
//
// Authoritative-first (Tier 1): only entries with a real ko label are written.
// Artists without a ko label are left out — they fall back to the original
// name in the UI, and can be filled later via ULAN / transliteration.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '../public/data/artists-dates.json');
const OUT_DIR = path.join(__dirname, '../public/data/i18n');
const OUT = path.join(OUT_DIR, 'artists.json');

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'ArtCollectionBot/1.0 (https://github.com/armin; research)';
const BATCH_SIZE = 300;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sparql(query) {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' },
        signal: AbortSignal.timeout(60000),
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

function qidToName(artists) {
  // wikiId may repeat across name variants — keep all names per qid.
  const map = new Map(); // qid -> [names]
  for (const [name, v] of Object.entries(artists)) {
    // Names already in Hangul need no KO translation. Worse, a few had wrong
    // wikiIds and matched same-spelled celebrities (김태→"태연"), so translating
    // them corrupts the map. The corpus's own Korean spelling is authoritative.
    if (/[가-힣]/.test(name)) continue;
    const qid = v && typeof v === 'object' ? v.wikiId : null;
    if (!qid || !/^Q\d+$/.test(qid)) continue;
    if (!map.has(qid)) map.set(qid, []);
    map.get(qid).push(name);
  }
  return map;
}

async function main() {
  const artists = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const qidMap = qidToName(artists);
  const qids = [...qidMap.keys()];
  console.log(`artists: ${Object.keys(artists).length} | with wikiId: ${qids.length}`);

  const result = {};
  let labeled = 0;

  for (let i = 0; i < qids.length; i += BATCH_SIZE) {
    const batch = qids.slice(i, i + BATCH_SIZE);
    const values = batch.map((q) => `wd:${q}`).join(' ');
    const query = `PREFIX wd: <http://www.wikidata.org/entity/>
SELECT ?item ?ko WHERE {
  VALUES ?item { ${values} }
  ?item rdfs:label ?ko . FILTER(lang(?ko) = "ko")
}`;
    const bindings = await sparql(query);
    for (const b of bindings) {
      const qid = b.item.value.split('/').pop();
      const ko = b.ko.value;
      for (const name of qidMap.get(qid) || []) {
        result[name] = { name_ko: ko, wikiId: qid, source: 'wikidata' };
        labeled++;
      }
    }
    console.log(`  batch ${i / BATCH_SIZE + 1}/${Math.ceil(qids.length / BATCH_SIZE)} — total ko labels so far: ${labeled}`);
    await sleep(1000);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const sorted = Object.fromEntries(Object.keys(result).sort().map((k) => [k, result[k]]));
  fs.writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`\nwrote ${OUT}`);
  console.log(`ko labels: ${labeled} / ${qids.length} with wikiId (${((labeled / qids.length) * 100).toFixed(1)}%)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
