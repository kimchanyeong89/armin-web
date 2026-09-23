// Builds public/data/artist-portraits.json — one picture of the artist (not of
// their work) per artist key, so a saved artist shows a face.
//
//   node scripts/build-artist-portraits.mjs              # from the data we already ship
//   node scripts/build-artist-portraits.mjs --wikidata   # and look the rest up on Wikidata
//   node scripts/build-artist-portraits.mjs --wikidata --wikipedia   # and on Wikipedia after that
//
// Keys come from src/utils/artistKey.js, the same key the static artist files
// and the app use. Values are Wikimedia Commons file names (the app builds the
// Special:FilePath URL and asks for the width it needs), or a whole URL when the
// source is not Commons.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { artistFileKey } from "../src/utils/artistKey.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public/data/artist-portraits.json");
const COMMONS = "https://commons.wikimedia.org/wiki/Special:FilePath/";
const UA = "COLLY-art-app/1.0 (artist portraits build; contact: kietzland@gmail.com)";

const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A Commons file name for the map, or the whole URL when it is somewhere else. */
function toValue(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.startsWith(COMMONS)) return raw.slice(COMMONS.length).split("?")[0];
  if (/^https?:\/\//.test(raw)) return raw;
  return "";
}

const portraits = {};
const add = (name, url) => {
  const key = artistFileKey(name);
  const value = toValue(url);
  if (!key || !value || portraits[key]) return false;
  portraits[key] = value;
  return true;
};

// ── what we already ship ────────────────────────────────────────────
const dates = read("public/data/artists-dates.json");
let fromDates = 0;
for (const [name, entry] of Object.entries(dates)) {
  if (entry && entry.imageUrl && add(entry.name || name, entry.imageUrl)) fromDates += 1;
}
console.log(`artists-dates.json: ${fromDates} portraits`);

// ── who is still missing ────────────────────────────────────────────
const index = read("public/artists/_index.json");
const missing = [];
const seen = new Set();
for (const row of index) {
  const name = row?.a;
  const key = artistFileKey(name);
  if (!name || !key || portraits[key] || seen.has(key)) continue;
  seen.add(key);
  missing.push({ name, key, wikiId: dates[name]?.wikiId || "" });
}
console.log(`artists in the index without a portrait: ${missing.length} of ${index.length}`);

if (!process.argv.includes("--wikidata")) {
  fs.writeFileSync(OUT, `${JSON.stringify(Object.fromEntries(Object.entries(portraits).sort()), null, 0)}\n`);
  console.log(`wrote ${Object.keys(portraits).length} portraits → public/data/artist-portraits.json`);
  process.exit(0);
}

// ── Wikidata, by id where we have one: exact, no name guessing ──────
const byId = missing.filter((m) => m.wikiId);
let fromIds = 0;
for (let i = 0; i < byId.length; i += 50) {
  const chunk = byId.slice(i, i + 50);
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${chunk.map((c) => c.wikiId).join("|")}&props=claims&format=json&origin=*`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    const data = await res.json();
    for (const entry of chunk) {
      const file = data?.entities?.[entry.wikiId]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
      if (file && add(entry.name, COMMONS + encodeURIComponent(String(file).replace(/ /g, "_")))) fromIds += 1;
    }
  } catch (error) {
    console.warn("wbgetentities failed", error.message);
  }
  process.stdout.write(`\r  by id: ${Math.min(i + 50, byId.length)}/${byId.length} → ${fromIds} found`);
  await sleep(200);
}
console.log();

// ── Wikidata, by name for the rest: people who are artists, with a picture ──
const ARTIST_OCCUPATIONS = ["Q1028181", "Q483501", "Q1281618", "Q33231", "Q11569986", "Q15296811", "Q329439", "Q644687"];
const byName = missing.filter((m) => !portraits[m.key]);
let fromNames = 0;
for (let i = 0; i < byName.length; i += 60) {
  const chunk = byName.slice(i, i + 60);
  const values = chunk.map((c) => `"${c.name.replace(/["\\]/g, "")}"@en`).join(" ");
  const sparql = `SELECT ?label ?img WHERE {
  VALUES ?label { ${values} }
  ?item rdfs:label ?label .
  ?item wdt:P31 wd:Q5 .
  ?item wdt:P106 ?occ .
  VALUES ?occ { ${ARTIST_OCCUPATIONS.map((q) => `wd:${q}`).join(" ")} }
  ?item wdt:P18 ?img .
}`;
  try {
    const res = await fetch("https://query.wikidata.org/sparql", {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/sparql-query", Accept: "application/sparql-results+json" },
      body: sparql,
    });
    if (res.ok) {
      const data = await res.json();
      for (const row of data?.results?.bindings || []) {
        if (add(row.label.value, row.img.value)) fromNames += 1;
      }
    } else {
      console.warn("\nsparql", res.status, (await res.text()).slice(0, 120));
    }
  } catch (error) {
    console.warn("\nsparql failed", error.message);
  }
  process.stdout.write(`\r  by name: ${Math.min(i + 60, byName.length)}/${byName.length} → ${fromNames} found`);
  await sleep(1200);
}
console.log();

// ── Wikipedia, for the artists Wikidata keeps no picture of ────────
let fromArticles = 0;
if (process.argv.includes("--wikipedia")) {
  const left = missing.filter((m) => !portraits[m.key]);
  for (let i = 0; i < left.length; i += 40) {
    const chunk = left.slice(i, i + 40);
    const titles = chunk.map((c) => c.name.replace(/\|/g, " ")).join("|");
    const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=thumbnail&pithumbsize=600&redirects=1&origin=*&titles=${encodeURIComponent(titles)}`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      const data = await res.json();
      // a page comes back under its normalized or redirected title: trace it home
      const home = new Map(chunk.map((c) => [c.name, c.name]));
      for (const step of [...(data?.query?.normalized || []), ...(data?.query?.redirects || [])]) {
        home.set(step.to, home.get(step.from) || step.from);
      }
      for (const page of Object.values(data?.query?.pages || {})) {
        const thumb = page?.thumbnail?.source;
        const name = home.get(page?.title) || page?.title;
        if (thumb && name && add(name, thumb)) fromArticles += 1;
      }
    } catch (error) {
      console.warn("\nwikipedia failed", error.message);
    }
    process.stdout.write(`\r  by article: ${Math.min(i + 40, left.length)}/${left.length} → ${fromArticles} found`);
    await sleep(300);
  }
  console.log();
}

fs.writeFileSync(OUT, `${JSON.stringify(Object.fromEntries(Object.entries(portraits).sort()), null, 0)}\n`);
console.log(`wrote ${Object.keys(portraits).length} portraits (${fromDates} shipped + ${fromIds} by id + ${fromNames} by name + ${fromArticles} by article) → public/data/artist-portraits.json`);
