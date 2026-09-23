// Fills public/data/collection-covers.json — the first artwork of every standing
// collection, so a saved permanent collection has a picture without loading the
// whole collection file. Keeps what is already in the map and only adds what is
// missing (pass --rebuild to redo every entry).
//
//   node scripts/build-collection-covers.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exhibitions } from "../src/data/exhibitions.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COVERS = path.join(ROOT, "public/data/collection-covers.json");
const REBUILD = process.argv.includes("--rebuild");

const covers = JSON.parse(fs.readFileSync(COVERS, "utf8"));
const before = Object.keys(covers).length;

/** collectionFile comes as a bare file name or as a whole R2 URL. */
const fileNameOf = (value) => String(value || "").split("?")[0].split("/").pop() || "";

const IMAGE_FIELDS = ["image", "imageUrl", "i", "primaryImage", "thumbnail", "img", "url"];
const rowsOf = (data) => {
  if (Array.isArray(data)) return data;
  for (const key of ["artworks", "items", "data", "objects", "records"]) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
};
const imageOf = (row) => {
  for (const field of IMAGE_FIELDS) {
    const value = row?.[field];
    const url = typeof value === "string" ? value : value?.url || value?.src || value?.imageUrl || "";
    const raw = String(url || "").trim();
    if (/^https?:\/\//.test(raw) && !/default\.jpg$/i.test(raw)) return raw;
  }
  return "";
};

const wanted = new Map();
for (const museum of exhibitions) {
  for (const pe of museum.permanentExhibitions || []) {
    const name = fileNameOf(pe.collectionFile);
    if (name.endsWith(".json")) wanted.set(name, `${museum.id} · ${pe.id}`);
  }
}

let added = 0;
let empty = 0;
let absent = 0;
for (const [name, where] of wanted) {
  if (covers[name] && !REBUILD) continue;
  const file = path.join(ROOT, "public/data", name);
  if (!fs.existsSync(file)) {
    absent += 1;
    console.log(`  no local file  ${name}  (${where})`);
    continue;
  }
  try {
    const rows = rowsOf(JSON.parse(fs.readFileSync(file, "utf8")));
    const cover = rows.map(imageOf).find(Boolean) || "";
    if (cover) {
      covers[name] = cover;
      added += 1;
      console.log(`  + ${name} → ${cover.slice(0, 80)}`);
    } else {
      empty += 1;
      console.log(`  no image in   ${name}  (${rows.length} rows, ${where})`);
    }
  } catch (error) {
    console.log(`  unreadable    ${name}: ${error.message}`);
  }
}

fs.writeFileSync(COVERS, `${JSON.stringify(covers)}\n`);
const missing = [...wanted.keys()].filter((name) => !covers[name]);
console.log(`\ncollections referenced: ${wanted.size} · covers ${before} → ${Object.keys(covers).length} (+${added})`);
console.log(`still without a cover: ${missing.length}${missing.length ? ` (${missing.join(", ")})` : ""}`);
