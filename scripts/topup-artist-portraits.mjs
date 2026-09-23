// Tops up public/data/artist-portraits.json for the artists the first build
// missed. The first pass only matched exact English labels, so anyone catalogued
// as "REES, Lloyd", "Raoul DUFY" or "Johan Braakensiek (mentioned on object)"
// was left without a face.
//
//   node scripts/topup-artist-portraits.mjs            # everyone still missing
//   node scripts/topup-artist-portraits.mjs --limit 200
//   node scripts/topup-artist-portraits.mjs --match "[\u3400-\u9fff]"   # only names like these
//
// For each missing artist: search Wikidata by the cleaned-up name, then keep a
// candidate only when the entity is a human, has an artist's occupation and an
// image, and its label is the same name as ours. Whatever Wikidata has no
// picture of is asked of the Wikipedia article. The file is written as it goes,
// so the run can be stopped and started again.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { artistFileKey } from "../src/utils/artistKey.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public/data/artist-portraits.json");
const COMMONS = "https://commons.wikimedia.org/wiki/Special:FilePath/";
const UA = "COLLY-art-app/1.0 (artist portraits top-up; contact: kietzland@gmail.com)";
const ARTIST_OCCUPATIONS = new Set([
  "Q1028181", "Q483501", "Q1281618", "Q33231", "Q11569986", "Q15296811", "Q329439", "Q644687",
  "Q42973", "Q10862983", "Q1925963", "Q1114448", "Q16947657", "Q3391743",
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));

/** the name as a person would write it: no cataloguing qualifiers, no SHOUTING */
function cleanName(raw) {
  let name = String(raw || "").trim();
  name = name.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");
  name = name.replace(/\b(attributed to|after|circle of|studio of|workshop of|follower of|manner of|copy after|school of)\b/gi, " ");
  /* "Katsushika Hokusai 葛飾北斎": the romanised name is the one the English search knows */
  if (/[A-Za-z]{2,}/.test(name)) name = name.replace(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7a3]+/g, " ");
  name = name.replace(/\s+/g, " ").trim().replace(/[,;]$/, "");
  /* "REES, Lloyd" and "Monet, Claude" are one person written back to front */
  const parts = name.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 2 && !/\d/.test(parts[1])) name = `${parts[1]} ${parts[0]}`;
  /* a surname in capitals is the catalogue's habit, not the person's */
  name = name
    .split(" ")
    .map((word) => (word.length > 1 && word === word.toUpperCase() && /\p{L}/u.test(word)
      ? word[0] + word.slice(1).toLowerCase()
      : word))
    .join(" ");
  return name.trim();
}

const tokens = (value) => String(value || "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .split(/[^\p{L}\p{N}]+/u)
  .filter((t) => t.length > 1);

/** the same person, allowing for a middle name on one side only */
function sameName(a, b) {
  const x = new Set(tokens(a));
  const y = new Set(tokens(b));
  if (x.size === 0 || y.size === 0) return false;
  const small = x.size <= y.size ? x : y;
  const large = x.size <= y.size ? y : x;
  if (small.size < 2) return false;
  for (const token of small) if (!large.has(token)) return false;
  return true;
}

const portraits = JSON.parse(fs.readFileSync(OUT, "utf8"));
const index = read("public/artists/_index.json");
const before = Object.keys(portraits).length;

const missing = [];
const seen = new Set();
for (const row of index) {
  const key = artistFileKey(row?.a);
  if (!row?.a || !key || portraits[key] || seen.has(key)) continue;
  seen.add(key);
  missing.push({ raw: row.a, name: cleanName(row.a), key, count: row.c || 0 });
}
missing.sort((a, b) => b.count - a.count);

const limitArg = process.argv.indexOf("--limit");
const matchArg = process.argv.indexOf("--match");
/* --match <regex>: only the names a change to the cleaning affects */
const matching = matchArg > -1 ? missing.filter((m) => new RegExp(process.argv[matchArg + 1], "u").test(m.raw)) : missing;
const work = limitArg > -1 ? matching.slice(0, Number(process.argv[limitArg + 1]) || 100) : matching;
console.log(`${before} portraits so far; ${missing.length} artists without one; working through ${work.length}`);

const save = () => fs.writeFileSync(OUT, `${JSON.stringify(Object.fromEntries(Object.entries(portraits).sort()), null, 0)}\n`);
const value = (url) => {
  const raw = String(url || "").trim();
  if (raw.startsWith(COMMONS)) return raw.slice(COMMONS.length).split("?")[0];
  return /^https?:\/\//.test(raw) ? raw : "";
};

async function getJson(url, tries = 3) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      await sleep(500 * (attempt + 1));
    }
  }
  return null;
}

