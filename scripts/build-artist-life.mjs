// The life line under an artist's name: born and died, for the artists
// public/data/artists-dates.json knows. That file is 6 MB because it carries
// every artist's pictures too, so the page reads this smaller one instead.
//
//   node scripts/build-artist-life.mjs
//
// Output: public/data/artist-life.json — { key: [born, died | 0] }, keyed the
// way src/utils/artistKey.js keys everything else about an artist.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { artistFileKey } from "../src/utils/artistKey.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dates = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/artists-dates.json"), "utf8"));

const yearOf = (value) => {
  const year = Number(String(value || "").slice(0, 4));
  return year >= 100 && year <= new Date().getFullYear() ? year : 0;
};

const life = {};
let skipped = 0;
for (const [name, entry] of Object.entries(dates)) {
  const key = artistFileKey(entry?.name || name);
  const born = yearOf(entry?.birthDate);
  if (!key || !born) { skipped += 1; continue; }
  const died = yearOf(entry?.deathDate);
  /* two artists on one key: keep the one with the fuller record */
  if (life[key] && !(died && !life[key][1])) continue;
  life[key] = [born, died];
}

const out = path.join(ROOT, "public/data/artist-life.json");
fs.writeFileSync(out, JSON.stringify(Object.fromEntries(Object.entries(life).sort())));
const withDeath = Object.values(life).filter(([, d]) => d).length;
console.log(`${Object.keys(life).length} artists (${withDeath} with a death year), ${skipped} without a usable birth year — ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
