// Takes out of public/data/artist-portraits.json the pictures that are not the
// artist's face: a namesake's portrait, a work by the artist, a building, a map
// or a placeholder, or a "portrait" of a name that is not a person.
//
//   node scripts/audit-artist-portraits.mjs          # list what would go
//   node scripts/audit-artist-portraits.mjs --apply  # and take it out
//
// It judges by the picture's own file name — Commons names files after what
// they show — so it needs no network: a file has to carry the artist's name (or
// be written in the artist's own script, or say it is a portrait), and must not
// read as a catalogued or titled work.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { artistFileKey } from "../src/utils/artistKey.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public/data/artist-portraits.json");
const portraits = JSON.parse(fs.readFileSync(OUT, "utf8"));
const index = JSON.parse(fs.readFileSync(path.join(ROOT, "public/artists/_index.json"), "utf8"));
const dates = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/artists-dates.json"), "utf8"));

/* every name a key is known by */
const namesOf = new Map();
const note = (name) => {
  const key = artistFileKey(name);
  if (!key) return;
  if (!namesOf.has(key)) namesOf.set(key, new Set());
  namesOf.get(key).add(String(name));
};
for (const row of index) note(row?.a);
for (const [name, entry] of Object.entries(dates)) {
  note(name);
  if (entry?.name) note(entry.name);
}

const MARKS = new RegExp("[̀-ͯ]", "g");
const fold = (value) => String(value || "").normalize("NFD").replace(MARKS, "").toLowerCase();
/* Kändler is filed as "Kaendler", Østrup as "Oestrup" */
const foldSpelled = (value) => String(value || "").toLowerCase()
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
  .replace(/[øœ]/g, "oe").replace(/å/g, "aa").replace(/æ/g, "ae")
  .replace(/ij/g, "y");   /* Asselijn is filed as Asselyn */
const tokensOf = (value) => fold(value).split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 3);
const compact = (value) => String(value).replace(/[^\p{L}\p{N}]+/gu, "");

/* what a file of the artist's face tends to say: a portrait in some language, a
   photographer's credit, an archive of press photos, or the life dates in brackets */
const PORTRAIT = /portrait|portret|porträtt|portræt|self|selbst|autoportrait|autorretrato|autoritratto|zelfportret|retrato|ritratto|bildnis|photo|foto|headshot|cropped|\bby\b|brady|\bnara\b|\bbain\b|anefo|\(\d{4}\s*[-–]\s*\d{4}\)|born \d{4}|with (?:his|her) work|frente a|davant de/i;
/* what a file of a work tends to say: a catalogue number or a subject */
const WORK = /\bwga\d+|mauritshuis|kunsthistorisches|rijksmuseum|\bsk-[a-z]-\d|\bgg_\d|still[ _]life|stilleven|landscape|landschaft|landschap|landskap|seestück|seascape|flowers|bloemen|bloementuil|venus|adonis|martyrdom|sibyl|madonna|annunciation|crucifixion|tomb|forest|waldrand|winter|\bview\b|interior|interieur|church|kerk|synagogue|caricature|allegor|alegorij|nymph|bacchus|diana|cover_for/i;
const CATALOGUED = /^(met_dp|dp-?\d|brooklyn_museum|google_art_project|walters_|yale_|lacma|smithsonian|cleveland_museum|rijksmuseum_)/i;
const NOT_A_PERSON = /^(master of|the master|attributed|workshop|studio of|school of|circle of|follower|manner of|after |copy after|unknown|anonymous|anonym)|\b(painter|artist|sculptor|school|workshop|century|dynasty|period|culture|egyptian|roman|greek)\s*$/i;
const OWN_SCRIPT = /[぀-ヿ㐀-鿿가-힣Ѐ-ӿ]/;
/* a quoted title — not an apostrophe inside a name like d'Ache or D'Amato */
const QUOTED = /(^|[\s_(,])['‘"“«„][^'’"”»]{3,}['’"”»“]/;

function fileNameOf(value) {
  const raw = String(value || "");
  const last = raw.startsWith("http") ? raw.split("?")[0].split("/").pop() : raw;
  let name = last || "";
  try { name = decodeURIComponent(name); } catch { /* keep as is */ }
  return name.replace(/^\d+px-/, "");
}

const drops = [];
for (const [key, value] of Object.entries(portraits)) {
  const names = [...(namesOf.get(key) || [])];
  const file = fileNameOf(value);
  /* the name as folded, and as spelled out ("Kändler" and "Kaendler") */
  const nameTokens = [...new Set(names.flatMap((n) => [...tokensOf(n), ...tokensOf(foldSpelled(n))]))];
  const haystacks = [compact(fold(file)), compact(foldSpelled(file))];
  /* a file names the artist when any part of the name runs through it —
     "AntonMauve.jpg" and "Kaendler.J.J..jpg" as much as "Anton_Mauve.jpg" */
  const namesArtist = nameTokens.some((t) => t.length >= 4 && haystacks.some((h) => h.includes(t)))
    || nameTokens.some((t) => t.length === 3 && new Set(tokensOf(file)).has(t));
  /* "Alexandre_Perrier_-_L'aube_1892": the artist, a dash, then a title */
  const parts = file.split(/_-_| - /);
  const artistThenTitle = parts.length > 1
    && nameTokens.some((t) => t.length >= 4 && compact(fold(parts[0])).includes(t))
    && WORK.test(file)
    && !PORTRAIT.test(file);

  let why = "";
  if (names.length > 0 && names.every((n) => NOT_A_PERSON.test(String(n).trim()))) {
    why = "not a person";
  } else if (/\.svg(\.png)?$/i.test(file)) {
    why = "a drawing, map or placeholder";
  } else if (QUOTED.test(file) && !PORTRAIT.test(file)) {
    why = "a titled work";
  } else if (CATALOGUED.test(file) && !PORTRAIT.test(file)) {
    why = "a catalogued work";
  } else if (artistThenTitle) {
    why = "a work by the artist";
  } else if (nameTokens.length > 0 && !namesArtist && !OWN_SCRIPT.test(file) && !PORTRAIT.test(file)) {
    why = "does not name the artist";
  }
  if (why) drops.push({ key, name: names[0] || key, file, why });
}

const byReason = drops.reduce((acc, d) => ({ ...acc, [d.why]: (acc[d.why] || 0) + 1 }), {});
console.log(`${Object.keys(portraits).length} portraits; ${drops.length} would go`, byReason);
const show = Number(process.env.SHOW || 40);
const only = process.env.ONLY || "";
for (const d of drops.filter((x) => !only || x.why === only).slice(0, show)) {
  console.log(`  [${d.why}] ${d.name}  →  ${d.file.slice(0, 80)}`);
}

if (process.argv.includes("--apply")) {
  for (const d of drops) delete portraits[d.key];
  fs.writeFileSync(OUT, `${JSON.stringify(Object.fromEntries(Object.entries(portraits).sort()), null, 0)}\n`);
  const covered = index.filter((row) => portraits[artistFileKey(row.a)]).length;
  console.log(`removed ${drops.length}; ${Object.keys(portraits).length} left; index artists with a portrait: ${covered} of ${index.length} (${Math.round((covered / index.length) * 100)}%)`);
}