let found = 0;
let checked = 0;
const noPicture = [];

for (const artist of work) {
  checked += 1;
  if (artist.name.length < 3 || tokens(artist.name).length < 2) { continue; }

  /* 1 — who does Wikidata think this name is? */
  const search = await getJson(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&uselang=en&type=item&limit=5&origin=*&search=${encodeURIComponent(artist.name)}`,
  );
  const ids = (search?.search || []).map((hit) => hit.id).filter(Boolean);
  if (ids.length === 0) { noPicture.push(artist); await sleep(120); continue; }

  /* 2 — a human, an artist, with a picture, and the same name as ours */
  const entities = await getJson(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims|labels|aliases&languages=en&origin=*&ids=${ids.join("|")}`,
  );
  let picked = "";
  for (const id of ids) {
    const entity = entities?.entities?.[id];
    if (!entity) continue;
    const claims = entity.claims || {};
    const isHuman = (claims.P31 || []).some((c) => c?.mainsnak?.datavalue?.value?.id === "Q5");
    const isArtist = (claims.P106 || []).some((c) => ARTIST_OCCUPATIONS.has(c?.mainsnak?.datavalue?.value?.id));
    const image = claims.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!isHuman || !isArtist || !image) continue;
    const label = entity.labels?.en?.value || "";
    const aliases = (entity.aliases?.en || []).map((a) => a.value);
    if (![label, ...aliases].some((candidate) => sameName(candidate, artist.name))) continue;
    picked = COMMONS + encodeURIComponent(String(image).replace(/ /g, "_"));
    break;
  }

  if (picked) {
    portraits[artist.key] = value(picked);
    found += 1;
    console.log(`\n  ${artist.raw}  →  ${decodeURIComponent(value(picked)).slice(0, 60)}`);
    if (found % 50 === 0) save();
  } else {
    noPicture.push(artist);
  }

  if (checked % 25 === 0) {
    process.stdout.write(`\r  ${checked}/${work.length} · ${found} found · ${noPicture.length} still bare`);
  }
  await sleep(150);
}
save();
console.log(`\nWikidata: ${found} new portraits`);

/* 3 — the article's own picture, for whoever Wikidata keeps none of */
let fromArticles = 0;
for (let i = 0; i < noPicture.length; i += 40) {
  const chunk = noPicture.slice(i, i + 40).filter((a) => !portraits[a.key]);
  if (chunk.length === 0) continue;
  const titles = chunk.map((c) => c.name.replace(/\|/g, " ")).join("|");
  const data = await getJson(
    `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=thumbnail&pithumbsize=600&redirects=1&origin=*&titles=${encodeURIComponent(titles)}`,
  );
  const home = new Map(chunk.map((c) => [c.name, c]));
  for (const step of [...(data?.query?.normalized || []), ...(data?.query?.redirects || [])]) {
    const source = home.get(step.from);
    if (source) home.set(step.to, source);
  }
  for (const page of Object.values(data?.query?.pages || {})) {
    const thumb = page?.thumbnail?.source;
    const artist = home.get(page?.title);
    if (!thumb || !artist || portraits[artist.key]) continue;
    /* an article about a painting or a place is not a portrait of the painter */
    if (!sameName(page.title, artist.name)) continue;
    portraits[artist.key] = value(thumb);
    fromArticles += 1;
    console.log(`\n  ${artist.raw}  →  article: ${page.title}`);
  }
  process.stdout.write(`\r  by article: ${Math.min(i + 40, noPicture.length)}/${noPicture.length} → ${fromArticles} found`);
  if (fromArticles % 50 === 0) save();
  await sleep(200);
}
save();

const after = Object.keys(portraits).length;
const covered = index.filter((row) => portraits[artistFileKey(row.a)]).length;
console.log(`\n${after} portraits (${after - before} new: ${found} by Wikidata, ${fromArticles} by article)`);
console.log(`artists in the index with a portrait: ${covered} of ${index.length} (${Math.round((covered / index.length) * 100)}%)`);
