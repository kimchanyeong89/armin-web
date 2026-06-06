// Add Korean museum names (name_ko) for foreign-language-named venues that
// currently fall back to their raw French/English name in KO mode.
// Idempotent: skips any id that already has name_ko.
import fs from "fs";

const FILE = "src/data/exhibitions.js";

// Proper Korean names (translation where an established/clear name exists;
// phonetic transliteration only where no verified Korean name is available).
const NAME_KO = {
  // --- France ---
  "bourse-de-commerce-pinault-collection": "부르스 드 코메르스 — 피노 컬렉션",
  "musee-jacquemart-andre": "자크마르 앙드레 미술관",
  "maison-europeenne-de-la-photographie": "유럽 사진 미술관",
  "palais-des-beaux-arts-de-lille": "릴 미술관",
  "musee-granet": "그라네 미술관",
  "musee-des-beaux-arts-de-bordeaux": "보르도 미술관",
  "musee-armee": "앵발리드 군사 박물관",
  "macval": "문화유산·사진 미디어테크",
  "musee-chagall": "마르크 샤갈 국립미술관",
  "la-piscine": "라 피신 미술관",
  // --- USA ---
  "huntington-library": "헌팅턴 도서관·미술관",
  // --- Spain ---
  "dali-foundation": "달리 미술관",
  "caixaforum": "카이샤포룸",
  // --- South Korea (transliteration fallback; official KO name unverified) ---
  "house-of-refuge": "하우스 오브 레퓨지",
};

const src = fs.readFileSync(FILE, "utf8");

// Idempotency pre-scan: which ids already have name_ko?
const hasNameKo = new Set();
{
  const blocks = src.split(/^ {4}id:\s*["']/m);
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i];
    const id = b.match(/^([^"']+)["']/)[1];
    if (/\n {4}name_ko:/.test(b)) hasNameKo.add(id);
  }
}

const lines = src.split("\n");
const out = [];
const done = new Set();
const skipped = [];
const idRe = /^( {4})id:\s*["']([^"']+)["'],?\s*$/;

for (const line of lines) {
  out.push(line);
  const m = line.match(idRe);
  if (!m) continue;
  const id = m[2];
  if (done.has(id)) continue;
  if (!NAME_KO[id]) continue;
  if (hasNameKo.has(id)) { skipped.push(id); continue; }
  done.add(id);
  out.push(`    name_ko: ${JSON.stringify(NAME_KO[id])},`);
}

fs.writeFileSync(FILE, out.join("\n"));

console.log("inserted name_ko:", done.size);
for (const id of done) console.log("  +", id, "→", NAME_KO[id]);
if (skipped.length) console.log("skipped (already had name_ko):", skipped.join(", "));
const missing = Object.keys(NAME_KO).filter((id) => !done.has(id) && !skipped.includes(id));
if (missing.length) console.log("WARNING not found in file:", missing.join(", "));
