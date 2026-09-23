// Builds every artist page's static data from the search index, so an artist
// with even one work has a page — on a phone, which never loads the full index,
// and on a desktop before the index is ready.
//
//   node scripts/build-artist-pages.mjs          # write
//   node scripts/build-artist-pages.mjs --dry    # count only
//
//   public/artists/<file>.json          artists with ≥ ARTIST_OWN_FILE_MIN works, one file each
//   public/artists/shards/<shard>.json  everyone else, 512 shared files of { key: works }
//   public/artists/_index.json          the search bar's artist list (the same artists as the own files)
//
// Keys, file names and shards come from src/utils/artistKey.js, the module the
// app looks them up with, so the two cannot drift apart. Works the app leaves
// out of an artist page (British Museum, Serpentine) are left out here too, so
// the count on a card and the count on the page are the same number.
//
// Run it after the search index is rebuilt (npm run prebuild writes the index).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARTIST_OWN_FILE_MIN,
  artistFileKey,
  artistFileName,
  artistShardOf,
  normalizeLookupText,
  prettifyArtistName,
} from "../src/utils/artistKey.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "public/data");
const OUT = path.join(ROOT, "public/artists");
const SHARDS = path.join(OUT, "shards");
const DRY = process.argv.includes("--dry");

const leftOut = (row) => {
  const museum = String(row.m || "").toLowerCase();
  const collection = String(row.e || "").toLowerCase();
  return museum.includes("serpentine gallery") || museum.includes("british museum")
    || collection.includes("serpentine") || collection.includes("british-museum") || collection.includes("bm-collection");
};

/* ── every work, under its artist ─────────────────────────────────── */
const manifest = JSON.parse(fs.readFileSync(path.join(DATA, "search-manifest.json"), "utf8"));
const byArtist = new Map();
let works = 0;
let skipped = 0;
for (const chunk of manifest.chunks) {
  const rows = JSON.parse(fs.readFileSync(path.join(DATA, chunk), "utf8"));
  for (const row of rows) {
    works += 1;
    if (leftOut(row)) { skipped += 1; continue; }
    const key = artistFileKey(row.a);
    if (!key) { skipped += 1; continue; }
    let entry = byArtist.get(key);
    if (!entry) { entry = { works: [], names: new Map() }; byArtist.set(key, entry); }
    const work = { id: row.id, n: row.n, a: row.a, i: row.i, d: row.d, m: row.m, e: row.e };
    if (row.c) work.c = row.c;
    entry.works.push(work);
    const shown = prettifyArtistName(row.a);
    entry.names.set(shown, (entry.names.get(shown) || 0) + 1);
  }
  process.stdout.write(`\r  read ${chunk} · ${works.toLocaleString()} works · ${byArtist.size.toLocaleString()} artists`);
}
console.log();

const own = [...byArtist].filter(([, e]) => e.works.length >= ARTIST_OWN_FILE_MIN);
const shared = [...byArtist].filter(([, e]) => e.works.length < ARTIST_OWN_FILE_MIN);
console.log(`${works.toLocaleString()} works, ${skipped.toLocaleString()} left out; ${byArtist.size.toLocaleString()} artists — ${own.length.toLocaleString()} with a file of their own, ${shared.length.toLocaleString()} in shards`);
if (DRY) process.exit(0);

/* ── files ────────────────────────────────────────────────────────── */
fs.mkdirSync(SHARDS, { recursive: true });
const written = new Set(["_index.json"]);
const nameCollisions = new Map();
for (const [key, entry] of own) {
  const file = `${artistFileName(key)}.json`;
  if (nameCollisions.has(file)) throw new Error(`two artists share ${file}: ${nameCollisions.get(file)} and ${key}`);
  nameCollisions.set(file, key);
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(entry.works));
  written.add(file);
}

const shards = new Map();
for (const [key, entry] of shared) {
  const shard = artistShardOf(key);
  if (!shards.has(shard)) shards.set(shard, {});
  shards.get(shard)[key] = entry.works;
}
const shardFiles = new Set();
for (const [shard, content] of shards) {
  fs.writeFileSync(path.join(SHARDS, `${shard}.json`), JSON.stringify(content));
  shardFiles.add(`${shard}.json`);
}

/* the search bar's list: the artists with a file, most works first */
const displayName = (entry) => [...entry.names].sort((a, b) => b[1] - a[1])[0][0];
const index = own
  .map(([key, entry]) => {
    const name = displayName(entry);
    return {
      k: key.replace(/_/g, " "),
      a: name,
      c: entry.works.length,
      i: entry.works.find((w) => w.i)?.i || "",
      s: normalizeLookupText(name),
    };
  })
  .sort((a, b) => b.c - a.c);
fs.writeFileSync(path.join(OUT, "_index.json"), JSON.stringify(index));

/* what an earlier build left that this one did not write */
let removed = 0;
for (const file of fs.readdirSync(OUT)) {
  if (!file.endsWith(".json") || written.has(file)) continue;
  fs.unlinkSync(path.join(OUT, file));
  removed += 1;
}
for (const file of fs.readdirSync(SHARDS)) {
  if (!shardFiles.has(file)) { fs.unlinkSync(path.join(SHARDS, file)); removed += 1; }
}

const bytes = (dir) => fs.readdirSync(dir).reduce((sum, f) => {
  const full = path.join(dir, f);
  return sum + (fs.statSync(full).isFile() ? fs.statSync(full).size : 0);
}, 0);
console.log(`wrote ${own.length.toLocaleString()} artist files (${(bytes(OUT) / 1048576).toFixed(0)} MB), ${shards.size} shards (${(bytes(SHARDS) / 1048576).toFixed(0)} MB), _index.json with ${index.length.toLocaleString()} artists; removed ${removed.toLocaleString()} stale files`);
